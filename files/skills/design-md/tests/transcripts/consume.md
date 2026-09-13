# Golden transcript: CONSUME mode

Manual regression case for the design-md skill. Run by pasting the prompt
into a fresh agent session that has the skill loaded, against the repo
described in **Setup**. Mark pass/fail against the criteria.

## Setup

Repo contains a `DESIGN.md` at the root. The DESIGN.md is well-formed (passes
`npx @google/design.md lint` with no errors). It has all canonical sections
(Overview, Colors, Typography, Layout, Components, Do's and Don'ts) with a
concrete reference in Overview (e.g. "a graduate lecture handout", "a 1970s
broadsheet", "Material 3 light theme").

The repo also has a UI codebase (e.g. `src/`, `app/`, `pages/`) where the
agent can write code. There are no `design_tokens.json` or
`tailwind.config.js` — only `DESIGN.md`.

## Prompt

> Build me a settings page. Default theme, two-column layout, save button at
> the bottom right.

## Expected behavior

Mode: **CONSUME**.

The agent should:

1. **Locate.** Find `DESIGN.md` at the repo root. Not the tokens, not the
   Tailwind config — the DESIGN.md.
2. **Read prose first.** Walk the Overview, then Colors, Typography, Layout,
   Components, Do's and Don'ts. The Do's and Don'ts are read as constraints.
3. **Plan in prose terms.** Before any code, sketch the settings page in
   prose: "A two-column layout on a [surface color] with [headline] in
   [font]; the form fields are [component reference], save is
   [component reference] in the bottom right." If the DESIGN.md forbids
   shadows, the plan says no shadows.
4. **Implement.** Translate the prose plan to code. Use the named tokens
   (e.g. `colors.paper`, `typography.body`). Do not invent values not in
   the DESIGN.md.
5. **Cite.** In the reply, name the DESIGN.md sections the agent relied
   on (e.g. "per the Do's and Don'ts, no elevated surfaces except modals").
6. **Self-audit (optional).** Run `npx @google/design.md lint DESIGN.md`
   if the DESIGN.md was modified, or hand-audit generated code against the
   lint rules in head (no off-token hexes, no orphan values).

## Pass criteria

- The agent does **not** open `DESIGN.md` and immediately start writing
  Tailwind config or CSS variables from the tokens. Prose first.
- The agent does **not** invent a color, font, or radius not in the
  DESIGN.md. If the DESIGN.md is silent on a value, the agent flags the
  gap rather than guessing.
- The generated UI respects the prose's negative constraints. If the
  Do's and Don'ts say "no gradients," the code has no gradients.
- The agent cites the DESIGN.md sections in its reply.
- The agent's tone matches the prose's reference. A lecture-handout
  DESIGN.md produces a lecture-handout settings page, not a Substack
  settings page.

## Fail signals

- The agent reads only the YAML tokens and ignores the prose.
- The agent produces a generic settings page with rounded buttons,
  shadows, and a hero heading, contradicting a flat, austere DESIGN.md.
- The agent cites Tailwind classes but no DESIGN.md section.
- The agent invents a color ("I'll use #2563EB for the accent") not in
  the DESIGN.md.

## Run command

Paste the prompt into a fresh session. Observe the agent's reply. Tick
each pass criterion above. Note any fail signals verbatim.
