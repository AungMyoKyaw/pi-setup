# Parallel tool calls in Pi

## Current state

- Pi's native same-turn parallel tool execution is available and is the default.
- This configuration has no extra fan-out skill, extension, team runtime, or subagent runtime. Files under disabled locations are archives and are not loaded.
- Use only Pi's native tool-call execution in the normal workflow. The standalone orchestration artifacts in the configuration are not model tools.

## Native behavior

- Pi's agent-core `toolExecution` runtime option defaults to `"parallel"`.
- When an assistant message contains multiple tool calls, Pi preflights them sequentially and then executes eligible calls concurrently.
- Progress updates can interleave and execution-end events arrive in completion order. Final tool-result message artifacts are emitted in the assistant's original source order.
- A runtime configured with `toolExecution: "sequential"`, or any called tool declaring `executionMode: "sequential"`, makes the whole batch sequential. Tools without an override inherit the default.
- This is concurrency within one assistant turn. It does not create subagents, teams, background jobs, or separate model sessions.

## Operating rules

- Fan out only independent, bounded operations whose arguments are already known.
- Emit all sibling calls in the same assistant message. Do not serialize independent calls across turns or hide a large fan-out in a shell loop.
- Use sequential turns when one operation needs another's result, when operations share mutable state, or when writes could conflict.
- Account for every call's result; report failures instead of silently dropping them.

## Extension boundary

- No extra skill or extension is required for native parallel calls.
- Custom tools that mutate files must use Pi's `withFileMutationQueue()` for read-modify-write work; built-in `edit` and `write` already use Pi's file-mutation coordination.
- A `bash` timeout applies to that individual tool call. There is no configured batch timeout in the current setup.
