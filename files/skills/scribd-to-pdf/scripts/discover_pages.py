#!/usr/bin/env python3
"""
Scribd page discovery helper — extracts pages.json and a fresh image token
from an already-open playwright session.

Run this AFTER you have a playwright-cli session on the Scribd document:

    playwright-cli -s=scribd open "<URL>"
    playwright-cli -s=scribd click "Close this consent banner"   # if present
    playwright-cli -s=scribd --raw eval "..."                     # (see SKILL.md)

Then:

    python3 discover_pages.py --session scribd --out-dir .

It runs the two --raw eval commands for you and unwraps the double-quoted
JSON, saving pages.json and token.txt in --out-dir.
"""
from __future__ import annotations

import argparse
import json
import shlex
import subprocess
import sys
from pathlib import Path


PAGES_EVAL = """(() => {
  const pages = window.docManager.pages;
  const out = [];
  for (const k of Object.keys(pages)) {
    const p = pages[k];
    out.push({ n: p.pageNum, u: p.contentUrl });
  }
  return JSON.stringify(out);
})()"""

TOKEN_EVAL = """(() => {
  const img = [...document.querySelectorAll('img.absimg')].find(i => i.src && i.src.includes('token='));
  return img ? new URL(img.src).searchParams.get('token') : null;
})()"""


def run_eval(session: str, expr: str) -> str:
    cmd = ["playwright-cli", f"-s={session}", "--raw", "eval", expr]
    out = subprocess.check_output(cmd, text=True)
    return out.strip()


def unwrap_quoted_json(s: str) -> str:
    """playwright-cli --raw wraps the result in "..." with inner quotes escaped."""
    if s.startswith('"') and s.endswith('"'):
        s = s[1:-1]
    return bytes(s, "utf-8").decode("unicode_escape")


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--session", required=True,
                   help="playwright-cli session name (e.g. 'scribd')")
    p.add_argument("--out-dir", required=True, type=Path,
                   help="Where to write pages.json and token.txt")
    args = p.parse_args()
    args.out_dir.mkdir(parents=True, exist_ok=True)

    # Extract pages
    raw_pages = run_eval(args.session, PAGES_EVAL)
    pages_text = unwrap_quoted_json(raw_pages)
    pages = json.loads(pages_text)
    pages_path = args.out_dir / "pages.json"
    pages_path.write_text(json.dumps(pages, indent=2))
    print(f"[+] {len(pages)} pages → {pages_path}")

    # Extract token
    raw_token = run_eval(args.session, TOKEN_EVAL)
    token = unwrap_quoted_json(raw_token)
    if not token or token == "null":
        print("[!] No token found in any loaded <img>. Try scrolling a bit to "
              "trigger more lazy loads, then re-run.", file=sys.stderr)
        return 1
    token_path = args.out_dir / "token.txt"
    token_path.write_text(token)
    print(f"[+] token ({len(token)} chars) → {token_path}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
