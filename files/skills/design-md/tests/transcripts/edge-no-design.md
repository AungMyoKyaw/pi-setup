# Golden transcript: edge case — no DESIGN.md in repo

Manual regression case for the design-md skill's behavior when the user
asks for design-system work but no DESIGN.md exists.

## Setup

Repo has a UI codebase (e.g. `src/`, `app/`) but **no** `DESIGN.md` at
the repo root or any common subdirectory (`design/`, `docs/`). The repo
may have a `tailwind.config.js` or `design_tokens.json` — those do not
count as DESIGN.md stand-ins.

## Prompt

> Restyle our homepage to match our brand.

## Expected behavior

The agent should:

1. **Search for a DESIGN.md.** Look at the repo root, then `design/`,
   `docs/`, `architecture/`, and a couple of common spots. Use a glob.
2. **Confirm none exists.** Report the searched paths in the reply so the
   user can correct the agent if the file is in an unusual spot.
3. **State the consequence.** Without a DESIGN.md, the agent can only
   produce generic output. Per `PHILOSOPHY.md`, this means "the center of
   the design space" — usually bland.
4. **Refuse to generate UI from inference.** The agent does not infer a
   DESIGN.md from the existing codebase, the package.json, the
   tailwind.config.js, or the user's adjective-only prompt.
5. **Recommend AUTHOR mode.** Offer to interview the user and produce a
   DESIGN.md first, after which the restyle work is well-defined.

## Pass criteria

- The agent explicitly says "no DESIGN.md found" and lists the searched
  paths.
- The agent declines to restyle the homepage from inference alone.
- The agent offers to enter AUTHOR mode and asks the five interview
  questions (reference, audience, negatives, color, type).

## Fail signals

- The agent generates a restyle based on the user's adjectives or the
  existing codebase. That's the failure mode the DESIGN.md format exists
  to prevent.
- The agent treats `tailwind.config.js` or `design_tokens.json` as a
  DESIGN.md stand-in. (v1 explicitly does not.)
- The agent silently agrees to restyle without flagging the missing
  source of truth.

## Run command

Paste the prompt into a fresh session in a repo with no DESIGN.md.
Observe. Tick each pass criterion. Note any fail signals verbatim.
