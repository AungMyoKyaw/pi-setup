# playwright-cli help dump

- Generated: 2026-09-16T16:03:12Z
- Binary: ~/.bun/bin/playwright-cli
- Version: 0.1.20

## playwright-cli --help

```
playwright-cli - run playwright mcp commands from terminal

Usage: playwright-cli <command> [args] [options]
Usage: playwright-cli -s=<session> <command> [args] [options]

Core:
  open [url]                  open the browser
  attach [name]               attach to a running playwright browser
  close                       close the browser
  detach                      detach from an attached browser
  goto <url>                  navigate to a url
  type <text>                 type text into editable element
  click <target> [button]     perform click on a web page
  dblclick <target> [button]  perform double click on a web page
  fill <target> <text>        fill text into editable element
  drag <startTarget> <endTarget> perform drag and drop between two elements
  drop <target>               drop files or data onto an element
  hover <target>              hover over element on page
  select <target> <val>       select an option in a dropdown
  upload <files...>           upload one or multiple files
  check <target>              check a checkbox or radio button
  uncheck <target>            uncheck a checkbox or radio button
  snapshot [target]           capture page snapshot to obtain element ref
  find [text]                 search the page snapshot for text or a regexp, returning matching nodes with surrounding context (like search snippets)
  eval <func> [target]        evaluate javascript expression on page or element
  dialog-accept [prompt]      accept a dialog
  dialog-dismiss              dismiss a dialog
  resize <w> <h>              resize the browser window
  delete-data                 delete session data

Navigation:
  go-back                     go back to the previous page
  go-forward                  go forward to the next page
  reload                      reload the current page

Keyboard:
  press <key>                 press a key on the keyboard, `a`, `arrowleft`
  keydown <key>               press a key down on the keyboard
  keyup <key>                 press a key up on the keyboard

Mouse:
  mousemove <x> <y>           move mouse to a given position
  mousedown [button]          press mouse down
  mouseup [button]            press mouse up
  mousewheel <dx> <dy>        scroll mouse wheel

Save as:
  screenshot [target]         screenshot of the current page or element
  pdf                         save page as pdf

Tabs:
  tab-list                    list all tabs
  tab-new [url]               create a new tab
  tab-close [index]           close a browser tab
  tab-select <index>          select a browser tab

Storage:
  state-load <filename>       loads browser storage (authentication) state from a file
  state-save [filename]       saves the current storage (authentication) state to a file
  cookie-list                 list all cookies (optionally filtered by domain/path)
  cookie-get <name>           get a specific cookie by name
  cookie-set <name> <value>   set a cookie with optional flags
  cookie-delete <name>        delete a specific cookie
  cookie-clear                clear all cookies
  localstorage-list           list all localstorage key-value pairs
  localstorage-get <key>      get a localstorage item by key
  localstorage-set <key> <value> set a localstorage item
  localstorage-delete <key>   delete a localstorage item
  localstorage-clear          clear all localstorage
  sessionstorage-list         list all sessionstorage key-value pairs
  sessionstorage-get <key>    get a sessionstorage item by key
  sessionstorage-set <key> <value> set a sessionstorage item
  sessionstorage-delete <key> delete a sessionstorage item
  sessionstorage-clear        clear all sessionstorage

Network:
  requests                    list all network requests since loading the page. each request is numbered for use with the `request` command.
  request <index>             show full details (headers, body, response) of a single network request by its number from the `requests` command.
  request-headers <index>     print only the request headers for a single network request by its number from the `requests` command.
  request-body <index>        print only the request body for a single network request by its number from the `requests` command.
  response-headers <index>    print only the response headers for a single network request by its number from the `requests` command.
  response-body <index>       print the response body for a single network request by its number from the `requests` command. textual bodies are inlined; binary bodies are saved to a file and the path is printed.
  route <pattern>             mock network requests matching a url pattern
  route-list                  list all active network routes
  unroute [pattern]           remove routes matching a pattern (or all routes)
  network-state-set <state>   set the browser network state to online or offline

DevTools:
  console [min-level]         list console messages
  run-code [code]             run playwright code snippet
  recording-start             start recording user actions
  recording-stop              stop recording user actions and print them as playwright code
  tracing-start               start trace recording
  tracing-stop                stop trace recording
  video-start [filename]      start video recording
  video-stop                  stop video recording
  video-chapter <title>       add a chapter marker to the video recording
  video-show-actions          annotate subsequent cli/mcp actions on the page with a callout that names the action and highlights the target element
  video-hide-actions          stop annotating actions performed on the page
  show                        show playwright dashboard
  pause-at <location>         run the test up to a specific location and pause there
  resume                      resume the test execution
  step-over                   step over the next call in the test
  generate-locator <target>   generate a playwright locator for the given element
  highlight [target]          show (or with --hide, remove) a highlight overlay for an element; `--hide` without a target hides all page highlights.

WebMCP:
  webmcp-list                 list the webmcp tools registered by the page
  webmcp-call <name>          call a webmcp tool registered by the page

Install:
  install                     initialize workspace
  install-browser [browser]   install browser

Browser sessions:
  list                        list browser sessions
  close-all                   close all browser sessions
  kill-all                    forcefully kill all browser sessions (for stale/zombie processes)

Global options:
  --help [command]            print help
  --json                      output response as JSON
  --raw                       output only the result value, without status and code
  --version                   print version
```

