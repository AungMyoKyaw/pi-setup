#!/usr/bin/env python3
"""
Assemble per-page JPEGs from a Scribd download into a single multi-page PDF.

Input:
  --images DIR   # directory containing page_NNN.jpg files
  --out   FILE   # output PDF path (default: <images-dir>/document.pdf)
  --dpi   N      # PDF resolution metadata (default 150)
  --quality N    # JPEG re-encode quality if normalization needed (default 85)

Behaviour:
  - Loads page_*.jpg in sorted order (page_001, page_002, ...)
  - Uses the first image's page size as the PDF page size
  - Embeds each image at full quality without re-encoding by default
  - All images are converted to RGB mode (drops alpha for PDF compatibility)
"""
from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

from PIL import Image


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--images", required=True, type=Path,
                   help="Directory of page_NNN.jpg files")
    p.add_argument("--out", type=Path, default=None,
                   help="Output PDF path (default: <images>/document.pdf)")
    p.add_argument("--dpi", type=int, default=150,
                   help="PDF resolution metadata (default 150)")
    return p.parse_args()


def page_sort_key(p: Path) -> int:
    m = re.search(r"page_(\d+)\.jpg$", p.name)
    return int(m.group(1)) if m else 0


def main() -> int:
    args = parse_args()
    out_path = args.out or (args.images / "document.pdf")

    pages = sorted(args.images.glob("page_*.jpg"), key=page_sort_key)
    if not pages:
        print(f"[!] No page_*.jpg files in {args.images}", file=sys.stderr)
        return 1
    print(f"[+] Building PDF from {len(pages)} images in {args.images}")

    first = Image.open(pages[0])
    if first.mode != "RGB":
        first = first.convert("RGB")

    rest = []
    for p in pages[1:]:
        im = Image.open(p)
        if im.mode != "RGB":
            im = im.convert("RGB")
        rest.append(im)

    first.save(
        out_path,
        format="PDF",
        save_all=True,
        append_images=rest,
        resolution=float(args.dpi),
    )
    size_mb = out_path.stat().st_size / 1024 / 1024
    print(f"[+] Wrote {out_path} ({size_mb:.1f} MB)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
