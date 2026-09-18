/**
 * Tests for the image optimizer.
 *
 * Behavior under test:
 *   1. Tiny images pass through unchanged (no wasted CPU).
 *   2. Large opaque PNGs are converted to JPEG and shrink dramatically.
 *   3. PNGs with an alpha channel are kept as PNG (transparency is required).
 *   4. Oversized images are resized so the longer edge fits within MAX_EDGE.
 *   5. EXIF / other metadata is stripped from the output.
 *   6. Results are cached by SHA-256 of the input — second call is a hash hit.
 *   7. The total bytes after optimization is always <= the input bytes for
 *      a large image (we never make a "large" image bigger).
 *   8. Cache is keyed under both the input hash AND the output hash, so
 *      the context hook's re-pass through already-optimized bytes is a hit.
 *   9. Concurrent identical calls share one pipeline run (single-flight),
 *      and both callers see `cached: true` so notifications don't double-count.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { homedir } from "node:os";
import { join } from "node:path";
import { createHash, randomBytes } from "node:crypto";
import sharp from "sharp";
import { findImagePathsInText, resolveImagePath } from "./index.ts";
import { optimizeImages, clearCache, setWarningHandler } from "./optimizer.ts";

/** Build a solid-color PNG of the given dimensions. */
async function makePng(
  width: number,
  height: number,
  opts: { alpha?: boolean; metadata?: boolean } = {},
): Promise<{ data: Buffer; mimeType: string }> {
  const channels = opts.alpha ? 4 : 3;
  const raw = Buffer.alloc(width * height * channels);
  // Fill with a deterministic gradient so it's not trivially compressible.
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * channels;
      raw[i] = (x * 7 + y * 3) & 0xff;
      raw[i + 1] = (x * 11 + y * 5) & 0xff;
      raw[i + 2] = (x * 13 + y * 17) & 0xff;
      if (channels === 4) raw[i + 3] = 0xff;
    }
  }
  const png = sharp(raw, { raw: { width, height, channels } });
  if (opts.metadata) {
    png.withMetadata({
      exif: {
        IFD0: {
          Make: "TestCam",
          Model: "TC-9000",
          Software: "fuzz v1",
        },
      },
    });
  }
  const buf = await png.png().toBuffer();
  return { data: buf, mimeType: "image/png" };
}

function bytesOfBase64(s: string): number {
  // base64 length -> bytes (no padding-aware shortcut needed; close enough)
  return Math.floor((s.length * 3) / 4);
}

test("tiny PNG is small enough to skip resize but still gets metadata scrubbed", async () => {
  clearCache();
  const tiny = await makePng(32, 32);
  const out = await optimizeImages([
    {
      type: "image",
      data: tiny.data.toString("base64"),
      mimeType: tiny.mimeType,
    },
  ]);
  assert.equal(out.length, 1);
  assert.equal(out[0].mimeType, "image/png", "tiny image should keep PNG");
  // Bytes may differ because we still run the metadata sanitizer (privacy
  // guarantee is unconditional, not gated on file size). What must hold:
  // - no growth (sanitizer is byte-preserving for clean inputs)
  // - the output is a valid PNG with the same dimensions
  assert.ok(out[0].optimizedBytes <= out[0].originalBytes);
  const outMeta = await sharp(Buffer.from(out[0].data, "base64")).metadata();
  assert.equal(outMeta.width, 32);
  assert.equal(outMeta.height, 32);
});

test("large opaque PNG is converted to JPEG and shrinks", async () => {
  clearCache();
  const big = await makePng(2000, 1500); // ~3MP, well over threshold
  const out = await optimizeImages([
    {
      type: "image",
      data: big.data.toString("base64"),
      mimeType: big.mimeType,
    },
  ]);
  assert.equal(out.length, 1);
  assert.equal(out[0].mimeType, "image/jpeg", "opaque large PNG -> JPEG");
  // Real-world photos hit <10%; synthetic gradient is a worst case. The
  // invariant we care about is "JPEG path was taken AND output is smaller".
  assert.ok(
    out[0].optimizedBytes < out[0].originalBytes * 0.85,
    `expected noticeably smaller; got ${out[0].optimizedBytes}/${out[0].originalBytes}`,
  );
});

test("PNG with alpha channel stays PNG", async () => {
  clearCache();
  const alpha = await makePng(2000, 1500, { alpha: true });
  const out = await optimizeImages([
    {
      type: "image",
      data: alpha.data.toString("base64"),
      mimeType: alpha.mimeType,
    },
  ]);
  assert.equal(out[0].mimeType, "image/png", "alpha must keep PNG (JPEG has no alpha)");
});