### `open`

```
playwright-cli open [url]

Open the browser

Arguments:
  [url]                       the url to navigate to
Options:
  --browser                   browser or chrome channel to use, possible values: chrome, firefox, webkit, msedge.
  --config                    path to the configuration file, defaults to .playwright/cli.config.json
  --device                    emulate a specific device, for example "iphone 15".
  --headed                    run browser in headed mode
  --idle-timeout              shut the session down after this many milliseconds without a command. defaults to one hour for headless browsers, never for headed ones. pass 0 to disable.
  --mobile                    emulate a generic mobile device (pixel 10 for chromium, iphone 17 for webkit). mobile pages are usually lighter, which saves tokens.
  --persistent                use persistent browser profile
  --profile                   path to a persistent user data directory.

```

### `attach`

```
playwright-cli attach [name]

Attach to a running Playwright browser

Arguments:
  [name]                      bound browser name to attach to
Options:
  --cdp                       connect to an existing browser via cdp endpoint url.
  --endpoint                  playwright browser server endpoint to attach to.
  --extension                 connect to browser extension, optionally specify browser name (e.g. --extension=chrome)
  --config                    path to the configuration file, defaults to .playwright/cli.config.json
  --session                   session name (defaults to bound browser name or "default")
  --idle-timeout              detach after this many milliseconds without a command. attached browsers are never detached by default.

```

### `close`

```
playwright-cli close

Close the browser


```

### `detach`

```
playwright-cli detach

Detach from an attached browser


```

### `goto`

```
playwright-cli goto <url>

Navigate to a URL

Arguments:
  <url>                       the url to navigate to

```

### `type`

```
playwright-cli type <text>

Type text into editable element

Arguments:
  <text>                      text to type into the element
Options:
  --submit                    whether to submit entered text (press enter after)

```

### `click`

```
playwright-cli click <target> [button]

Perform click on a web page

Arguments:
  <target>                    exact target element reference from the page snapshot, or a unique element selector
  [button]                    button to click, defaults to left
Options:
  --modifiers                 modifier key to press (repeatable)

```

### `dblclick`

```
playwright-cli dblclick <target> [button]

Perform double click on a web page

Arguments:
  <target>                    exact target element reference from the page snapshot, or a unique element selector
  [button]                    button to click, defaults to left
Options:
  --modifiers                 modifier key to press (repeatable)

```

### `fill`

```
playwright-cli fill <target> <text>

Fill text into editable element

Arguments:
  <target>                    exact target element reference from the page snapshot, or a unique element selector
  <text>                      text to fill into the element
Options:
  --submit                    whether to submit entered text (press enter after)

```

### `drag`

