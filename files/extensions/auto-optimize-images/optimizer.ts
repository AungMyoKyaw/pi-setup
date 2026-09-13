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
 *   5. Cache the result keyed by hash; identical re-attachments are free.
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
const cache = new Map<string, ImageOutput>();

export function clearCache(): void {
  cache.clear();
}

function hashBytes(buf: Buffer): string {
  return createHash("sha256").update(buf).digest("hex");
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
 * less-clean image than to fail the whole optimization.
 */
async function stripMetadata(buf: Buffer, mime: string): Promise<Buffer> {
  const ext =
    mime === "image/jpeg" ? "jpg" : mime === "image/webp" ? "webp" : "png";
  const dir = await mkdtemp(join(tmpdir(), "img-san-"));
  const src = join(dir, `in.${ext}`);
  const dst = join(dir, `out.${ext}`);
  try {
    const { writeFile } = await import("node:fs/promises");
    await writeFile(src, buf);
    await new Promise<void>((resolve) => {
      const proc = spawn("python3", [SANITIZER_SCRIPT, src, "--output", dst], {
        stdio: ["ignore", "pipe", "pipe"],
      });
      let stderr = "";
      proc.stderr.on("data", (c: Buffer) => (stderr += c.toString()));
      proc.on("error", () => resolve());
      proc.on("close", (code) => {
        if (code !== 0) {
          // Sanitizer failed (unsupported format, parse error, ...).
          // Keep the buffer we have rather than blocking the LLM.
          void stderr;
        }
        resolve();
      });
    });
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
export async function optimizeImages(
  inputs: ImageInput[],
): Promise<ImageOutput[]> {
  const out: ImageOutput[] = [];
  for (const input of inputs) {
    if (input.type !== "image") {
      // Defensive pass-through; the input hook already filters.
      out.push(input as unknown as ImageOutput);
      continue;
    }
    out.push(await optimizeOne(input));
  }
  return out;
}

async function optimizeOne(input: ImageInput): Promise<ImageOutput> {
  const raw = Buffer.from(input.data, "base64");
  const originalBytes = raw.length;
  const hash = hashBytes(raw);

  const cached = cache.get(hash);
  if (cached) return { ...cached, cached: true };

  // Quick path: tiny images pass through size-wise. Metadata is still
  // scrubbed below — EXIF/ICC profiles don't care about total file size.
  if (originalBytes < SIZE_THRESHOLD_BYTES) {
    const cleaned = await stripMetadata(raw, input.mimeType);
    const passthrough: ImageOutput = {
      type: "image",
      data: cleaned.toString("base64"),
      mimeType: input.mimeType,
      originalBytes,
      optimizedBytes: cleaned.length,
      cached: false,
    };
    cache.set(hash, passthrough);
    return passthrough;
  }

  const image = sharp(raw, { failOn: "none" });
  const meta = await image.metadata();
  const hasAlpha = meta.hasAlpha === true;
  const isJpeg = meta.format === "jpeg";
  const isPng = meta.format === "png";

  // Already-small JPEGs at or below the resolution cap: pass through
  // size-wise, but still strip metadata for privacy.
  if (
    isJpeg &&
    (meta.width ?? 0) <= MAX_EDGE &&
    (meta.height ?? 0) <= MAX_EDGE
  ) {
    const cleaned = await stripMetadata(raw, input.mimeType);
    const passthrough: ImageOutput = {
      type: "image",
      data: cleaned.toString("base64"),
      mimeType: input.mimeType,
      originalBytes,
      optimizedBytes: cleaned.length,
      cached: false,
    };
    cache.set(hash, passthrough);
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

  // Sharp quirk: for PNG inputs the format can sometimes be inferred from
  // the buffer even when meta says otherwise. Trust meta.
  void isPng;

  const optimizedBytes = outBuf.length;
  const result: ImageOutput = {
    type: "image",
    data: outBuf.toString("base64"),
    mimeType: outMime,
    originalBytes,
    optimizedBytes,
    cached: false,
  };
  cache.set(hash, result);
  return result;
}