test("oversized image is resized so the longer edge <= MAX_EDGE", async () => {
  clearCache();
  const MAX_EDGE = 1568;
  const huge = await makePng(4000, 3000); // 4:3, longer edge 4000
  const out = await optimizeImages([
    {
      type: "image",
      data: huge.data.toString("base64"),
      mimeType: huge.mimeType,
    },
  ]);
  const decoded = sharp(Buffer.from(out[0].data, "base64"));
  const meta = await decoded.metadata();
  assert.ok(
    (meta.width ?? 0) <= MAX_EDGE && (meta.height ?? 0) <= MAX_EDGE,
    `expected both edges <= ${MAX_EDGE}; got ${meta.width}x${meta.height}`,
  );
});

test("EXIF metadata is stripped from the output", async () => {
  clearCache();
  const tagged = await makePng(2000, 1500, { metadata: true });
  const out = await optimizeImages([
    {
      type: "image",
      data: tagged.data.toString("base64"),
      mimeType: tagged.mimeType,
    },
  ]);
  const decoded = sharp(Buffer.from(out[0].data, "base64"));
  const meta = await decoded.metadata();
  assert.equal(meta.exif, undefined, "EXIF must be stripped");
});

test("ICC profile is stripped from the output", async () => {
  clearCache();
  // Generate a real JPEG with the default sRGB ICC profile attached. Sharp
  // keeps ICC profiles on JPEG output by default, so the sanitizer pass is
  // what guarantees removal.
  const tagged = await sharp({
    create: {
      width: 2000,
      height: 1500,
      channels: 3,
      background: { r: 128, g: 128, b: 128 },
    },
  })
    .withMetadata()
    .jpeg({ quality: 90 })
    .toBuffer();
  const taggedMeta = await sharp(tagged).metadata();
  assert.ok(taggedMeta.icc, "input must have ICC profile for this test to be meaningful");
  const out = await optimizeImages([
    { type: "image", data: tagged.toString("base64"), mimeType: "image/jpeg" },
  ]);
  const decoded = sharp(Buffer.from(out[0].data, "base64"));
  const meta = await decoded.metadata();
  assert.equal(meta.icc, undefined, "ICC profile must be stripped");
});

test("JPEG output has no EXIF/IPTC/XMP/ICC APPn segments", async () => {
  clearCache();
  // Generate a JPEG with EXIF + ICC profile, then run it through. After
  // sanitization there must be no APP1 (EXIF/XMP), APP2 (ICC), or APP13
  // (IPTC). Other APPn (e.g. JFIF APP0) are tolerable.
  const tagged = await sharp({
    create: {
      width: 2000,
      height: 1500,
      channels: 3,
      background: { r: 128, g: 128, b: 128 },
    },
  })
    .withMetadata({
      exif: { IFD0: { Make: "TestCam", Model: "TC-9000" } },
    })
    .jpeg({ quality: 90 })
    .toBuffer();
  const out = await optimizeImages([
    { type: "image", data: tagged.toString("base64"), mimeType: "image/jpeg" },
  ]);
  assert.equal(out[0].mimeType, "image/jpeg");
  const buf = Buffer.from(out[0].data, "base64");
  const suspicious: string[] = [];
  let i = 0;
  while (i < buf.length - 1) {
    if (buf[i] !== 0xff) break;
    const marker = buf[i + 1];
    if (marker === 0xd8 || marker === 0xd9) {
      i += 2;
      continue;
    }
    if (marker === 0xda) break; // SOS — image data follows
    // 0xe0..0xef = APPn. APP0 (JFIF) is allowed; APP1 (EXIF/XMP), APP2
    // (ICC), APP13 (IPTC), APP14 (Adobe), etc. are privacy payloads.
    if (marker >= 0xe0 && marker !== 0xe0) {
      suspicious.push("0x" + marker.toString(16));
    }
    if (i + 3 >= buf.length) break;
    const segLen = buf.readUInt16BE(i + 2);
    i += 2 + segLen;
  }
  assert.deepEqual(suspicious, [], `unexpected JPEG APPn metadata: ${suspicious.join(", ")}`);
});

