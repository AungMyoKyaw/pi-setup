# auto-optimize-images

Automatically optimizes images the moment you paste or attach them — before
they reach the LLM. Smaller bytes, faster uploads, fewer tokens, identical
visual content (vision models cap at ~1568px on the longer edge anyway).

## How it works

Pi's clipboard paste writes the image to `/tmp/pi-clipboard-<uuid>.png` and
inserts the file path as text — `event.images` is undefined. This extension
hooks two events to handle every image delivery path:

### Hook 1 — `input` (user submits a message)

- Scans the message text for image paths (e.g. `/tmp/pi-clipboard-abc.png`)
- Reads each path, runs it through the optimizer
- Replaces the path with inline image content, leaving clean text
- Result: **paste image → submit → LLM gets optimized image directly**, no
  `read` tool call needed

### Hook 2 — `context` (before every LLM call) — safety net

- Walks every message, optimizes any inline image content
- Catches: `@file` mentions, tool outputs containing images, images
  re-attached in later turns
- Both hooks share a SHA-256 cache so identical bytes are encoded once

## What it optimizes

| Input                   | Output                                                                     |
| ----------------------- | -------------------------------------------------------------------------- |
| < 100 KB                | Pass through, but metadata still scrubbed                                  |
| Large opaque PNG        | Resize to ≤1568px + JPEG q=85                                              |
| Large PNG with alpha    | Resize to ≤1568px + recompressed PNG                                       |
| Oversized JPEG          | Resize to ≤1568px + recompressed JPEG                                      |
| Any image with metadata | EXIF / IPTC / XMP / ICC / C2PA / COM / JUMBF / tEXt / iTXt / zTXt stripped |

Metadata stripping is **unconditional** — even a 4 KB PNG with a single
tEXt chunk gets sanitized, not because the bytes matter but because the
privacy payload does. The sanitizer is run as a final pass via the
standard-library `image-metadata-sanitizer` script (`~/.agents/skills/`)
so we cover the full matrix: EXIF, IPTC, XMP, ICC profiles, C2PA/caBX,
JPEG COM/JUMBF, and PNG tEXt/iTXt/zTXt ancillary chunks. Sharp's default
`.toBuffer()` strips some of these but not all; the sanitizer is
exhaustive.

## Files

```
auto-optimize-images/
├── index.ts             # both pi hooks (input + context)
├── optimizer.ts         # pure optimization logic (testable)
├── optimizer.test.ts    # 18 tests, all green
├── package.json         # deps: sharp
├── tsconfig.json
└── README.md
```

## Install

Already in `~/.pi/agent/extensions/`. Reload with `/reload` after install.

```sh
cd ~/.pi/agent/extensions/auto-optimize-images
bun install
```

## Test

```sh
bun run test      # 18/18 passing (size, format, EXIF, ICC, JPEG APPn, PNG tEXt, cache)
bun run check     # tsc clean
```

## Dependencies

- `sharp` — resize / re-encode (libvips)
- `~/.agents/skills/image-metadata-sanitizer/scripts/sanitize_image.py` — metadata stripping. Resolved via `$HOME` so it works in any context. If the script is missing or fails on an unsupported format, the optimizer falls back to sharp's output (better than blocking the LLM).

## Disable

```sh
PI_AUTO_OPT_IMAGES=0 pi
```

## Notifications

When something actually shrinks:

```
📦 optimized 1 image: 4.21MB → 287.4KB (−93%)
📦 context: optimized 2 images 2.36MB → 1.48MB (−37%)
```

Silent on the happy path.

## Known limitations

- Paths with internal spaces (e.g. macOS screenshots named
  `"Screenshot 2026-09-11 at 1.46 AM.png"`) are not detected. Pi's clipboard
  paste uses UUID filenames (no spaces), so this covers the common case.
  Rename the file or attach via the editor's normal flow.

## Compatibility

- Pi 0.85.x
- Sharp 0.34.x (libvips under the hood)
- Orthogonal to `attachment-preview` (which classifies/previews; this transforms bytes)
