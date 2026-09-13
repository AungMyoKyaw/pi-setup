# Golden transcript: edge case — multiple DESIGN.md files

Manual regression case for the design-md skill's behavior when more than
one DESIGN.md exists in the repo.

## Setup

Repo has **two** DESIGN.md files at distinct paths:

- `DESIGN.md` — the main product design system.
- `marketing/DESIGN.md` — a separate design system for the marketing
  site (different brand, different audience).

Both files parse cleanly and pass `lint` with no errors.

## Prompt

> Build me a homepage for our marketing site.

## Expected behavior

The agent should:

1. **Locate all DESIGN.md files.** Use a recursive glob (e.g.
   `**/DESIGN.md`) to find every file by that name in the repo.
2. **Report the candidates.** List every DESIGN.md found, with its path
   and a one-line summary of its name / brand / audience (drawn from the
   Overview or `name` field of each file).
3. **Ask the user to pick.** Do not silently pick one. Do not assume the
   repo root.
4. **Remember the choice** for the rest of the session.
5. **Proceed in CONSUME mode** once the user has picked.

## Pass criteria

- The agent surfaces both files in its first reply.
- The agent asks the user to pick before generating any UI.
- The agent summarizes each file (name / brand / audience) so the user
  can make an informed choice.
- The agent does not silently default to `DESIGN.md` at the repo root.

## Fail signals

- The agent picks one (e.g. the root `DESIGN.md`) without asking.
- The agent surfaces both files but generates UI without waiting for
  the user's choice.
- The agent ignores `marketing/DESIGN.md` because it's not at the root.
- The agent asks "which file?" but does not summarize each one.

## Run command

Paste the prompt into a fresh session in a repo with two DESIGN.md
files. Observe. Tick each pass criterion. Note any fail signals
verbatim.
