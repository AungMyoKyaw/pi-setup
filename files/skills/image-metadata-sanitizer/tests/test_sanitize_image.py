from __future__ import annotations

import struct
import sys
import zlib
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parents[1] / "scripts"))
from sanitize_image import sanitize_file  # noqa: E402

PNG_SIGNATURE = b"\x89PNG\r\n\x1a\n"


def png_chunk(kind: bytes, payload: bytes) -> bytes:
    return (
        struct.pack(">I", len(payload))
        + kind
        + payload
        + struct.pack(">I", zlib.crc32(kind + payload) & 0xFFFFFFFF)
    )


def png_chunk_types(data: bytes) -> list[bytes]:
    types = []
    pos = len(PNG_SIGNATURE)
    while pos < len(data):
        length = struct.unpack(">I", data[pos : pos + 4])[0]
        types.append(data[pos + 4 : pos + 8])
        pos += length + 12
    return types


def test_png_removes_c2pa_ancillary_chunk(tmp_path: Path) -> None:
    ihdr = struct.pack(">IIBBBBB", 1, 1, 8, 2, 0, 0, 0)
    scanline = zlib.compress(b"\x00\x01\x02\x03")
    source = tmp_path / "source.png"
    output = tmp_path / "sanitized.png"
    source.write_bytes(
        PNG_SIGNATURE
        + png_chunk(b"IHDR", ihdr)
        + png_chunk(b"caBX", b"C2PA manifest payload")
        + png_chunk(b"IDAT", scanline)
        + png_chunk(b"IEND", b"")
    )

    sanitize_file(source, output)

    sanitized = output.read_bytes()
    assert png_chunk_types(sanitized) == [b"IHDR", b"IDAT", b"IEND"]
    assert b"caBX" not in sanitized
    assert b"C2PA" not in sanitized
