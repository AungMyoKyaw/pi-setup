# Parallel tool calls in Pi

## Current state

- Pi's native same-turn parallel tool execution is available and is the default.
- The `subagent` extension is available for isolated agent sessions. Files under disabled locations are archives and are not loaded.
- Prefer parallel execution for independent work: use native parallel tool calls for small bounded operations, and delegate substantial independent work to subagents when that can reduce elapsed time or improve focused analysis. Avoid fan-out when setup and coordination cost more than the work.

## Native behavior

- Pi's agent-core `toolExecution` runtime option defaults to `"parallel"`.
- When an assistant message contains multiple tool calls, Pi preflights them sequentially and then executes eligible calls concurrently.
- Progress updates can interleave and execution-end events arrive in completion order. Final tool-result message artifacts are emitted in the assistant's original source order.
- A runtime configured with `toolExecution: "sequential"`, or any called tool declaring `executionMode: "sequential"`, makes the whole batch sequential. Tools without an override inherit the default.
- This is concurrency within one assistant turn. It does not create subagents, teams, background jobs, or separate model sessions.

## Operating rules

- Fan out independent, bounded operations whose arguments are already known. Emit sibling native tool calls in the same assistant message. Do not serialize independent calls across turns or hide a large fan-out in a shell loop.
- Use subagents for substantial tasks that can run independently, especially separate investigations, reviews, or implementation areas. Give each agent a clear scope and integrate/check every result.
- Use sequential turns when one operation needs another's result, when operations share mutable state, or when writes could conflict. Account for every call's result; report failures instead of silently dropping them.

## Extension boundary

- No extra skill or extension is required for native parallel calls.
- Custom tools that mutate files must use Pi's `withFileMutationQueue()` for read-modify-write work; built-in `edit` and `write` already use Pi's file-mutation coordination.
- A `bash` timeout applies to that individual tool call. There is no configured batch timeout in the current setup.