```
playwright-cli drag <startTarget> <endTarget>

Perform drag and drop between two elements

Arguments:
  <startTarget>               exact source element reference from the page snapshot, or a unique element selector
  <endTarget>                 exact target element reference from the page snapshot, or a unique element selector

```

### `drop`

```
playwright-cli drop <target>

Drop files or data onto an element

Arguments:
  <target>                    exact target element reference from the page snapshot, or a unique element selector
Options:
  --path                      absolute path to a file to drop onto the element (repeatable)
  --data                      data to drop in "mime/type=value" format, e.g. --data "text/plain=hello" (repeatable)

```

### `hover`

```
playwright-cli hover <target>

Hover over element on page

Arguments:
  <target>                    exact target element reference from the page snapshot, or a unique element selector

```

### `select`

```
playwright-cli select <target> <val>

Select an option in a dropdown

Arguments:
  <target>                    exact target element reference from the page snapshot, or a unique element selector
  <val>                       value to select in the dropdown

```

### `upload`

```
playwright-cli upload <files...>

Upload one or multiple files

Arguments:
  <files...>                  the absolute paths to the files to upload

```

### `check`

```
playwright-cli check <target>

Check a checkbox or radio button

Arguments:
  <target>                    exact target element reference from the page snapshot, or a unique element selector

```

### `uncheck`

```
playwright-cli uncheck <target>

Uncheck a checkbox or radio button

Arguments:
  <target>                    exact target element reference from the page snapshot, or a unique element selector

```

### `snapshot`

```
playwright-cli snapshot [target]

Capture page snapshot to obtain element ref

Arguments:
  [target]                    element reference from the previous page snapshot, or a unique element selector for the root element to capture a partial snapshot instead of the whole page
Options:
  --filename                  save snapshot to markdown file instead of returning it in the response.
  --depth                     limit snapshot depth, unlimited by default.
  --boxes                     include each element's bounding box as [box=x,y,width,height] in the snapshot. coordinates are viewport-relative, in css pixels (element.getboundingclientrect).

```

### `find`

```
playwright-cli find [text]

Search the page snapshot for text or a regexp, returning matching nodes with surrounding context (like search snippets)

Arguments:
  [text]                      plain text to search for in the page snapshot (case-insensitive substring match)
Options:
  --regex                     regular expression to search for in the page snapshot. provide either a text argument or --regex, not both.

```

### `eval`

```
playwright-cli eval <func> [target]

Evaluate JavaScript expression on page or element

Arguments:
  <func>                      () => { /* code */ } or (element) => { /* code */ } when element is provided
  [target]                    exact target element reference from the page snapshot, or a unique element selector
Options:
  --filename                  save evaluation result to a file instead of returning it in the response.

```

### `dialog-accept`

```
playwright-cli dialog-accept [prompt]

Accept a dialog

Arguments:
  [prompt]                    the text of the prompt in case of a prompt dialog.

```

### `dialog-dismiss`

```
playwright-cli dialog-dismiss

Dismiss a dialog


```

### `resize`

```
playwright-cli resize <w> <h>

Resize the browser window

Arguments:
  <w>                         width of the browser window
  <h>                         height of the browser window

```

### `delete-data`

```
playwright-cli delete-data

Delete session data


```

### `go-back`

```
playwright-cli go-back

Go back to the previous page


```

### `go-forward`

```
playwright-cli go-forward

Go forward to the next page


```

### `reload`

```
playwright-cli reload

Reload the current page


```

### `press`

```
playwright-cli press <key>

Press a key on the keyboard, `a`, `ArrowLeft`

Arguments:
  <key>                       name of the key to press or a character to generate, such as `arrowleft` or `a`

```

### `keydown`

```
playwright-cli keydown <key>

Press a key down on the keyboard

Arguments:
  <key>                       name of the key to press or a character to generate, such as `arrowleft` or `a`

```

### `keyup`

```
playwright-cli keyup <key>

Press a key up on the keyboard

Arguments:
  <key>                       name of the key to press or a character to generate, such as `arrowleft` or `a`

```

### `mousemove`

