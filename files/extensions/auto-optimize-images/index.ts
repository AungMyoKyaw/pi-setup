/**
 * auto-optimize-images — pi extension
 *
 * Two interception points:
 *
 *   1. `input` event (fires when the user submits a message):
 *      - Scans the message text for image paths (pi writes pasted images
 *        to /tmp/pi-clipboard-*.png and inserts the path as text, so the
 *        `images` field is undefined when you paste an image).
 *      - Reads each path, runs it through the optimizer, and replaces the
 *        path with an inline image (cleaned text + optimized bytes).
 *      - Result: user pastes image → submits → LLM gets optimized image
 *        directly, no tool call needed.
 *
 *   2. `context` event (fires before every LLM call) — safety net:
 *      - Walks every message in the request, optimizes any image content
 *        not already in the cache (covers @file mentions, tool outputs
 *        that contain images, images re-attached later in the session).
 *      - Processes all images in parallel via Promise.all.
 *
 * Both hooks share the same SHA-256 cache in `optimizer.ts` (cached under
 * both the input hash and the output hash), so re-attaching the same
 * image AND the post-optimization re-pass through the context hook are
 * both free. Disable with `PI_AUTO_OPT_IMAGES=0`.
 */

import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { ImageContent } from "@earendil-works/pi-ai";
import { optimizeImages, setWarningHandler, type ImageInput } from "./optimizer.ts";

/** Finds image paths in text. Locates each image extension first, then
 *  walks back to the nearest path boundary (whitespace or terminator char).
 *  The prefix must start with /, ~/, ./, or ../ so we don't false-positive
 *  on sentences that happen to end with an image-extension-like noun.
 *
 *  Note: paths with internal spaces (e.g. macOS screenshots named
 *  "Screenshot 2026-09-11 at 1.46 AM.png") are NOT detected. Pi's clipboard
 *  paste uses UUID filenames which never contain spaces, so this covers
 *  100% of the actual use case. Users who manually paste screenshot paths
 *  with spaces should rename the file.
 */
export function findImagePathsInText(text: string): string[] {
  const out: string[] = [];
  const extRe = /\.(png|jpe?g|gif|webp|bmp|tiff?)\b/gi;
  let m: RegExpExecArray | null;
  while ((m = extRe.exec(text)) !== null) {
    const extEnd = m.index + m[0].length;
    let i = extEnd - 1;
    while (i > 0 && !isStrictBoundary(text[i - 1])) i--;
    const candidate = text.slice(i, extEnd);
    if (/^(?:\/|~\/|\.\/|\.\.\/)/.test(candidate)) out.push(candidate);
  }
  return out;
}

function isPathBoundary(ch: string): boolean {
  return (
    ch === '"' || ch === "'" || ch === "<" || ch === ">" || ch === "|" || ch === "," || ch === ";"
  );
}

function isStrictBoundary(ch: string): boolean {
  return /\s/.test(ch) || isPathBoundary(ch);
}

