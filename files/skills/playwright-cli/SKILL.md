---
name: playwright-cli
description: Use when a task involves `playwright-cli`, the Playwright MCP CLI, browser automation, page snapshots, element refs, network mocking, cookies/storage, video/trace recording, the Playwright dashboard, or any of its subcommands (open, goto, click, fill, snapshot, find, eval, run-code, requests, route, console, cookies, localStorage, sessionStorage, video-*, tracing-*, webmcp-*). Prefer it over writing raw Playwright code when the user just wants browser actions scripted.
allowed-tools: Bash(playwright-cli:*)
---

# playwright-cli

`playwright-cli` is the Playwright MCP CLI: every Playwright action you can do in the MCP server, scripted from the terminal. The installed binary is whatever is on `$PATH`; verify with `playwright-cli --version` and `playwright-cli --help`. A full recursive help snapshot for the installed version lives at [references/cli-help.md](references/cli-help.md). Refresh it with `bash ~/.agents/skills/playwright-cli/scripts/dump-help.sh`.

Targets for `click`, `fill`, `hover`, etc. accept either a snapshot element ref (from `playwright-cli snapshot`) or a unique CSS selector. Snapshot refs are the canonical way to reference elements after the page loads.

## Open a browser

```bash
playwright-cli open                              # headless, default browser
playwright-cli open https://example.com          # open + navigate
playwright-cli open --browser=firefox            # firefox / webkit / msedge
playwright-cli open --headed --persistent        # visible window, persistent profile
playwright-cli open --device="iphone 15"         # device emulation
playwright-cli open --mobile                     # generic mobile (lighter pages, fewer tokens)
playwright-cli open --config=.playwright/cli.config.json
playwright-cli close
```

Sessions are persistent across calls. `playwright-cli list` shows live sessions; `playwright-cli close-all` and `playwright-cli kill-all` clean them up (kill-all is for zombie processes). `-s=<session>` targets a named session.

## Navigate

```bash
playwright-cli goto https://example.com/path
playwright-cli go-back
playwright-cli go-forward
playwright-cli reload
playwright-cli resize 1280 800
playwright-cli tab-list
playwright-cli tab-new https://example.com
playwright-cli tab-select 2
playwright-cli tab-close        # closes current
playwright-cli tab-close 1      # closes index 1
```

## Snapshot → find → act

The core loop is: get a snapshot, find a ref, act on it.

```bash
playwright-cli snapshot                       # full page snapshot (element refs)
playwright-cli snapshot --depth=4              # limit tree depth
playwright-cli snapshot --boxes                # include [box=x,y,w,h] per element
playwright-cli snapshot --filename=page.md    # write markdown instead of returning

playwright-cli find "Sign in"                 # substring search in snapshot
playwright-cli find --regex '^Sign.*$'        # regex variant

playwright-cli click "@e12"                   # snapshot ref
playwright-cli click "button.primary"         # or unique selector
playwright-cli click "@e12" right             # button: left | right | middle
playwright-cli click "@e12" --modifiers=Shift # repeatable
playwright-cli dblclick "@e12"
playwright-cli hover "@e5"
playwright-cli type "hello world"             # types into focused editable
playwright-cli fill "@e3" "user@example.com"  # sets input value
playwright-cli fill "@e3" "x" --submit        # press enter after
playwright-cli select "@e7" "option-value"
playwright-cli check "@e9"
playwright-cli uncheck "@e9"
playwright-cli drag "@e10" "@e11"
playwright-cli drop "@e11" --path=/tmp/a.png --path=/tmp/b.png
playwright-cli drop "@e11" --data "text/plain=hello"
playwright-cli upload /tmp/a.png /tmp/b.png    # on a file input
playwright-cli generate-locator "@e12"        # print playwright locator string
```

`eval` runs JS in the page; pass an element to receive it as the function arg:

```bash
playwright-cli eval '() => document.title'
playwright-cli eval '(el) => el.textContent' "@e12"
playwright-cli eval '() => JSON.stringify(window.performance.timing)' --filename=perf.json
```

For arbitrary Playwright code (not just snapshots/refs) use `run-code`:

```bash
playwright-cli run-code 'async (page) => { await page.locator("h1").first().screenshot({ path: "h1.png" }); }'
playwright-cli run-code --filename=./snippet.js
```

## Keyboard and mouse

```bash
playwright-cli press Enter                   # also: ArrowLeft, a, Escape, Tab, ...
playwright-cli press "Control+a"
playwright-cli keydown Shift
playwright-cli keyup Shift
playwright-cli mousemove 100 200
playwright-cli mousedown                      # left
playwright-cli mousedown right
playwright-cli mouseup
playwright-cli mousewheel 0 400               # scroll down
```

## Dialogs

```bash
playwright-cli dialog-accept                  # OK
playwright-cli dialog-accept "typed text"     # for prompt() dialogs
playwright-cli dialog-dismiss                 # Cancel
```

## Save: screenshot and PDF

```bash
playwright-cli screenshot                     # viewport, auto-named
playwright-cli screenshot "@e12"              # element
playwright-cli screenshot --full-page --filename=full.png
playwright-cli screenshot --hires --filename=shot@2x.png
playwright-cli screenshot --type=jpeg        # png | jpeg | webp
playwright-cli pdf --filename=page.pdf
```

## Storage

