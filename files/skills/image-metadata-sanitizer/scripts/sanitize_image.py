#!/usr/bin/env python3
"""Strip embedded metadata and provenance from PNG, JPEG, and WebP images.

The implementation uses only the Python standard library. It preserves image
payload chunks/segments while removing metadata containers such as PNG caBX,
JPEG APPn/COM, and WebP EXIF/XMP/ICCP chunks.
"""

from __future__ import annotations

import argparse
import os
import shutil
import struct
import sys
import tempfile
import zlib
from pathlib import Path


class SanitizationError(ValueError):
    """Raised when an image is malformed or uses an unsupported format."""


PNG_SIGNATURE = b"\x89PNG\r\n\x1a\n"
PNG_IMAGE_CHUNKS = {
    b"IHDR",
    b"PLTE",
    b"tRNS",  # transparency is part of how the image renders
    b"IDAT",
    b"IEND",
    # APNG animation chunks are image data, not metadata.
    b"acTL",
    b"fcTL",
    b"fdAT",
}
WEBP_IMAGE_CHUNKS = {b"VP8 ", b"VP8L", b"VP8X", b"ALPH", b"ANIM", b"ANMF"}


def _png_chunks(data: bytes) -> list[tuple[bytes, bytes, bytes]]:
    if not data.startswith(PNG_SIGNATURE):
        raise SanitizationError("not a PNG file")

    chunks: list[tuple[bytes, bytes, bytes]] = []
    pos = len(PNG_SIGNATURE)
    saw_ihdr = False
    saw_iend = False
    while pos < len(data):
        if pos + 12 > len(data):
            raise SanitizationError("truncated PNG chunk header")
        length = struct.unpack(">I", data[pos : pos + 4])[0]
        end = pos + 12 + length
        if end > len(data):
            raise SanitizationError("truncated PNG chunk payload")
        kind = data[pos + 4 : pos + 8]
        payload = data[pos + 8 : pos + 8 + length]
        crc = struct.unpack(">I", data[pos + 8 + length : end])[0]
        if zlib.crc32(kind + payload) & 0xFFFFFFFF != crc:
            raise SanitizationError(f"invalid PNG CRC for {kind!r}")
        chunks.append((kind, payload, data[pos:end]))
        saw_ihdr |= kind == b"IHDR"
        saw_iend |= kind == b"IEND"
        pos = end
        if kind == b"IEND":
            if pos != len(data):
                raise SanitizationError("unexpected data after PNG IEND")
            break

    kinds = [kind for kind, _, _ in chunks]
    if not saw_ihdr or not saw_iend or b"IDAT" not in kinds:
        raise SanitizationError("PNG is missing IHDR, IDAT, or IEND")
    return chunks


def sanitize_png(data: bytes) -> tuple[bytes, list[str]]:
    chunks = _png_chunks(data)
    output = bytearray(PNG_SIGNATURE)
    removed: list[str] = []
    for kind, _, encoded in chunks:
        if kind in PNG_IMAGE_CHUNKS:
            output.extend(encoded)
        else:
            removed.append(kind.decode("latin-1"))
    return bytes(output), removed


def _jpeg_marker_name(marker: int) -> str:
    if 0xE0 <= marker <= 0xEF:
        return f"APP{marker - 0xE0}"
    if marker == 0xFE:
        return "COM"
    return f"0x{marker:02X}"


def sanitize_jpeg(data: bytes) -> tuple[bytes, list[str]]:
    if not data.startswith(b"\xFF\xD8"):
        raise SanitizationError("not a JPEG file")

    output = bytearray(data[:2])
    removed: list[str] = []
    pos = 2
    saw_sos = False
    saw_eoi = False

    while pos < len(data):
        if data[pos] != 0xFF:
            raise SanitizationError("invalid JPEG marker boundary")
        marker_start = pos
        while pos < len(data) and data[pos] == 0xFF:
            pos += 1
        if pos >= len(data):
            raise SanitizationError("truncated JPEG marker")
        marker = data[pos]
        pos += 1

        if marker == 0x00:
            raise SanitizationError("unexpected JPEG stuffed byte outside scan data")
        if marker == 0xD9:  # EOI
            output.extend(b"\xFF\xD9")
            saw_eoi = True
            break
        if marker == 0xD8:  # SOI; tolerate a nested SOI but preserve it
            output.extend(data[marker_start:pos])
            continue
        if marker == 0x01 or 0xD0 <= marker <= 0xD7:  # standalone markers
            output.extend(data[marker_start:pos])
            continue

        if pos + 2 > len(data):
            raise SanitizationError("truncated JPEG segment length")
        length = struct.unpack(">H", data[pos : pos + 2])[0]
        if length < 2 or pos + length > len(data):
            raise SanitizationError("invalid JPEG segment length")
        segment_end = pos + length

        if 0xE0 <= marker <= 0xEF or marker == 0xFE:
            # APP0-APP15 covers EXIF, XMP, ICC, JUMBF/C2PA, and similar
            # application payloads. COM is a plain JPEG comment.
            removed.append(_jpeg_marker_name(marker))
        else:
            output.extend(data[marker_start:segment_end])

        pos = segment_end
        if marker == 0xDA:  # SOS; copy entropy-coded data until the next marker
            saw_sos = True
            scan_start = pos
            while pos < len(data):
                if data[pos] != 0xFF:
                    pos += 1
                    continue
                marker_pos = pos
                j = pos
                while j < len(data) and data[j] == 0xFF:
                    j += 1
                if j >= len(data):
                    raise SanitizationError("truncated JPEG scan data")
                code = data[j]
                if code == 0x00 or 0xD0 <= code <= 0xD7:
                    pos = j + 1
                    continue
                # Leave the next marker for the outer loop. This supports
                # progressive JPEGs with multiple SOS segments.
                output.extend(data[scan_start:marker_pos])
                pos = marker_pos
                break
            else:
                raise SanitizationError("JPEG scan has no terminating marker")

    if not saw_sos or not saw_eoi:
        raise SanitizationError("JPEG is missing SOS or EOI")
    return bytes(output), removed


