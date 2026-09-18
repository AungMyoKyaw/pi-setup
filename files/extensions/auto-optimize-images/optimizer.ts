/**
 * Image optimizer for the auto-optimize-images extension.
 *
 * Pipeline:
 *   1. Hash input bytes (SHA-256) for caching and idempotency.
 *   2. Decode via sharp to inspect metadata (alpha channel, format, size).
 *   3. If below the size threshold AND already a small format, pass through.
 *   4. Otherwise:
 *      - Resize so the longer edge <= MAX_EDGE, keeping aspect ratio.
 *      - Choose output format: JPEG (q=85) when no alpha, else PNG.
 *      - Strip all metadata.
 *   5. Cache the result under BOTH the input hash AND the output hash, so
 *      identical re-attachments AND the post-optimization re-pass through
 *      the context hook are both free.
 *   6. Single-flight concurrent calls with identical bytes share one
 *      in-flight pipeline run.
 *
 * Designed for LLM-bound images, not for archival. Quality is tuned so the
 * model still sees the same visual content with ~25x smaller bytes.
 */

import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";

export type ImageInput = {
  type: "image";
  data: string; // base64
  mimeType: string;
};

export type ImageOutput = ImageInput & {
  originalBytes: number;
  optimizedBytes: number;
  cached: boolean;
};

// Anything below this in bytes is left alone — already cheap to send.
const SIZE_THRESHOLD_BYTES = 100 * 1024; // 100 KB
const MAX_EDGE = 1568; // Claude's recommended max image edge for vision
const JPEG_QUALITY = 85;

// Path to the metadata sanitizer. Resolves $HOME so it works in any context.
const SANITIZER_SCRIPT = `${process.env.HOME ?? "/root"}/.agents/skills/image-metadata-sanitizer/scripts/sanitize_image.py`;

// Module-level cache so re-attaching the same image in one session is free.
// Survives only as long as the process; a fresh session re-encodes. That's
// fine — disk caching would just trade complexity for tiny CPU savings.
//
// Each result is stored under BOTH the input hash (H_raw) and the output
// hash (H_opt). The input hook caches under H_raw; the context hook then
// processes the message that already contains the optimized bytes (whose
// hash is H_opt, different from H_raw). Caching under both keys makes that
// follow-up a cache hit too, so the context hook is effectively a no-op
// for any image the input hook has already touched.
const cache = new Map<string, ImageOutput>();

// Single-flight: when two callers ask for the same bytes simultaneously,
// share one pipeline run instead of doing it twice and racing on cache.set.
const inflight = new Map<string, Promise<ImageOutput>>();

export function clearCache(): void {
  cache.clear();
  // Cancel inflight? No — let them complete; they'll just write to the
  // cleared cache. That's fine for tests.
  inflight.clear();
}

function hashBytes(buf: Buffer): string {
  return createHash("sha256").update(buf).digest("hex");
}

// ─── Warning routing ───────────────────────────────────────────────────────
// Sanitizer failures are surfaced once per session through a registered
// handler. The default handler logs to stderr; the index.ts hook installs
// a handler that also notifies via ctx.ui.notify when the TUI is up.

type WarningHandler = (msg: string) => void;

let warningHandler: WarningHandler = (msg) => {
  console.warn(`[auto-optimize-images] ${msg}`);
};

/** Override the warning sink. Returns the previous handler so the test
 *  suite can restore it. */
export function setWarningHandler(fn: WarningHandler): WarningHandler {
  const prev = warningHandler;
  warningHandler = fn;
  return prev;
}

const warnedReasons = new Set<string>();

function warnOnce(reason: string): void {
  if (warnedReasons.has(reason)) return;
  warnedReasons.add(reason);
  warningHandler(reason);
}

/** Test-only: reset the one-shot reasons so each test gets a fresh slate. */
export function _resetWarnings(): void {
  warnedReasons.clear();
}

/**
 * Strip every kind of metadata we know about: EXIF, IPTC, XMP, ICC profile,
 * C2PA/caBX, JPEG COM, JUMBF, etc. We shell out to the standard-library
 * sanitize_image.py instead of re-implementing chunk parsers — it covers
 * PNG, JPEG, and WebP and is validated by a focused test suite.
 *
 * Why not just `.withMetadata()` away? Sharp strips EXIF/IPTC/XMP by default
 * for re-encoded images, but it leaves ICC profiles alone in some configs and
 * doesn't know about C2PA/caBX/JUMBF at all. The sanitizer is exhaustive.
 *
 * On failure we fall back to the input buffer — better to ship a slightly
 * less-clean image than to fail the whole optimization. The failure is
 * surfaced once per session via warnOnce().
 */
