# auto-todo

A pi extension that scaffolds a per-request `TODO.md` / `PLAN.md` pair, instructs the agent to follow the [software-delivery-loop](../README.md) flow (plan → todo → do), and snapshots an `outcome.md` at session settle.

## What it does

For every user prompt that isn't a slash command or bash escape:

1. Creates `~/.agents/runs/<YYYY-MM-DD>/<run-id>/`
2. Seeds `TODO.md` (live checklist) and `PLAN.md` (design doc / projection)
3. Injects a contract block into the system prompt: read PLAN, mirror into TODO, tick items as you work, delete optional PLAN sections when not used
4. Writes `outcome.md` when the agent settles, with the final TODO state and last assistant message
5. `/todo` and `/plan` slash commands show the active run's files

Idempotent: re-submitting the same prompt within the same millisecond reuses the same folder (counter-based disambiguation breaks ties). Files are never overwritten by the extension — only the agent edits them.

## Trivial requests

If the prompt is a question or one-liner, the agent is instructed (via the contract block) to collapse `PLAN.md` to `Interpretation` + a single `Approach` line, and **delete** the optional section headers (`Non-goals`, `Assumptions`, `Risks / unknowns`) entirely. No empty placeholders.

## File layout

```
~/.agents/runs/
└── 2026-05-07/
    └── a1b2c3d4/
        ├── TODO.md       # live checklist (agent edits)
        ├── PLAN.md       # design doc (agent edits)
        └── outcome.md    # snapshot at agent_settled (extension writes)
```

`<run-id>` = first 8 chars of `sha256(timestamp || counter || text)`. Counter breaks same-millisecond ties; resets on reload.

## Configuration

| Env var                  | Default          | Effect                                       |
| ------------------------ | ---------------- | -------------------------------------------- |
| `PI_AUTO_TODO=0`         | (enabled)        | Disable the extension entirely               |
| `PI_AUTO_TODO_DIR`       | `~/.agents/runs` | Override the base directory                  |
| `PI_AUTO_TODO_OUTCOME=0` | (enabled)        | Skip writing `outcome.md` at `agent_settled` |

## Slash commands

| Command | Effect                                                               |
| ------- | -------------------------------------------------------------------- |
| `/todo` | Print the active run's `TODO.md` to a notification (first 800 chars) |
| `/plan` | Print the active run's `PLAN.md` to a notification (first 800 chars) |

The full path is included in the notification so TUI users can `cat` or open in `$EDITOR`.

## Hooks

| Event                | Job                                                                                                        |
| -------------------- | ---------------------------------------------------------------------------------------------------------- |
| `input`              | Filter via `shouldTrigger()`. If pass: `mkdir -p` the run folder, seed `TODO.md` and `PLAN.md` if missing. |
| `before_agent_start` | Append `buildContractBlock(activeRunDir)` to the system prompt. No-op when no active run.                  |
| `agent_settled`      | Snapshot `TODO.md` + last assistant message into `outcome.md`.                                             |

## Skip conditions (input filter)

- `event.source === "extension"` (avoid recursion)
- Empty / whitespace-only text
- Text starting with `/`, `!`, or `?`

## Install

Already in `~/.pi/agent/extensions/auto-todo/`. Reload pi with `/reload` after install.

```sh
cd ~/.pi/agent/extensions/auto-todo
bun install   # no production deps; pulls types only
bun run test  # 30+ tests, all green
bun run check # tsc clean
```

## Compatibility

- Pi 0.85.x
- No runtime dependencies (`node:fs/promises`, `node:path`, `node:os`, `node:crypto` only)
- Orthogonal to every other extension (no shared state, no shared files outside the run folder)

## Files

```
auto-todo/
├── index.ts             # extension factory: 4 hooks + 2 slash commands
├── run-id.ts            # slug, run id, path composition
├── trigger.ts            # shouldTrigger() filter
├── templates.ts         # TODO.md, PLAN.md, outcome.md renderers
├── prompts.ts           # buildContractBlock() for system-prompt injection
├── run-id.test.ts       # 14 tests: hash, slug, sanitization, override, header
├── trigger.test.ts      # 10 tests: slash/bash/?prefix, whitespace, source
├── templates.test.ts    # 10 tests: required sections, backtick escaping, newline safety
├── package.json
├── tsconfig.json
└── README.md
```

## Known limitations

- The contract block adds ~150 tokens to every system prompt on turns that have an active run. Acceptable for typical use; if you're tight on budget, set `PI_AUTO_TODO=0` for purely-question sessions.
- Multiple rapid user messages in the same millisecond share a run id but each gets its own `activeRunDir` overwrite — the latest prompt's contract wins. In practice this is rarely observable; users type slower than ms resolution.
- `outcome.md` is owned by the extension. If the agent writes to it, the next `agent_settled` will silently overwrite. Tell the agent (via `TODO.md` "Done" section) to record outcome notes instead.