def _webp_chunk(kind: bytes, payload: bytes) -> bytes:
    encoded = kind + struct.pack("<I", len(payload)) + payload
    if len(payload) & 1:
        encoded += b"\x00"
    return encoded


def sanitize_webp(data: bytes) -> tuple[bytes, list[str]]:
    if len(data) < 12 or data[:4] != b"RIFF" or data[8:12] != b"WEBP":
        raise SanitizationError("not a WebP file")

    pos = 12
    kept: list[bytes] = []
    removed: list[str] = []
    while pos < len(data):
        if pos + 8 > len(data):
            raise SanitizationError("truncated WebP chunk header")
        kind = data[pos : pos + 4]
        length = struct.unpack("<I", data[pos + 4 : pos + 8])[0]
        end = pos + 8 + length
        padded_end = end + (length & 1)
        if padded_end > len(data):
            raise SanitizationError("truncated WebP chunk payload")
        payload = data[pos + 8 : end]

        if kind in WEBP_IMAGE_CHUNKS:
            if kind == b"VP8X":
                if len(payload) < 10:
                    raise SanitizationError("truncated WebP VP8X chunk")
                payload = bytearray(payload)
                # VP8X flags: ICC (0x20), EXIF (0x08), XMP (0x04).
                payload[0] &= ~(0x20 | 0x08 | 0x04)
                payload = bytes(payload)
            kept.append(_webp_chunk(kind, payload))
        else:
            removed.append(kind.decode("latin-1"))
        pos = padded_end

    if not kept:
        raise SanitizationError("WebP has no image chunks")
    body = b"".join(kept)
    return b"RIFF" + struct.pack("<I", 4 + len(body)) + b"WEBP" + body, removed


def _sanitize_bytes(data: bytes) -> tuple[bytes, str, list[str]]:
    if data.startswith(PNG_SIGNATURE):
        sanitized, removed = sanitize_png(data)
        return sanitized, "PNG", removed
    if data.startswith(b"\xFF\xD8"):
        sanitized, removed = sanitize_jpeg(data)
        return sanitized, "JPEG", removed
    if len(data) >= 12 and data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        sanitized, removed = sanitize_webp(data)
        return sanitized, "WebP", removed
    raise SanitizationError("unsupported image format; supported formats are PNG, JPEG, and WebP")


def sanitize_file(source: Path, output: Path) -> list[str]:
    source = Path(source).expanduser()
    output = Path(output).expanduser()
    if not source.is_file():
        raise SanitizationError(f"input file does not exist: {source}")
    if source.resolve() == output.resolve():
        raise SanitizationError("output must differ from input; use --in-place for replacement")

    original = source.read_bytes()
    sanitized, image_format, removed = _sanitize_bytes(original)
    # Idempotence is a useful verification that no removable container remains.
    verified, _, remaining = _sanitize_bytes(sanitized)
    if verified != sanitized or remaining:
        raise SanitizationError(
            f"verification failed for {image_format}: remaining chunks/segments {remaining}"
        )

    output.parent.mkdir(parents=True, exist_ok=True)
    fd, temp_name = tempfile.mkstemp(prefix=f".{output.name}.", dir=output.parent)
    try:
        with os.fdopen(fd, "wb") as handle:
            handle.write(sanitized)
            handle.flush()
            os.fsync(handle.fileno())
        shutil.copymode(source, temp_name)
        os.replace(temp_name, output)
    finally:
        if os.path.exists(temp_name):
            os.unlink(temp_name)
    return removed


def _default_output(source: Path) -> Path:
    return source.with_name(f"{source.stem} - sanitized{source.suffix}")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Remove embedded metadata and C2PA/provenance payloads from PNG, JPEG, or WebP images."
    )
    parser.add_argument("input", type=Path, help="source image")
    group = parser.add_mutually_exclusive_group()
    group.add_argument("-o", "--output", type=Path, help="sanitized output path")
    group.add_argument("--in-place", action="store_true", help="replace the source image")
    args = parser.parse_args(argv)

    source = args.input.expanduser()
    output = source if args.in_place else (args.output or _default_output(source)).expanduser()
    try:
        if args.in_place:
            original = source.read_bytes()
            with tempfile.NamedTemporaryFile(
                prefix=f".{source.name}.", dir=source.parent, suffix=source.suffix, delete=False
            ) as temp:
                temp_path = Path(temp.name)
            try:
                removed = sanitize_file(source, temp_path)
                os.replace(temp_path, source)
            finally:
                if temp_path.exists():
                    temp_path.unlink()
        else:
            removed = sanitize_file(source, output)
    except (OSError, SanitizationError) as error:
        print(f"error: {error}", file=sys.stderr)
        return 1

    target = source if args.in_place else output
    if removed:
        print(f"Sanitized {source} -> {target}; removed: {', '.join(removed)}")
    else:
        print(f"Verified {source} -> {target}; no removable metadata found")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