async function stripMetadata(buf: Buffer, mime: string): Promise<Buffer> {
  const ext = mime === "image/jpeg" ? "jpg" : mime === "image/webp" ? "webp" : "png";
  const dir = await mkdtemp(join(tmpdir(), "img-san-"));
  const src = join(dir, `in.${ext}`);
  const dst = join(dir, `out.${ext}`);
  try {
    const { writeFile } = await import("node:fs/promises");
    await writeFile(src, buf);
    let exitCode: number | null = null;
    let spawnError: Error | null = null;
    await new Promise<void>((resolve) => {
      const proc = spawn("python3", [SANITIZER_SCRIPT, src, "--output", dst], {
        stdio: ["ignore", "pipe", "pipe"],
      });
      let stderr = "";
      proc.stderr.on("data", (c: Buffer) => (stderr += c.toString()));
      proc.on("error", (err) => {
        spawnError = err;
        resolve();
      });
      proc.on("close", (code) => {
        exitCode = code;
        if (code !== 0) {
          // Sanitizer failed (unsupported format, parse error, ...).
          // Keep the buffer we have rather than blocking the LLM.
          void stderr;
        }
        resolve();
      });
    });
    if (spawnError) {
      warnOnce(
        `metadata sanitizer: python3 unavailable — ${String(spawnError)}. ` +
          `Images will keep their original metadata. Install python3 or ` +
          `restore $HOME/.agents/skills/image-metadata-sanitizer/ to re-enable stripping.`,
      );
    } else if (exitCode !== 0) {
      warnOnce(
        `metadata sanitizer exited with code ${exitCode}. Images will keep ` +
          `their original metadata this session.`,
      );
    }
    // The script writes the sanitized file at `dst`. Read it back.
    try {
      return await readFile(dst);
    } catch {
      return buf;
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/**
 * Optimize a batch of images. Non-image entries are passed through untouched
 * (the caller — the input hook — should pre-filter, but we defend anyway).
 */
export async function optimizeImages(inputs: ImageInput[]): Promise<ImageOutput[]> {
  return Promise.all(inputs.map((input) => optimizeOne(input)));
}

async function optimizeOne(input: ImageInput): Promise<ImageOutput> {
  if (input.type !== "image") {
    // Defensive pass-through; the input hook already filters.
    return input as unknown as ImageOutput;
  }
  const raw = Buffer.from(input.data, "base64");
  const originalBytes = raw.length;
  const hash = hashBytes(raw);

  // Cache hit: free return.
  const cached = cache.get(hash);
  if (cached) return { ...cached, cached: true };

  // Single-flight: dedupe concurrent calls for identical bytes.
  const existing = inflight.get(hash);
  if (existing) {
    // Another caller started the pipeline. From this caller's perspective
    // it's a cache hit (no work happened on this call), so mark it as such.
    // Without this override, the notification gate would double-count when
    // the same image appears twice in one submit.
    return existing.then((r) => ({ ...r, cached: true }));
  }

  const promise = runPipeline(raw, originalBytes, hash, input.mimeType);
  inflight.set(hash, promise);
  try {
    return await promise;
  } finally {
    inflight.delete(hash);
  }
}

async function runPipeline(
  raw: Buffer,
  originalBytes: number,
  hash: string,
  mime: string,
): Promise<ImageOutput> {
  // Quick path: tiny images pass through size-wise. Metadata is still
  // scrubbed below — EXIF/ICC profiles don't care about total file size.
  if (originalBytes < SIZE_THRESHOLD_BYTES) {
    const cleaned = await stripMetadata(raw, mime);
    const passthrough: ImageOutput = {
      type: "image",
      data: cleaned.toString("base64"),
      mimeType: mime,
      originalBytes,
      optimizedBytes: cleaned.length,
      cached: false,
    };
    storeResult(passthrough, hash);
    return passthrough;
  }

  const image = sharp(raw, { failOn: "none" });
  const meta = await image.metadata();
  const hasAlpha = meta.hasAlpha === true;
  const isJpeg = meta.format === "jpeg";

  // Already-small JPEGs at or below the resolution cap: pass through
  // size-wise, but still strip metadata for privacy.
  if (isJpeg && (meta.width ?? 0) <= MAX_EDGE && (meta.height ?? 0) <= MAX_EDGE) {
    const cleaned = await stripMetadata(raw, mime);
    const passthrough: ImageOutput = {
      type: "image",
      data: cleaned.toString("base64"),
      mimeType: mime,
      originalBytes,
      optimizedBytes: cleaned.length,
      cached: false,
    };
    storeResult(passthrough, hash);
    return passthrough;
  }

  // Decide target format. JPEG wins when there's no transparency — much
  // smaller at equivalent visual quality for natural images.
  let outBuf: Buffer;
  let outMime: string;
  const pipeline = sharp(raw, { failOn: "none" }).resize({
    width: MAX_EDGE,
    height: MAX_EDGE,
    fit: "inside",
    withoutEnlargement: true,
  });

  if (!hasAlpha) {
    outBuf = await pipeline
      .flatten({ background: { r: 255, g: 255, b: 255 } })
      .jpeg({ quality: JPEG_QUALITY, mozjpeg: true })
      // No .withMetadata() — sharp strips EXIF/IPTC/XMP by default.
      .toBuffer();
    outMime = "image/jpeg";
  } else {
    outBuf = await pipeline
      .png({ compressionLevel: 9, palette: true })
      // Same: default strips metadata.
      .toBuffer();
    outMime = "image/png";
  }

  // Final pass: scrub any remaining metadata. Sharp drops EXIF/IPTC/XMP for
  // re-encoded outputs but may keep ICC profiles in some configs and
  // doesn't know about C2PA/caBX/JUMBF. The sanitizer handles all of them.
  outBuf = await stripMetadata(outBuf, outMime);

  const optimizedBytes = outBuf.length;
  const result: ImageOutput = {
    type: "image",
    data: outBuf.toString("base64"),
    mimeType: outMime,
    originalBytes,
    optimizedBytes,
    cached: false,
  };
  storeResult(result, hash);
  return result;
}

/**
 * Store a result under both the input hash (already in `hash`) and the
 * output hash. Caching under the output hash means the context hook's
 * follow-up call with already-optimized bytes hits the cache instead of
 * re-running the pipeline.
 */
function storeResult(result: ImageOutput, inputHash: string): void {
  cache.set(inputHash, result);
  // Compute the output hash only when it might differ. Pass-through outputs
  // (small / small-jpeg) keep the same bytes, so the output hash equals
  // the input hash and we'd be overwriting the same entry — skip.
  const outBytes = Buffer.from(result.data, "base64");
  const outHash = hashBytes(outBytes);
  if (outHash !== inputHash) cache.set(outHash, result);
}
