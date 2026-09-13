# Golden transcript: AUTHOR mode

Manual regression case for the design-md skill. Run by pasting the prompt
into a fresh agent session that has the skill loaded, against the repo
described in **Setup**. Mark pass/fail against the criteria.

## Setup

Repo may or may not have an existing `DESIGN.md`. If one exists, it is
thin (a name and a couple of tokens, no Overview or Do's and Don'ts).
The repo has a UI codebase the user wants to document.

## Prompt (variant A: blank slate)

> We need a DESIGN.md for our fintech dashboard. Green and white, modern.

## Prompt (variant B: thin DESIGN.md)

> Document our visual identity properly. Right now we only have a name and
> some hex values in DESIGN.md.

## Expected behavior

Mode: **AUTHOR**.

The agent should:

1. **Push back on adjective-only references.** If the user said "green and
   white, modern," the agent asks: "What real thing does this look like? Not
   adjectives — a specific reference. A genre, an era, an object, a
   magazine, a building, a song, a film, an interface you admire."
   The agent does not accept "modern" as a sufficient answer.
2. **Interview five questions, in order:**
   - Reference (the specific thing).
   - Audience and substrate (who reads this, where does it live).
   - Negative space (what must this never be).
   - Color story (one-ink-and-accent, full tonal, etc.).
   - Type voice (one face or several, serif / sans / mono).
3. **Refuse to draft tokens before the interview is complete.** If the user
   tries to skip ahead to "just give me the colors," the agent returns to
   the reference question.
4. **Draft tokens after the interview.** Tokens are minimal — only what the
   prose will reference. Components use `{colors.x}` references, not hex.
5. **Write prose in the spec's canonical order:** Overview → Colors →
   Typography → Layout → Elevation & Depth → Shapes → Components → Do's
   and Don'ts.
6. **Fill the Do's and Don'ts.** At least ten items, each a real constraint.
7. **Run `npx @google/design.md lint`** on the produced file. Triage any
   findings.
8. **Cite the interview answers** in the final reply so the user can verify
   the interpretation.

## Pass criteria

- The agent pushes back on adjective-only references in **both** prompt
  variants. "Modern" is not accepted.
- The agent's first draft of prose contains a specific, named referent
  (not "modern" — a magazine, an era, an object).
- The Do's and Don'ts section has at least ten items, each phrased as a
  real constraint, not "don't be ugly" or "don't use Comic Sans."
- Token references in components resolve — no `{colors.foo}` for a token
  that doesn't exist.
- `npx @google/design.md lint` returns zero errors on the produced file.
- The agent does not present the produced DESIGN.md as final until the
  prose has been read aloud (or self-reviewed) for vagueness.

## Fail signals

- The agent drafts a DESIGN.md with "modern, clean, premium" as the
  Overview. No specific reference.
- The Do's and Don'ts has fewer than five items, or items that are
  tautologies ("don't be ugly").
- The agent skips the interview and goes straight to token generation.
- The agent produces tokens but no prose body, or vice versa.

## Run command

Run both prompt variants in fresh sessions. Observe. Tick each pass
criterion. Note any fail signals verbatim.