```
playwright-cli mousemove <x> <y>

Move mouse to a given position

Arguments:
  <x>                         x coordinate
  <y>                         y coordinate

```

### `mousedown`

```
playwright-cli mousedown [button]

Press mouse down

Arguments:
  [button]                    button to press, defaults to left

```

### `mouseup`

```
playwright-cli mouseup [button]

Press mouse up

Arguments:
  [button]                    button to press, defaults to left

```

### `mousewheel`

```
playwright-cli mousewheel <dx> <dy>

Scroll mouse wheel

Arguments:
  <dx>                        x delta
  <dy>                        y delta

```

### `screenshot`

```
playwright-cli screenshot [target]

screenshot of the current page or element

Arguments:
  [target]                    exact target element reference from the page snapshot, or a unique element selector
Options:
  --filename                  file name to save the screenshot to. defaults to `page-{timestamp}.{png|jpeg|webp}` if not specified.
  --type                      image format. if unset, inferred from the filename extension, otherwise png. (one of: png, jpeg, webp)
  --full-page                 when true, takes a screenshot of the full scrollable page, instead of the currently visible viewport.
  --hires                     when true, captures a high-resolution screenshot using device pixels (accounts for the device pixel ratio), instead of css pixels.

```

### `pdf`

```
playwright-cli pdf

Save page as PDF

Options:
  --filename                  file name to save the pdf to. defaults to `page-{timestamp}.pdf` if not specified.

```

### `tab-list`

```
playwright-cli tab-list

List all tabs


```

### `tab-new`

```
playwright-cli tab-new [url]

Create a new tab

Arguments:
  [url]                       the url to navigate to in the new tab. if omitted, the new tab will be blank.

```

### `tab-close`

```
playwright-cli tab-close [index]

Close a browser tab

Arguments:
  [index]                     tab index. if omitted, current tab is closed.

```

### `tab-select`

```
playwright-cli tab-select <index>

Select a browser tab

Arguments:
  <index>                     tab index

```

### `state-load`

```
playwright-cli state-load <filename>

Loads browser storage (authentication) state from a file

Arguments:
  <filename>                  file name to load the storage state from.

```

### `state-save`

```
playwright-cli state-save [filename]

Saves the current storage (authentication) state to a file

Arguments:
  [filename]                  file name to save the storage state to.

```

### `cookie-list`

```
playwright-cli cookie-list

List all cookies (optionally filtered by domain/path)

Options:
  --domain                    filter cookies by domain
  --path                      filter cookies by path

```

### `cookie-get`

```
playwright-cli cookie-get <name>

Get a specific cookie by name

Arguments:
  <name>                      cookie name

```

### `cookie-set`

```
playwright-cli cookie-set <name> <value>

Set a cookie with optional flags

Arguments:
  <name>                      cookie name
  <value>                     cookie value
Options:
  --domain                    cookie domain
  --path                      cookie path
  --expires                   cookie expiration as unix timestamp
  --httpOnly                  whether the cookie is http only
  --secure                    whether the cookie is secure
  --sameSite                  cookie samesite attribute (one of: Strict, Lax, None)

```

### `cookie-delete`

```
playwright-cli cookie-delete <name>

Delete a specific cookie

Arguments:
  <name>                      cookie name

```

### `cookie-clear`

```
playwright-cli cookie-clear

Clear all cookies


```

### `localstorage-list`

```
playwright-cli localstorage-list

List all localStorage key-value pairs


```

### `localstorage-get`

```
playwright-cli localstorage-get <key>

Get a localStorage item by key

Arguments:
  <key>                       key to get

```

### `localstorage-set`

```
playwright-cli localstorage-set <key> <value>

Set a localStorage item

Arguments:
  <key>                       key to set
  <value>                     value to set

```

### `localstorage-delete`

```
playwright-cli localstorage-delete <key>

Delete a localStorage item

Arguments:
  <key>                       key to delete

```

### `localstorage-clear`

```
playwright-cli localstorage-clear

Clear all localStorage


```

### `sessionstorage-list`

```
playwright-cli sessionstorage-list

List all sessionStorage key-value pairs


```