Auth state (cookies + localStorage origin entries):

```bash
playwright-cli state-save auth.json
playwright-cli state-load auth.json
```

Cookies:

```bash
playwright-cli cookie-list
playwright-cli cookie-list --domain=example.com --path=/api
playwright-cli cookie-get session_id
playwright-cli cookie-set session_id "abc123" \
  --domain=.example.com --path=/ --secure --httpOnly --sameSite=Lax \
  --expires=1735689600
playwright-cli cookie-delete session_id
playwright-cli cookie-clear
```

localStorage / sessionStorage:

```bash
playwright-cli localstorage-list
playwright-cli localstorage-get key
playwright-cli localstorage-set key "value"
playwright-cli localstorage-delete key
playwright-cli localstorage-clear
# sessionstorage-* is the same shape
```

## Network

Inspect:

```bash
playwright-cli requests                              # numbered list
playwright-cli requests --filter='/api/.*user'
playwright-cli requests --static                     # include images/scripts/css
playwright-cli requests --clear                      # reset the log
playwright-cli request 7                             # full headers + body + response
playwright-cli request-headers 7
playwright-cli request-body 7 --filename=req.bin     # binary-safe
playwright-cli response-headers 7
playwright-cli response-body 7
playwright-cli response-body 7 --filename=resp.json
```

Mock and control:

```bash
# Mock by glob
playwright-cli route '**/api/users' --status=200 \
  --body='[{"id":1,"name":"Ada"}]' --content-type='application/json'
playwright-cli route '**/api/**' --header='X-Test: 1' --remove-header='x-powered-by'
playwright-cli route-list
playwright-cli unroute '**/api/users'      # or omit pattern to remove all

# Online/offline
playwright-cli network-state-set offline
playwright-cli network-state-set online
```

## DevTools

```bash
playwright-cli console                     # default = info level
playwright-cli console error               # error|warning|info|log|debug|verbose
playwright-cli console debug --clear       # clear console log

# Recordings and traces
playwright-cli recording-start
playwright-cli recording-stop              # prints Playwright code
playwright-cli tracing-start
playwright-cli tracing-stop
playwright-cli show                        # open dashboard
playwright-cli show --port=0 --host=127.0.0.1 --annotate
playwright-cli show --kill                 # kill dashboard daemon

# Step debugging (works with paused test runs)
playwright-cli pause-at tests/foo.spec.ts:42
playwright-cli resume
playwright-cli step-over

# Visual highlights on the page
playwright-cli highlight "@e12"
playwright-cli highlight "@e12" --style="outline: 2px dashed red"
playwright-cli highlight --hide "@e12"
playwright-cli highlight --hide              # hide all
```

## Video recording

```bash
playwright-cli video-start demo.webm
playwright-cli video-start --size=1280x720
playwright-cli video-chapter "Login" --duration=2000
playwright-cli video-show-actions                          # annotate subsequent calls
playwright-cli video-show-actions --position=bottom-left --cursor=none
playwright-cli video-stop
playwright-cli video-hide-actions
```

## WebMCP (page-registered tools)

```bash
playwright-cli webmcp-list
playwright-cli webmcp-call search
playwright-cli webmcp-call search --params='{"query":"cats"}'
playwright-cli webmcp-call search --frame=frameA   # disambiguate by frame
```

## Output flags and cleanup

```bash
playwright-cli --json snapshot          # JSON envelope
playwright-cli --raw eval '() => 1+1'   # only the result value, no status/code
playwright-cli delete-data              # wipe session data
```

## Common recipes

Log into a site once, reuse the session:

```bash
playwright-cli open --persistent https://app.example.com/login
playwright-cli snapshot
playwright-cli fill "@email" "me@example.com"
playwright-cli fill "@password" "..." --submit
playwright-cli state-save ~/.state/example.json
# Later:
playwright-cli open --persistent https://app.example.com
playwright-cli state-load ~/.state/example.json
playwright-cli goto https://app.example.com/dashboard
```

Inspect an XHR-driven page:

```bash
playwright-cli open https://example.com
playwright-cli goto https://example.com/search?q=cats
playwright-cli requests --filter='/api/'
playwright-cli response-body 3
```

Mock an API to unblock a flaky test:

```bash
playwright-cli route '**/api/feature-flag' \
  --body='{"enabled":true}' --content-type='application/json'
playwright-cli reload
```

Capture a narrated demo:

```bash
playwright-cli video-start demo.webm
playwright-cli video-show-actions --position=top-right
playwright-cli goto https://example.com
playwright-cli video-chapter "Homepage"
playwright-cli snapshot
playwright-cli click "@cta"
playwright-cli video-stop
```

## Troubleshooting

- **"snapshot is empty / element ref not found"**: re-run `playwright-cli snapshot` — refs (`@e12`) are per-snapshot and invalidated by DOM changes.
- **Selector matches nothing**: `playwright-cli generate-locator "@e12"` prints a stable Playwright locator you can reuse.
- **Stale browser / zombie session**: `playwright-cli list`, then `playwright-cli close-all` or `kill-all`.
- **Binary response bodies**: `request-body` / `response-body` save to a file when binary; the path is printed.
- **Help has changed since this skill was written**: re-run `bash ~/.agents/skills/playwright-cli/scripts/dump-help.sh`. The reference file is generated, not hand-edited.