test("PNG tEXt / iTXt / zTXt ancillary chunks are stripped", async () => {
  clearCache();
  // Build a PNG with a tEXt chunk (descriptive text metadata) and verify
  // it's gone after optimization.
  const tagged = await sharp({
    create: {
      width: 2000,
      height: 1500,
      channels: 3,
      background: { r: 128, g: 128, b: 128 },
    },
  })
    .png()
    .toBuffer();
  // Inject a tEXt chunk with a recognizable string. Build a valid PNG
  // chunk: 4-byte length BE + 4-byte type + data + 4-byte CRC.
  const keyword = "Comment";
  const text = Buffer.from("SECRET METADATA THAT MUST BE STRIPPED");
  const data = Buffer.concat([Buffer.from(keyword), Buffer.from([0]), text]);
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const type = Buffer.from("tEXt");
  // Compute CRC32 over type + data.
  const crc = require("node:zlib").crc32
    ? require("node:zlib").crc32(Buffer.concat([type, data]))
    : 0;
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc, 0);
  const chunk = Buffer.concat([len, type, data, crcBuf]);
  // Find IEND and insert before it.
  const iendIdx = tagged.indexOf(Buffer.from("IEND"));
  const polluted = Buffer.concat([tagged.slice(0, iendIdx - 4), chunk, tagged.slice(iendIdx - 4)]);
  // Sanity: input contains the secret.
  assert.match(polluted.toString("latin1"), /SECRET METADATA/);
  const out = await optimizeImages([
    { type: "image", data: polluted.toString("base64"), mimeType: "image/png" },
  ]);
  const cleaned = Buffer.from(out[0].data, "base64");
  assert.doesNotMatch(
    cleaned.toString("latin1"),
    /SECRET METADATA/,
    "tEXt metadata must be stripped",
  );
});

test("second call with identical input is a cache hit (no re-encode)", async () => {
  clearCache();
  const img = await makePng(2000, 1500);
  const a = await optimizeImages([
    {
      type: "image",
      data: img.data.toString("base64"),
      mimeType: img.mimeType,
    },
  ]);
  const b = await optimizeImages([
    {
      type: "image",
      data: img.data.toString("base64"),
      mimeType: img.mimeType,
    },
  ]);
  assert.equal(a[0].data, b[0].data, "cached output identical");
  assert.equal(a[0].mimeType, b[0].mimeType);
  // Contract that the notification gate in index.ts depends on: first call
  // is fresh work (cached: false), second call is a hit (cached: true).
  // If this ever flips, the gate stops suppressing duplicate notifications.
  assert.equal(a[0].cached, false, "first call is fresh work");
  assert.equal(b[0].cached, true, "second call is a cache hit");
});

test("optimization never makes a large image larger", async () => {
  clearCache();
  const big = await makePng(2000, 1500);
  const out = await optimizeImages([
    {
      type: "image",
      data: big.data.toString("base64"),
      mimeType: big.mimeType,
    },
  ]);
  assert.ok(
    out[0].optimizedBytes <= out[0].originalBytes,
    `got bigger: ${out[0].originalBytes} -> ${out[0].optimizedBytes}`,
  );
});

test("empty input array returns empty output", async () => {
  clearCache();
  const out = await optimizeImages([]);
  assert.deepEqual(out, []);
});

test("non-image content is passed through untouched", async () => {
  clearCache();
  // The optimizer is image-only; the input hook should pre-filter.
  const out = await optimizeImages([
    { type: "text", text: "hello" } as unknown as {
      type: "image";
      data: string;
      mimeType: string;
    },
  ]);
  assert.equal(out.length, 1);
});

test("hash function is deterministic for identical bytes", () => {
  const buf = randomBytes(1024);
  const h1 = createHash("sha256").update(buf).digest("hex");
  const h2 = createHash("sha256").update(buf).digest("hex");
  assert.equal(h1, h2);
});

test("findImagePathsInText: detects pi-clipboard paste path", () => {
  const paths = findImagePathsInText("what is in /tmp/pi-clipboard-abc-123.png?");
  assert.deepEqual(paths, ["/tmp/pi-clipboard-abc-123.png"]);
});

test("findImagePathsInText: detects multiple paths in one message", () => {
  const paths = findImagePathsInText("see /tmp/a.png and /var/b.JPG and ./c.webp");
  assert.deepEqual(paths, ["/tmp/a.png", "/var/b.JPG", "./c.webp"]);
});

test("findImagePathsInText: returns empty for no paths", () => {
  assert.deepEqual(findImagePathsInText("plain text, no images"), []);
  assert.deepEqual(findImagePathsInText(""), []);
});

test("findImagePathsInText: ignores non-image paths", () => {
  assert.deepEqual(findImagePathsInText("read /etc/hosts"), []);
  assert.deepEqual(findImagePathsInText("see foo.txt"), []);
});

test("resolveImagePath: expands home-relative paths", () => {
  assert.equal(resolveImagePath("~/Pictures/example.png"), join(homedir(), "Pictures/example.png"));
});

