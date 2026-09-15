# Scribd network patterns & gotchas

This is the long-form reference for the URL formats, JWT token structure,
and CDN behaviour the skill relies on. Read this when something breaks or
when Scribd changes their stack.

## URL patterns

Every Scribd HTML document has a `format_uuid` — a 16-char alphanumeric
identifier like `6a4ysvbj7kg1mrm4`. It is not the same as the document ID
in the public URL (`/document/{doc_id}/...`). You can find it:

- In the URL of any loaded page image: `html.scribdassets.com/{format_uuid}/images/...`
- In the `contentUrl` of each entry in `window.docManager.pages`
- In the embedded JSON inside the initial page HTML (search for `format_uuid`
  in the document body)

### Page image URL

```
https://html.scribdassets.com/{format_uuid}/images/{page_num}-{hash}.jpg?token={jwt}
```

- `format_uuid` — 16 alphanumeric chars, document-wide
- `page_num` — 1-indexed integer, matches `pageNum` in `docManager.pages`
- `hash` — 10 hex chars, **unique per page**, derived server-side (not from
  content; appears stable per document per page, may change across re-uploads)
- `token` — JWT (see below)

A 404 from this URL means either: the format_uuid is wrong, the page_num is
out of range, or the token is expired/has wrong claims.

### Page metadata URL (jsonp)

```
https://html.scribdassets.com/{format_uuid}/pages/{page_num}-{hash}.jsonp?token={jwt}
```

Returns `window.page{N}_callback(["<html>..."])` — a JSONP wrapper around the
HTML for one page. The script doesn't need this (the image alone is enough)
but it's the endpoint that exposes page hashes to Scribd's own code.

## JWT image token

Sample payload (base64-decoded):

```json
{
  "iss": "scribd-monolith",
  "iat": 1788718826,
  "exp": 1791310826,
  "format_uuid": "6a4ysvbj7kg1mrm4",
  "page_min": 1,
  "page_max": 379,
  "enforce": true,
  "x_scribd_uuid": "87f3b8b5-3fc1-48d7-ab43-52911b53e034",
  "x_request_id": "2763e68c121e6ecf1d180fd4995a68a9b4357387e9eda66208b7f3dbde98cd41"
}
```

Key fields:

- `exp` — Unix timestamp, ~8 months from issue. Tokens are usable past `exp`
  in practice (CDN is forgiving) but don't rely on it.
- `page_min` / `page_max` — the token only authorises this range. Asking for
  a page outside the range returns HTTP 403.
- `format_uuid` — bound to the token. Reusing a token across documents
  doesn't work.
- `enforce: true` — server actually checks the JWT, not just trusts the URL.

### Token sources

In order of preference:

1. **Already-loaded image on the page.** Any `<img>` whose `src` contains
   `?token=` gives you a working token without any extra HTTP call. Easiest.
2. **POST `/document/{doc_id}/token`** — what Scribd's own code calls. Returns
   `{"token": "...", "expires_at": ...}`. Requires the same CSRF cookie
   state as a logged-in or first-time-visitor session. Often blocked if the
   document is flagged or the visitor has hit the rate limit.
3. **Scraped from the initial HTML.** The `format_uuid` and a partial token
   appear in the page source. Not reliable across redesigns.

## CDN behaviour

### Image format negotiation

Scribd's CDN sits behind Fastly + S3 and serves the page image in multiple
formats based on `Accept` and `User-Agent`:

| `Accept` header      | Returned format | Magic bytes          |
| -------------------- | --------------- | -------------------- |
| `image/webp` present | WEBP            | `52 49 46 46` (RIFF) |
| No `image/webp`      | JPEG            | `FF D8 FF E0`        |

The `Accept` header is the lever. The bundled `download_pages.py` sends
`Accept: image/jpeg,image/png,image/*;q=0.9,*/*;q=0.8` to force JPEG. If you
ever see a downloaded file with RIFF magic bytes, the header is wrong.

### Compression

Server honours `Accept-Encoding: gzip`. There is no `br` (brotli) support on
the image endpoint. The downloader handles gzip transparently.

### Caching

- `Cache-Control: max-age=...` on image responses is several days; safe to
  redownload without re-fetching the token.
- Page metadata (`*.jsonp`) is also cacheable but rarely needed once the
  manifest is captured.

### Rate limiting

- Roughly the first 100 requests succeed at ~20 req/s.
- After that, Fastly returns the same image at ~0.3 req/s with no error code
  (the response is fine, just throttled). Total time for a 379-page doc:
  ~10–20 minutes.
- The bundled script retries with backoff and increases concurrency tolerance;
  if you see "bad bytes" or `URLError` it's almost always the throttling
  kicking in, not an auth problem.

## Fallback: scroll-based harvesting

If `window.docManager.pages` is unavailable (rare; older embed views, certain
geo-fenced responses), you can drive Scribd's own lazy loader instead:

```javascript
async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const out = new Map();
  const capture = () => {
    for (const img of document.querySelectorAll('img.absimg')) {
      const m = img.closest('[id^="outer_page_"]')?.id?.match(/outer_page_(\d+)/);
      if (!m) continue;
      const n = +m[1];
      if (img.src?.startsWith('http') && !out.has(n)) out.set(n, img.src);
    }
  };
  capture();
  let y = 0;
  while (y < document.body.scrollHeight) {
    y = Math.min(y + 800, document.body.scrollHeight);
    window.scrollTo(0, y);
    await sleep(300);
    capture();
  }
  window.scrollTo(0, document.body.scrollHeight);
  await sleep(800);
  capture();
  return [...out.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([n, u]) => ({ n, u: u.split('?')[0] }));
};
```

This is slower (~25 minutes for 379 pages because Scribd only pre-loads the
viewport) and produces `contentUrl`s without the `?token=` suffix, so you'll
need to re-attach the token in the script. Prefer the `docManager.pages` path.

## Troubleshooting

| Symptom                                    | Likely cause                            | Fix                                                                      |
| ------------------------------------------ | --------------------------------------- | ------------------------------------------------------------------------ |
| `window.docManager` is `undefined`         | Geo-block / private doc / embed         | Ask user for a non-embed URL or credentials                              |
| Token returns 403 on first page            | Wrong `format_uuid`, expired token      | Re-fetch from a fresh loaded `<img>`                                     |
| All downloads return `bad bytes (RIFF...)` | `Accept` header included WEBP           | Strip `image/webp` from `Accept`                                         |
| Downloads slow after page 100              | CDN rate limit (expected)               | Let script retry; don't bump concurrency past 20                         |
| Final PDF pages are blank                  | `Content-Type: image/webp` was returned | Re-download with correct `Accept` header; check page 1 manually          |
| `URLError: nodename nor servname provided` | DNS hiccup mid-download                 | Script retries; if persistent, check network and rerun                   |
| Page count in PDF < source page count      | Some downloads failed silently          | Check for `0 http` log lines and rerun with `--concurrency 1` to isolate |