### `sessionstorage-get`

```
playwright-cli sessionstorage-get <key>

Get a sessionStorage item by key

Arguments:
  <key>                       key to get

```

### `sessionstorage-set`

```
playwright-cli sessionstorage-set <key> <value>

Set a sessionStorage item

Arguments:
  <key>                       key to set
  <value>                     value to set

```

### `sessionstorage-delete`

```
playwright-cli sessionstorage-delete <key>

Delete a sessionStorage item

Arguments:
  <key>                       key to delete

```

### `sessionstorage-clear`

```
playwright-cli sessionstorage-clear

Clear all sessionStorage


```

### `requests`

```
playwright-cli requests

List all network requests since loading the page. Each request is numbered for use with the `request` command.

Options:
  --static                    whether to include successful static resources like images, fonts, scripts, etc. defaults to false.
  --filter                    only return requests whose url matches this regexp (e.g. "/api/.*user").
  --clear                     whether to clear the network list

```

### `request`

```
playwright-cli request <index>

Show full details (headers, body, response) of a single network request by its number from the `requests` command.

Arguments:
  <index>                     1-based number of the request as listed by `requests`
Options:
  --filename                  filename to save the result to. if not provided, output is returned as text.

```

### `request-headers`

```
playwright-cli request-headers <index>

Print only the request headers for a single network request by its number from the `requests` command.

Arguments:
  <index>                     1-based number of the request as listed by `requests`
Options:
  --filename                  filename to save the result to. if not provided, output is returned as text.

```

### `request-body`

```
playwright-cli request-body <index>

Print only the request body for a single network request by its number from the `requests` command.

Arguments:
  <index>                     1-based number of the request as listed by `requests`
Options:
  --filename                  filename to save the result to. if not provided, output is returned as text.

```

### `response-headers`

```
playwright-cli response-headers <index>

Print only the response headers for a single network request by its number from the `requests` command.

Arguments:
  <index>                     1-based number of the request as listed by `requests`
Options:
  --filename                  filename to save the result to. if not provided, output is returned as text.

```

### `response-body`

```
playwright-cli response-body <index>

Print the response body for a single network request by its number from the `requests` command. Textual bodies are inlined; binary bodies are saved to a file and the path is printed.

Arguments:
  <index>                     1-based number of the request as listed by `requests`
Options:
  --filename                  filename to save the result to. if not provided, output is returned as text.

```

### `route`

```
playwright-cli route <pattern>

Mock network requests matching a URL pattern

Arguments:
  <pattern>                   url pattern to match (e.g., "**/api/users")
Options:
  --status                    http status code (default: 200)
  --body                      response body (text or json string)
  --content-type              content-type header
  --header                    header to add in "name: value" format (repeatable)
  --remove-header             comma-separated header names to remove

```

### `route-list`

```
playwright-cli route-list

List all active network routes


```

### `unroute`

```
playwright-cli unroute [pattern]

Remove routes matching a pattern (or all routes)

Arguments:
  [pattern]                   url pattern to unroute (omit to remove all)

```

### `network-state-set`

```
playwright-cli network-state-set <state>

Set the browser network state to online or offline

Arguments:
  <state>                     set to "offline" to simulate offline mode, "online" to restore network connectivity

```

### `console`

```
playwright-cli console [min-level]

List console messages

Arguments:
  [min-level]                 level of the console messages to return. each level includes the messages of more severe levels. defaults to "info".
Options:
  --clear                     whether to clear the console list

```

### `run-code`

```
playwright-cli run-code [code]

Run Playwright code snippet

Arguments:
  [code]                      a javascript function containing playwright code to execute. it will be invoked with a single argument, page, which you can use for any page interaction.
Options:
  --filename                  load code from the specified file.

```

### `recording-start`

```
playwright-cli recording-start

Start recording user actions


```

### `recording-stop`

```
playwright-cli recording-stop

Stop recording user actions and print them as Playwright code


```

### `tracing-start`

```
playwright-cli tracing-start

Start trace recording


```

### `tracing-stop`