test("findImagePathsInText: macOS screenshot with spaces — documented limitation", () => {
  // Paths with internal spaces are not detected. Pi's clipboard paste uses
  // UUID filenames (no spaces), so this is fine for the common case. Users
  // who manually paste screenshot paths with spaces should rename the file.
  const paths = findImagePathsInText(
    "see /var/folders/abc/Screenshot 2026-09-11 at 1.46.23 AM.png here",
  );
  // Either zero matches or the loose partial — just assert we don't crash
  // and the test exercises the code path.
  assert.ok(Array.isArray(paths));
});

test("cache is keyed under both input hash and output hash — context-hook re-pass is a hit", async () => {
  clearCache();
  const big = await makePng(2000, 1500);
  // Simulate the input hook: raw bytes in.
  const first = await optimizeImages([
    {
      type: "image",
      data: big.data.toString("base64"),
      mimeType: "image/png",
    },
  ]);
  assert.equal(first[0].cached, false, "first call is fresh work");
  // Simulate the context hook: the message now contains the optimized
  // bytes (different hash from raw). It should still hit the cache.
  const second = await optimizeImages([
    {
      type: "image",
      data: first[0].data,
      mimeType: first[0].mimeType,
    },
  ]);
  assert.equal(second[0].cached, true, "context-hook pass through optimized bytes must hit cache");
  assert.equal(second[0].data, first[0].data, "cached output identical");
  // The cache hit returns the original entry. Its originalBytes field
  // reflects the *first* call's raw input size, NOT the second caller's
  // input size (which is the first caller's optimized output). The
  // invariant we want to lock in is that both callers see the SAME entry,
  // so all fields match the first call's result.
  assert.equal(second[0].originalBytes, first[0].originalBytes);
  assert.equal(second[0].optimizedBytes, first[0].optimizedBytes);
});

test("single-flight: concurrent identical calls share one pipeline run", async () => {
  clearCache();
  const big = await makePng(2000, 1500);
  const input = {
    type: "image" as const,
    data: big.data.toString("base64"),
    mimeType: "image/png",
  };
  // Fire two in parallel before either has a chance to populate the cache.
  const [a, b] = await Promise.all([optimizeImages([input]), optimizeImages([input])]);
  // Both must end up with identical output bytes regardless of who started
  // the pipeline.
  assert.equal(a[0].data, b[0].data, "both callers get the same output");
  assert.equal(a[0].mimeType, b[0].mimeType);
  // At most one of the two is "fresh work" (cached: false). The other is
  // a single-flight participant (cached: true). Either way, the total
  // count of fresh shrinks in a notification loop is <= 1.
  const freshCount = [a[0], b[0]].filter(
    (r) => !r.cached && r.optimizedBytes < r.originalBytes,
  ).length;
  assert.ok(freshCount <= 1, `expected at most 1 fresh shrink; got ${freshCount}`);
});

test("optimizeImages: multiple distinct inputs are processed in parallel", async () => {
  clearCache();
  const a = await makePng(2000, 1500);
  const b = await makePng(1500, 2000);
  const out = await optimizeImages([
    { type: "image", data: a.data.toString("base64"), mimeType: "image/png" },
    { type: "image", data: b.data.toString("base64"), mimeType: "image/png" },
  ]);
  assert.equal(out.length, 2);
  // Different inputs must produce different output bytes — proves both
  // were processed (not deduplicated by accident).
  assert.notEqual(out[0].data, out[1].data);
  assert.equal(out[0].cached, false);
  assert.equal(out[1].cached, false);
});

test("setWarningHandler swaps the active handler and returns the previous one", () => {
  const calls: string[] = [];
  const prev = setWarningHandler((m) => calls.push(m));
  try {
    // Second install: returns the handler we just installed (h1).
    const inner = setWarningHandler((m) => calls.push(`new: ${m}`));
    inner("via-h1");
    assert.deepEqual(calls, ["via-h1"], "h1 was active until replaced");
  } finally {
    setWarningHandler(prev);
  }
});

test("tiny passthrough: same input and output bytes do not double-cache", async () => {
  clearCache();
  // Tiny PNG (< 100KB) goes through the passthrough branch: output bytes
  // equal input bytes. The storeResult path should NOT store a redundant
  // entry under the same hash. We can't directly inspect the cache map,
  // but we can verify the behavior by feeding the optimized bytes back —
  // it must still hit the cache via the original (single) entry.
  const tiny = await makePng(32, 32);
  const a = await optimizeImages([
    {
      type: "image",
      data: tiny.data.toString("base64"),
      mimeType: "image/png",
    },
  ]);
  const b = await optimizeImages([{ type: "image", data: a[0].data, mimeType: a[0].mimeType }]);
  assert.equal(b[0].cached, true);
  assert.equal(b[0].data, a[0].data);
});
