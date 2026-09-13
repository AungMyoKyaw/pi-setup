#!/usr/bin/env python3
"""
Download all page images from a Scribd document.

Input:
  --pages  pages.json   # [{ "n": 1, "u": ".../pages/1-{hash}.jsonp" }, ...]
  --token  "<jwt>"      # page-image JWT from a loaded <img> or /document/.../token
  --out-dir DIR         # where to write page_NNN.jpg files
  --concurrency N       # parallel downloads (default 10, max 20)

The script:
  1. Converts each jsonp contentUrl into the actual image URL
     (format_uuid/images/{N}-{hash}.jpg?token=...)
  2. Downloads in parallel with the right Accept header (JPEG, not WEBP)
  3. Retries failed downloads with backoff
  4. Saves files as page_001.jpg ... page_NNN.jpg, zero-padded to 3 digits
     (wider if the document has more than 999 pages)
"""
from __future__ import annotations

import argparse
import gzip
import json
import re
import sys
import time
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--pages", required=True, type=Path,
                   help="Path to pages.json (from window.docManager.pages)")
    p.add_argument("--token", required=True,
                   help="JWT image token from a loaded <img> or /document/.../token")
    p.add_argument("--out-dir", required=True, type=Path,
                   help="Directory to write page_NNN.jpg files into")
    p.add_argument("--concurrency", type=int, default=10,
                   help="Parallel download workers (1-20)")
    p.add_argument("--retries", type=int, default=5,
                   help="Retries per page on transient failures")
    return p.parse_args()


def build_image_url(content_url: str, token: str) -> str:
    """jsonp contentUrl → full-resolution JPEG URL with token.

    Example:
      contentUrl: .../pages/1-c7a4858ff8.jsonp
      result:     .../images/1-c7a4858ff8.jpg?token=...
    """
    m = re.search(r"/(\d+)-([a-f0-9]+)\.jsonp", content_url)
    if not m:
        raise ValueError(f"Unexpected contentUrl: {content_url}")
    page_num, page_hash = m.group(1), m.group(2)
    # Rebuild the base from the contentUrl so this works for any document.
    # Content URLs look like:  https://html.scribdassets.com/{format_uuid}/pages/N-hash.jsonp
    # We just need everything up to but not including /pages/
    m2 = re.match(r"(https?://[^/]+/[^/]+)/pages/", content_url)
    if not m2:
        raise ValueError(f"Could not extract base from contentUrl: {content_url}")
    base = m2.group(1)
    return f"{base}/images/{page_num}-{page_hash}.jpg?token={token}"


def download_one(
    page_num: int,
    image_url: str,
    dest: Path,
    retries: int,
) -> tuple[int, int, str]:
    """Returns (page_num, http_code, status_string)."""
    # Do NOT send Accept: image/webp — that makes the CDN return WEBP.
    # We want JPEG so PIL/PDF tools handle the files directly.
    headers = {
        "User-Agent": (
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
            "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
        ),
        "Accept": "image/jpeg,image/png,image/*;q=0.9,*/*;q=0.8",
        "Accept-Encoding": "gzip",
        "Referer": "https://www.scribd.com/",
    }
    last_err = ""
    for attempt in range(1, retries + 1):
        try:
            req = urllib.request.Request(image_url, headers=headers)
            with urllib.request.urlopen(req, timeout=60) as resp:
                code = resp.getcode()
                if code != 200:
                    last_err = f"http {code}"
                    time.sleep(0.5 * attempt)
                    continue
                data = resp.read()
                enc = (resp.headers.get("Content-Encoding") or "").lower()
                if "gzip" in enc:
                    data = gzip.decompress(data)
                ct = (resp.headers.get("Content-Type") or "").lower()
                if not data.startswith(b"\xff\xd8"):
                    last_err = f"bad bytes (len={len(data)}, ct={ct or '?'})"
                    time.sleep(0.5 * attempt)
                    continue
                dest.write_bytes(data)
                return page_num, 200, str(dest)
        except Exception as e:
            last_err = f"{type(e).__name__}: {e}"
            time.sleep(0.5 * attempt)
    return page_num, 0, last_err


def main() -> int:
    args = parse_args()
    if not (1 <= args.concurrency <= 20):
        print(f"[!] --concurrency must be 1-20, got {args.concurrency}", file=sys.stderr)
        return 2
    args.out_dir.mkdir(parents=True, exist_ok=True)
    # Wipe previous run
    for old in args.out_dir.glob("page_*.jpg"):
        old.unlink()

    with args.pages.open() as f:
        pages = json.load(f)
    print(f"[+] Loaded {len(pages)} pages from {args.pages}")

    width = max(3, len(str(len(pages))))  # 3 for up to 999 pages, 4 for 1000+
    tasks = []
    for entry in pages:
        n = entry["n"]
        url = build_image_url(entry["u"], args.token)
        dest = args.out_dir / f"page_{n:0{width}d}.jpg"
        tasks.append((n, url, dest))

    print(f"[+] Concurrency={args.concurrency}, retries={args.retries}")
    t0 = time.time()
    results: list[tuple[int, int, str]] = []
    completed = 0
    with ThreadPoolExecutor(max_workers=args.concurrency) as pool:
        futures = {
            pool.submit(download_one, n, url, dest, args.retries): (n, dest)
            for (n, url, dest) in tasks
        }
        for fut in as_completed(futures):
            n, dest = futures[fut]
            try:
                pn, code, msg = fut.result()
            except Exception as e:
                pn, code, msg = n, 0, f"exception: {e}"
            results.append((pn, code, msg))
            completed += 1
            if completed % 25 == 0 or completed == len(tasks):
                elapsed = time.time() - t0
                rate = completed / elapsed if elapsed > 0 else 0
                print(
                    f"    [{completed:>4}/{len(tasks)}] {elapsed:7.1f}s "
                    f"({rate:5.2f}/s) last=p{pn:0{width}d} {msg}"
                )

    ok = sum(1 for _, c, _ in results if c == 200)
    fail = len(results) - ok
    elapsed = time.time() - t0
    print(f"[+] Done: {ok} ok / {fail} failed in {elapsed:.1f}s")

    if fail:
        print("[!] Failed pages:")
        for pn, c, m in sorted(results):
            if c != 200:
                print(f"    p{pn:0{width}d}: {m}")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
