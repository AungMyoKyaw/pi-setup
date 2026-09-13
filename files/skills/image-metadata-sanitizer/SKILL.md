---
name: image-metadata-sanitizer
description: Remove embedded image metadata and provenance payloads, including EXIF, IPTC, XMP, ICC profiles, JPEG JUMBF/C2PA, and PNG caBX C2PA chunks. Use when the user asks to sanitize, strip, scrub, or privacy-clean PNG, JPEG, or WebP image metadata.
---

# Image Metadata Sanitizer

Use the bundled standard-library script instead of relying on `exiftool`, ImageMagick, or GUI tools:

```bash
python3 "<skill-dir>/scripts/sanitize_image.py" "/path/to/input.png"
```

The default behavior preserves the original and writes a sibling named ` - sanitized` before the extension. Choose an explicit destination with `--output`, or replace the original only when the user explicitly requests it:

```bash
python3 "<skill-dir>/scripts/sanitize_image.py" input.png --output sanitized.png
python3 "<skill-dir>/scripts/sanitize_image.py" input.png --in-place
```

## Supported formats

- **PNG:** preserves image and transparency/APNG chunks and removes ancillary chunks, including `caBX` C2PA manifests, `eXIf`, `tEXt`, `iTXt`, `zTXt`, and color-profile chunks.
- **JPEG:** removes all `APP0`–`APP15` and `COM` segments. This covers EXIF, XMP, ICC, JUMBF/C2PA, and JPEG comments while retaining the encoded image scans.
- **WebP:** preserves image/animation chunks, removes EXIF/XMP/ICCP and unknown chunks, and clears the corresponding VP8X metadata flags.

The script validates chunk/segment lengths and CRCs, writes atomically, and performs an idempotence check to verify that no removable container remains.

## Workflow

1. Preserve the source by default; do not overwrite it unless asked.
2. Run the script and report the exact output path.
3. Report what was removed when the script lists it. For C2PA verification, say which container was checked: PNG chunks, JPEG APP segments, or WebP chunks.
4. Do not claim that a filename, filesystem timestamps, or pixel content was sanitized. Those are separate from embedded metadata.
5. For unsupported formats such as HEIC/AVIF, say so plainly rather than claiming the image is clean.

## Verification

For a PNG, the sanitized structure should contain only image chunks such as `IHDR`, `IDAT`, `IEND` (plus `PLTE`, `tRNS`, or APNG image chunks where needed). In particular, `caBX` must be absent.

For JPEG, no `APPn` or `COM` segments should remain. For WebP, `EXIF`, `XMP `, and `ICCP` chunks and their VP8X flags must be absent.

The helper script and focused test are in `scripts/sanitize_image.py` and `tests/test_sanitize_image.py`.