```
playwright-cli tracing-stop

Stop trace recording


```

### `video-start`

```
playwright-cli video-start [filename]

Start video recording

Arguments:
  [filename]                  filename to save the video.
Options:
  --size                      video frame size, e.g. "800x600". if not specified, the size of the recorded video will fit 800x800.

```

### `video-stop`

```
playwright-cli video-stop

Stop video recording


```

### `video-chapter`

```
playwright-cli video-chapter <title>

Add a chapter marker to the video recording

Arguments:
  <title>                     chapter title.
Options:
  --description               chapter description.
  --duration                  duration in milliseconds to show the chapter card.

```

### `video-show-actions`

```
playwright-cli video-show-actions

Annotate subsequent CLI/MCP actions on the page with a callout that names the action and highlights the target element

Options:
  --duration                  how long each action annotation stays on screen, in milliseconds. defaults to 500.
  --position                  where to place the action title: top-left, top, top-right, bottom-left, bottom, bottom-right. defaults to top-right. (one of: top-left, top, top-right, bottom-left, bottom, bottom-right)
  --cursor                    cursor decoration: "pointer" (default) animates a mouse pointer between action points; "none" disables it. (one of: none, pointer)

```

### `video-hide-actions`

```
playwright-cli video-hide-actions

Stop annotating actions performed on the page


```

### `show`

```
playwright-cli show

Show Playwright Dashboard

Options:
  --port                      start as a blocking http server on this port (use 0 for a random port)
  --host                      host to bind to when using --port (defaults to localhost)
  --annotate                  switch the dashboard into annotation mode.
  --kill                      kill the dashboard daemon.

```

### `pause-at`

```
playwright-cli pause-at <location>

Run the test up to a specific location and pause there

Arguments:
  <location>                  location to pause at. format is <file>:<line>, e.g. "example.spec.ts:42".

```

### `resume`

```
playwright-cli resume

Resume the test execution


```

### `step-over`

```
playwright-cli step-over

Step over the next call in the test


```

### `generate-locator`

```
playwright-cli generate-locator <target>

Generate a Playwright locator for the given element

Arguments:
  <target>                    exact target element reference from the page snapshot, or a unique element selector

```

### `highlight`

```
playwright-cli highlight [target]

Show (or with --hide, remove) a highlight overlay for an element; `--hide` without a target hides all page highlights.

Arguments:
  [target]                    exact target element reference from the page snapshot, or a unique element selector
Options:
  --hide                      hide a previously added highlight for this element, or all page highlights when no element is given
  --style                     additional inline css applied to the highlight overlay, e.g. "outline: 2px dashed red"

```

### `webmcp-list`

```
playwright-cli webmcp-list

List the WebMCP tools registered by the page


```

### `webmcp-call`

```
playwright-cli webmcp-call <name>

Call a WebMCP tool registered by the page

Arguments:
  <name>                      name of the webmcp tool to call
Options:
  --params                    tool input parameters as a json object, for example '{"query":"cats"}'
  --frame                     frame that registered the tool, as reported by webmcp-list, when the tool name is ambiguous

```

### `install`

```
playwright-cli install

Initialize workspace

Options:
  --skills                    install skills, possible values: claude (default), agents.
  --global                    install skills into the home directory instead of the workspace (alias: -g). requires --skills.

```

### `install-browser`

```
playwright-cli install-browser [browser]

Install browser

Arguments:
  [browser]                   browser to install
Options:
  --with-deps                 install system dependencies for browsers
  --dry-run                   do not execute installation, only print information
  --list                      prints list of browsers from all playwright installations
  --force                     force reinstall of already installed browsers
  --only-shell                only install headless shell when installing chromium
  --no-shell                  do not install chromium headless shell

```

### `list`

```
playwright-cli list

List browser sessions

Options:
  --all                       list all browser sessions across all workspaces

```

### `close-all`

```
playwright-cli close-all

Close all browser sessions


```

### `kill-all`

```
playwright-cli kill-all

Forcefully kill all browser sessions (for stale/zombie processes)


```
