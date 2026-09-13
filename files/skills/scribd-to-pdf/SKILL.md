---
name: scribd-to-pdf
description: >-
  Download any Scribd document as full-resolution JPEGs and assemble them into
  a single PDF, bypassing Scribd's paywall/download flow. Use this skill
  whenever the user shares a scribd.com/document/... URL and wants the content
  saved offline — including "save this Scribd as PDF", "download this Scribd
  document", "Scribd to PDF", "mirror this Scribd book", or "save all pages of
  this Scribd link". Works for public documents (no login required). The
  resulting PDF is built from per-page images at Scribd's native resolution
  (typically 904×1278 or 812×1278 px per page), preserving every page in
  document order.
---

# Scribd → PDF (full resolution, page-by-page)

Scribd hides full-page images behind an IntersectionObserver-based lazy loader
and gates the public download button behind a signup flow. Both can be bypassed
because Scribd's own JS state (`window.docManager.pages`) already exposes every
page's CDN URL, and the page-level JWT image token is requestable from a single
authenticated endpoint.

The workflow has three phases:

1. **Discover** — load the document in a real browser, extract the page manifest
   and a fresh image token.
2. **Download** — fetch each page's full-resolution JPEG in parallel (with the
   right `Accept` header — see gotcha #1 below).
3. **Build** — assemble the JPEGs into a single multi-page PDF.

## Phase 1 — Discover

```bash
# Open the document in a new playwright session
playwright-cli -s=scribd open "<SCRIBD_URL>"

# Dismiss the cookie banner if present
playwright-cli -s=scribd click "Close this consent banner"   # role-based selector
```

Now extract the page manifest and a fresh image token. Scribd's page state
is on `window.docManager`, and any already-loaded `<img>` has the token in
its `src`. The bundled `discover_pages.py` does both in one shot:

```bash
python3 ~/.agents/skills/scribd-to-pdf/scripts/discover_pages.py \
  --session scribd \
  --out-dir .
```

This writes `pages.json` (an array of `{n, u}` for every page) and
`token.txt` (the JWT) into the current directory.

If you'd rather run the eval manually:

```bash
playwright-cli -s=scribd --raw eval "(() => {
  const pages = window.docManager.pages;
  const out = [];
  for (const k of Object.keys(pages)) {
    const p = pages[k];
    out.push({ n: p.pageNum, u: p.contentUrl });
  }
  return JSON.stringify(out);
})()" > /tmp/raw.json

python3 -c "
import json
with open('/tmp/raw.json') as f: s = f.read().strip()
if s.startswith('\"') and s.endswith('\"'): s = s[1:-1]
s = bytes(s, 'utf-8').decode('unicode_escape')
with open('pages.json', 'w') as f: json.dump(json.loads(s), f, indent=2)
print('wrote', len(json.load(open('pages.json'))), 'pages')
"

playwright-cli -s=scribd --raw eval "(() => {
  const img = [...document.querySelectorAll('img.absimg')].find(i => i.src.includes('token='));
  return img ? new URL(img.src).searchParams.get('token') : null;
})()" > token.txt
```

Verify the token is non-empty and decoded payload claims `page_min: 1` and
`page_max: N` (where N is the document's page count). Tokens are valid for
roughly 8 months.

If `window.docManager` is missing (very old documents, embed views, or some
embed contexts), fall back to a slow scroll-and-collect strategy described in
`references/network-patterns.md` § "Fallback: scroll-based harvesting".

## Phase 2 — Download

Run the bundled script. It accepts the page manifest and token as inputs and
downloads every page in parallel:

```bash
python3 ~/.agents/skills/scribd-to-pdf/scripts/download_pages.py \
  --pages pages.json \
  --token "$(cat token.txt)" \
  --out-dir ./images \
  --concurrency 10
```

This produces `images/page_001.jpg` through `images/page_NNN.jpg`. Each file
is a full-resolution JPEG at the document's native pixel dimensions.

**Gotcha #1 — `Accept` header controls image format.** Scribd's CDN serves
WEBP (`Content-Type: image/webp`, RIFF magic) when the client sends
`Accept: image/webp`. PIL/macOS Preview/most PDF tools expect JPEG. The script
sends `Accept: image/jpeg` to force the JPEG variant. Do not "improve" the
script by adding `image/webp` to the Accept list — you will silently get WEBP
files with `.jpg` extensions.

**Gotcha #2 — the URL contains a page-specific hash.** Each page's image URL
is `…/images/{pageNum}-{10-char-hex}.jpg?token={jwt}`. The hash is **not**
guessable from the page number; you must obtain it from the page manifest (or
by reading an already-loaded `<img>`). The bundled script extracts the hash
from the `contentUrl` for each entry in `pages.json`.

**Gotcha #3 — rate limiting kicks in.** Throughput drops from ~20 req/s to
~0.3 req/s after roughly the first 100 requests. The script handles this
transparently (retries with exponential backoff), but expect downloads of
300+ page documents to take 10–20 minutes.

## Phase 3 — Build the PDF

```bash
python3 ~/.agents/skills/scribd-to-pdf/scripts/make_pdf.py \
  --images ./images \
  --out document.pdf
```

The PDF embeds every JPEG at 150 DPI without re-encoding. File size is roughly
1.5× the total image bytes (typical 379-page book → ~70 MB).

## Cleanup

```bash
playwright-cli -s=scribd close
```

(Or just let the session sit; it will be reaped on browser close.)

## Output

- `document.pdf` — the final PDF, 379 pages (or however many the document has),
  page order matching the source.
- `images/page_*.jpg` — individual page JPEGs kept for archival/inspection.
  These can be deleted once the PDF is verified.

## When this skill is the wrong tool

- The document is **private** or paywalled at the URL level (you get redirected
  to a signup page, no `docManager.pages`). Stop and ask the user for
  credentials or a public mirror.
- The document is **embedded** via Scribd's iframe widget. Use the parent
  page's URL instead, or fetch via `scribd.com/embeds/{id}/content`.
- The user only wants **a few specific pages**. Skip the PDF build — just
  download the page indices they asked for (e.g. `page_042.jpg`, `page_137.jpg`).

## References

- `references/network-patterns.md` — URL/token format spec, WEBP gotcha
  details, fallback scroll-and-collect strategy, troubleshooting.