function fmtKB(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)}MB`;
}

type NotifyFn = (msg: string, level?: "info" | "warning" | "error") => void;

/** Resolve a NotifyFn that uses ctx.ui.notify when the TUI/RPC is up,
 *  else null. The null branch is for print/JSON modes where ui.notify
 *  is either a no-op or undefined — silently no-op. */
function makeNotify(ctx: { hasUI: boolean; ui: { notify: NotifyFn } }): NotifyFn | null {
  if (!ctx.hasUI) return null;
  return (msg, level) => ctx.ui.notify(msg, level ?? "info");
}

async function optimizePaths(
  paths: string[],
  notify: NotifyFn | null,
): Promise<{ images: ImageContent[]; found: boolean }> {
  const inputs: ImageInput[] = [];
  for (const p of paths) {
    const resolvedPath = resolveImagePath(p);
    if (!existsSync(resolvedPath)) continue;
    try {
      const buf = await readFile(resolvedPath);
      const mime = mimeFromPath(p);
      inputs.push({
        type: "image",
        data: buf.toString("base64"),
        mimeType: mime,
      });
    } catch {
      // unreadable — skip silently
    }
  }
  if (inputs.length === 0) return { images: [], found: false };

  const optimized = await optimizeImages(inputs);
  let original = 0;
  let shrunk = 0;
  let changed = 0;
  for (const o of optimized) {
    original += o.originalBytes;
    shrunk += o.optimizedBytes;
    // Only count shrinks that came from fresh work. Cache hits return
    // optimizedBytes < originalBytes from the *first* encoding, but no
    // re-encoding happened this call — notifying again is misleading.
    if (!o.cached && o.optimizedBytes < o.originalBytes) changed++;
  }
  if (changed > 0 && notify) {
    const pct = original > 0 ? Math.round(((original - shrunk) / original) * 100) : 0;
    notify(
      `📦 optimized ${changed} image${changed === 1 ? "" : "s"}: ` +
        `${fmtKB(original)} → ${fmtKB(shrunk)} (−${pct}%)`,
      "info",
    );
  }
  return { images: optimized, found: true };
}

export function resolveImagePath(p: string): string {
  if (p === "~") return homedir();
  if (p.startsWith("~/")) return join(homedir(), p.slice(2));
  return p;
}

function mimeFromPath(p: string): string {
  const ext = p.toLowerCase().split(".").pop() ?? "";
  switch (ext) {
    case "png":
      return "image/png";
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "gif":
      return "image/gif";
    case "webp":
      return "image/webp";
    case "bmp":
      return "image/bmp";
    case "tif":
    case "tiff":
      return "image/tiff";
    default:
      return "application/octet-stream";
  }
}

export default function (pi: ExtensionAPI) {
  if (process.env.PI_AUTO_OPT_IMAGES === "0") return;

  // ─── Hook 1: input event ─────────────────────────────────────────────────
  // Fires when the user submits a message. Catches pasted-image paths and
  // converts them to inline optimized image content.
  pi.on("input", async (event, ctx) => {
    if (event.source === "extension") return { action: "continue" };
    if (!event.text) return { action: "continue" };

    const paths = findImagePathsInText(event.text);
    if (paths.length === 0) return { action: "continue" };

    const safeNotify = makeNotify(ctx);

    // Wire sanitizer warnings into the TUI/RPC surface so missing
    // python3 or a broken skill surfaces in the user's face, not just
    // in the log file. Restore to the default (console.warn) once this
    // event completes — pi runs events sequentially on a single turn,
    // so a stale safeNotify closure from a prior turn would otherwise
    // leak into later turns.
    const previousHandler = setWarningHandler((msg) => {
      if (safeNotify) safeNotify(msg, "warning");
    });

    let optimized;
    try {
      optimized = await optimizePaths(paths, safeNotify);
    } catch (err) {
      if (safeNotify) {
        safeNotify(
          `auto-optimize-images: ${err instanceof Error ? err.message : String(err)} (kept original)`,
          "warning",
        );
      }
      return { action: "continue" };
    } finally {
      setWarningHandler(previousHandler);
    }

    if (!optimized.found) return { action: "continue" };

    // Strip matched paths from the text — the LLM gets inline images now.
    // Use replaceAll: the same path can appear more than once in a message
    // (e.g. paste-augmenting an existing paste), and String.replace only
    // substitutes the first occurrence per pass.
    const cleanedText = paths.reduce(
      (t, p) =>
        t
          .replaceAll(p, "")
          .replace(/[ \t]{2,}/g, " ")
          .trim(),
      event.text,
    );

    // Merge with any pre-attached images.
    const merged: ImageContent[] = [...(event.images ?? []), ...optimized.images];

    return { action: "transform", text: cleanedText, images: merged };
  });

  // ─── Hook 2: context event ───────────────────────────────────────────────
  // Fires before each LLM call. Walks messages and optimizes any image
  // content not already in the cache. Catches @file mentions, tool
  // outputs containing images, and images re-attached in later turns.
  pi.on("context", async (event, ctx) => {
    // Deep-clone is guaranteed by pi; safe to mutate.
    const messages = event.messages;
    const safeNotify = makeNotify(ctx);

    // Collect every image block across every message, then optimize them
    // all in parallel. The serial version was O(N) latency per LLM call;
    // this version is O(max(per-image pipeline time)).
    type Target = {
      content: ImageContent[];
      index: number;
      input: ImageInput;
    };
    const targets: Target[] = [];
    for (const msg of messages) {
      // Only user/assistant/toolResult messages have a content array;
      // bash-execution and custom messages do not.
      const role = (msg as { role?: string }).role;
      if (role !== "user" && role !== "assistant" && role !== "toolResult") continue;
      const content = (msg as { content?: unknown }).content;
      if (!Array.isArray(content)) continue;
      for (let i = 0; i < content.length; i++) {
        const block = content[i] as {
          type?: string;
          data?: string;
          mimeType?: string;
        };
        if (block?.type !== "image" || typeof block.data !== "string") continue;
        targets.push({
          content: content as ImageContent[],
          index: i,
          input: {
            type: "image",
            data: block.data,
            mimeType: block.mimeType ?? "image/png",
          },
        });
      }
    }

    if (targets.length === 0) return { messages };

    const results = await Promise.all(
      targets.map((t) => optimizeImages([t.input]).then((r) => r[0])),
    );

    let original = 0;
    let shrunk = 0;
    let changed = 0;
    for (let i = 0; i < targets.length; i++) {
      const opt = results[i];
      original += opt.originalBytes;
      shrunk += opt.optimizedBytes;
      // Replace cached results too: a raw image can hit the input-hash cache
      // after a previous turn and still needs replacement with optimized bytes.
      const input = targets[i].input;
      const outputChanged = opt.data !== input.data || opt.mimeType !== input.mimeType;
      if (outputChanged) {
        targets[i].content[targets[i].index] = {
          type: "image",
          data: opt.data,
          mimeType: opt.mimeType,
        };
      }
      if (!opt.cached && outputChanged && opt.optimizedBytes < opt.originalBytes) {
        changed++;
      }
    }

    if (changed > 0 && safeNotify) {
      const pct = original > 0 ? Math.round(((original - shrunk) / original) * 100) : 0;
      safeNotify(
        `📦 context: optimized ${changed} image${changed === 1 ? "" : "s"} ` +
          `${fmtKB(original)} → ${fmtKB(shrunk)} (−${pct}%)`,
        "info",
      );
    }

    return { messages };
  });
}
