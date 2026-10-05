---
name: design-md
description: >-
  Use for DESIGN.md, a visual-identity spec combining YAML tokens with prose
  rationale. Auto-fires when the user mentions DESIGN.md or
  @google/design.md; asks to author, review, lint, compare, convert, theme,
  rebrand, or match a design system; or requests UI work in a repo containing
  DESIGN.md. Read the prose before building. Do not use for one-off visual
  tweaks, Figma/Storybook work without DESIGN.md, or non-visual specs.
---

# design-md

`DESIGN.md` is a project's visual identity in one file: YAML tokens
(machine-readable values) plus prose rationale (what the design is, why it
is that, what it must never be). It exists so a request to "build a
settings page" produces a settings page that looks like the rest of the
app — not a settings page that looks like a generic LLM average.

The format is `alpha`. Canonical spec, linter, and CLI live at
<https://github.com/google-labs-code/design.md> and on npm as
`@google/design.md`. When this skill and the canonical CLI disagree,
**trust the CLI** — `npx @google/design.md spec` returns the authoritative
schema.

## The thesis

Read the prose first; glance at the tokens second. The repo's
[`PHILOSOPHY.md`](https://github.com/google-labs-code/design.md/blob/main/PHILOSOPHY.md)
states it directly:

> The quality of a generated design is determined less by the precision of
> its values than by how clearly the intent is described.

Two corollaries matter for the agent:

- **A specific reference beats a list of adjectives.** "A 1970s graduate
  lecture handout" carries a complete world. "Modern, clean, trustworthy,
  premium" carries nothing. Push for a referent; if the user insists on
  adjectives only, the design will be generic and the skill should say so.
- **Negative constraints arrive free with a specific reference.** A real
  handout doesn't glow. You do not have to list that. Naming the object
  names its constraints. Do's and Don'ts make this explicit; treat them
  as constraints, not suggestions.

When prose and tokens disagree, **the prose wins** — and the design system
should be reconciled.

## When this skill fires

| User intent                                                                      | Mode                        |
| -------------------------------------------------------------------------------- | --------------------------- |
| "Build me X" / "Add a Y page" with `DESIGN.md` present in repo                   | **CONSUME**                 |
| "Set up our design system" / "Author a DESIGN.md" / "Document our identity"      | **AUTHOR**                  |
| "Lint DESIGN.md" / "Check contrast" / "Compare v1 to v2" / "Convert to Tailwind" | **AUDIT**                   |
| "Restyle to match the new brand" / "Rebrand to X" with `DESIGN.md` present       | **CONSUME** then **AUDIT**  |
| "Why does this look generic?" / drift from the design system                     | **AUDIT** (drift detection) |

If no `DESIGN.md` exists and the user asks for one, AUTHOR mode. If no
`DESIGN.md` exists and the user asks for UI work, this skill does not
fire — say so and recommend authoring one.

---

## Mode 1 — CONSUME: build UI that obeys an existing DESIGN.md

The CONSUME loop:

1. **Locate the source of truth.** Search root, then `design/`, `docs/`,
   and any path the user names. If you find `design_tokens.json` or
   `tailwind.config.js` that obviously encodes a DESIGN.md but no
   DESIGN.md file, stop — recommend authoring first.
2. **Read the prose top to bottom.** Overview → Colors → Typography →
   Layout → Elevation & Depth → Shapes → Components → Do's and Don'ts.
   The Overview is the reference. The Do's and Don'ts are constraints.
3. **Skim the tokens for values the prose points you at.** If the prose
   is silent on a value, check the nearest `components.<name>` block. If
   still silent, **do not invent** — flag the gap.
4. **Plan in prose terms first**, then translate to code. "A settings card
   on a warm limestone surface, primary headline in Public Sans, Boston
   Clay secondary action." Implement after the prose plan is solid.
5. **Apply prose constraints throughout.** A reference that forbids
   gradients forbids them in code, even when "it would look nicer."
6. **Self-audit before handing off.** Run
   `npx @google/design.md lint DESIGN.md` if you modified the file, or
   check generated code against the lint rules in your head.
7. **Cite the DESIGN.md sections you relied on** so the user can verify
   the interpretation.

CONSUME failure modes:

- **Token dump.** Copying every `colors.*` into a CSS file without reading
  the prose. Technically correct, stylistically generic.
- **Adjective collapse.** Reducing "Architectural Minimalism meets
  Journalistic Gravitas" to "minimalist and trustworthy." Loses every
  useful constraint.
- **Rogue value.** Inventing a hex or font size not in the tokens and
  not justified by the prose. Either flag the gap or use the closest
  defined token.
- **Ornament smuggling.** Adding a glow, gradient, drop shadow, glass
  surface, or rounded corner that the Do's and Don'ts forbid.

## CONSUME checklist (paste into your thinking)

- [ ] Reference named in Overview (a real object, not adjectives).
- [ ] Audience and substrate stated.
- [ ] Colors used by role, not by literal value.
- [ ] Type roles (headline, body, label) used, not raw sizes.
- [ ] Layout described in prose terms, not metric soup.
- [ ] Elevation posture honored (flat / single-shadow / layered).
- [ ] Shape posture honored (rounded / square / graded).
- [ ] Do's and Don'ts read; no ornament smuggling.
- [ ] Tokens referenced via `{path}` in components, not hardcoded.
- [ ] Gaps flagged, not silently invented.

---

## Mode 2 — AUTHOR: draft a new DESIGN.md

The AUTHOR loop. Use when the user says "set up our design system", "we
need a DESIGN.md", or "document our visual identity".

### Phase 1 — Interview (do not skip)

Five questions, in order. Use the user's stated direction as the seed.

1. **Reference.** "What real thing does this look like? A genre, an era,
   an object, a magazine, a building, a song, a film." If the user
   answers with adjectives, push back: "What specific object in that
   style?"
2. **Audience and substrate.** "Who is this for, and where does it
   live?" (Graduate handout on paper, fintech dashboard on a phone, kids'
   learning app on a tablet.) The substrate shapes everything.
3. **Negative space.** "What must it never be?" Push past "nothing too
   crazy". Magazines don't glow; lecture handouts don't have rounded
   corners; dashboards don't use display serifs.
4. **Color story.** "What is the color doing? One ink and one accent, or
   a tonal system?" Pull from an existing palette if there is one.
5. **Type voice.** "One typeface or several? Serif, sans, mono?
   Display roles?"

Stop interviewing once the answers can produce a specific reference. If
the user cannot answer #1 yet, the prose will fail no matter how many
tokens are written.

### Phase 2 — Tokens (frontmatter)

Keep tokens minimal. Define only the values the prose will reference.
Canonical schema lives at `npx @google/design.md spec`; do not re-derive
it from memory.

Discipline rules:

- **One primary, one accent at most.** A system with seven "primary"
  colors has no primary. The lint rule `missing-primary` exists for this.
- **Every token earns its name.** If a color is "Boston Clay", the prose
  calls it Boston Clay. Don't name a token `blue-3` if the prose
  describes a single accent.
- **Components reference tokens, not literals.** `{colors.tertiary}` over
  `"#B8422E"` everywhere. The lint rule `broken-ref` catches this.
- **Omit sections you do not need with the `omitted:` field, not by
  deleting them.** Explicit omission is honest; silence is ambiguous.

### Phase 3 — Prose (this is the work)

Section order is canonical and enforced by the linter's `section-order`
rule:

`Overview` → `Colors` → `Typography` → `Layout` → `Elevation & Depth` →
`Shapes` → `Components` → `Do's and Don'ts`

(`Overview` may also be called `Brand & Style`; `Layout` may be called
`Layout & Spacing`; `Elevation & Depth` may be called `Elevation`.)

Per-section guidance:

- **Overview.** Two to four sentences. Reference, audience, substrate,
  dominant posture. No adjectives without a referent.
- **Colors.** Each named color has a job and (when relevant) a non-job.
  "Boston Clay is the sole driver for interaction; it appears on no
  other surface."
- **Typography.** Roles before fonts. State what roles do not exist
  (no italics, no display serif, no monospace body).
- **Layout.** Describe the grid in prose. "An 8-point grid with a 96px
  page margin on desktop, 16px on mobile" beats "margin: 96px".
- **Elevation & Depth.** When does depth appear? "The modal is the only
  elevated surface." If everything is flat, state that.
- **Shapes.** The rounding story. "Buttons are 4px, cards are 8px,
  modals are 12px." If everything is square, state that — do not say
  "minimal" instead.
- **Components.** For each named component, describe its job and visual
  posture. Cross-reference the tokens above.
- **Do's and Don'ts.** The negative space. Ten to twenty items, each
  one a real constraint. If you cannot fill this with ten items, the
  reference is too vague.

### Phase 4 — Lint and review

```bash
npx @google/design.md lint DESIGN.md
```

Triage by severity:

- **`error`** (e.g. `broken-ref`, duplicate section): must fix before
  merging.
- **`warning`** (e.g. `contrast-ratio`, `orphaned-tokens`,
  `missing-typography`, `missing-primary`, `unknown-key`,
  `token-like-ignored`): should fix or justify.
- **`info`** (e.g. `token-summary`, `missing-sections`, `omitted-rules`):
  review and consciously accept.

Then read the prose aloud. If you cannot tell what the design looks like
from the prose alone, the prose is not done.

AUTHOR failure modes:

- **Tokens before prose.** Writing all the colors first, then describing
  them. Reverse: prose first, tokens as evidence.
- **Reference dodge.** Accepting "modern, clean, premium" as an answer.
  Push for a referent. If the user insists, the design will be generic —
  say so and ask permission to proceed generic.
- **Empty Do's and Don'ts.** "Don't be ugly." Real constraints only.

## AUTHOR checklist (paste into your thinking)

- [ ] One specific reference, named.
- [ ] Audience and substrate stated.
- [ ] Colors have roles and non-roles.
- [ ] Typography has roles, not just fonts.
- [ ] Layout described in prose, not just numbers.
- [ ] Elevation posture stated.
- [ ] Shapes posture stated.
- [ ] Do's and Don'ts has ten items minimum, each a real constraint.
- [ ] No orphan adjectives ("modern", "clean", "premium", "beautiful").
- [ ] Components use `{path}` references, not literal values.

---

## Mode 3 — AUDIT: lint, diff, drift, export

### Lint

```bash
npx @google/design.md lint DESIGN.md
npx @google/design.md lint --format json DESIGN.md
cat DESIGN.md | npx @google/design.md lint -            # stdin
```

Findings are JSON: `{ path, severity, message }`. Triage by severity as
in Phase 4 above. On Windows / PowerShell the `design.md` bin name
collides with the Markdown file association; use
`npx -p @google/design.md designmd lint DESIGN.md`.

### Diff

```bash
npx @google/design.md diff DESIGN.md DESIGN-v2.md
```

Reports token-level changes per section (`added`, `removed`, `modified`)
plus a finding delta and a `regression` boolean. Exit code `1` means the
"after" file introduced new errors or warnings. Use case: PR review of a
design-system change — run the diff, summarize the changes in plain
language, flag the regression.

### Export

```bash
npx @google/design.md export --format json-tailwind DESIGN.md > tailwind.theme.json
npx @google/design.md export --format css-tailwind  DESIGN.md > theme.css
npx @google/design.md export --format dtcg          DESIGN.md > tokens.json
```

- `json-tailwind` / `tailwind` — Tailwind v3 `theme.extend` JSON object.
- `css-tailwind` — Tailwind v4 `@theme { ... }` CSS block (CSS custom
  properties using `--color-*`, `--font-*`, `--radius-*`, `--spacing-*`).
- `dtcg` — W3C Design Tokens Community Group format, interoperable with
  Style Dictionary, Figma variables, etc.

`export` exits `0` on success regardless of lint findings. Gate on `lint`
first if you need a clean signal.

### Spec injection

```bash
npx @google/design.md spec
npx @google/design.md spec --rules
npx @google/design.md spec --rules-only --format json
```

Pull the canonical schema into your prompt once per session instead of
re-deriving rules from training data.

### Drift detection (UI code vs DESIGN.md)

The CLI does not ship a built-in drift detector. Manual approach:

1. Export tokens to Tailwind or DTCG.
2. Grep the UI codebase for hex values, font names, and px dimensions
   that are **not** in the exported token set.
3. For each hit, choose: should this be a new token in DESIGN.md, or
   should the UI use the existing token? Either is legitimate — flag
   the choice.

If drift is heavy, recommend an AUTHOR session to reconcile.

### Programmatic API

```typescript
import { lint } from "@google/design.md/linter";

const report = lint(markdownString);

console.log(report.findings); // Finding[]
console.log(report.summary); // { errors, warnings, info }
console.log(report.designSystem); // Parsed DesignSystemState
```

Use in a build pipeline, pre-commit hook, or agent-side audit loop.

---

## Edge cases

**No `DESIGN.md` in repo.** Confirm the search (root, then `design/`,
`docs/`, common subdirs). State that without a DESIGN.md the agent can
only produce center-of-the-design-space output. Decline to generate UI
from inference. Offer AUTHOR mode. Do **not** treat `tailwind.config.js`
or `design_tokens.json` as DESIGN.md stand-ins — silently accepting them
violates the explicit-reference principle.

**Malformed `DESIGN.md`** (broken YAML frontmatter, missing closing
`---`, mismatched indentation). Surface a specific error: which rule
failed (or which line), which file region, a one-line fix suggestion.
Delegate canonical linting to `npx @google/design.md lint DESIGN.md`. In
AUDIT mode, triage the fix; in CONSUME mode, **refuse to consume** —
do not hand-parse around broken YAML.

**Multiple `DESIGN.md` files** at distinct paths. Use a recursive glob
to enumerate every candidate. Report each with its path and a one-line
summary drawn from its `name` field and Overview. **Ask the user to
pick** before generating any UI. Do not silently default to the repo
root.

---

## Quick recipes

### Bootstrap a DESIGN.md

```bash
cat > DESIGN.md <<'EOF'
---
name: <project>
description: <one-sentence reference>
---

## Overview

<2-4 sentences: reference, audience, substrate, posture.>
EOF

npx @google/design.md lint DESIGN.md
```

Then enter AUTHOR mode and interview the user.

### Validate before committing

```bash
npx @google/design.md lint DESIGN.md
```

Exit code `1` if any errors. Errors block; warnings are reviewable.

### Compare a design-system PR

```bash
git show main:DESIGN.md > /tmp/DESIGN.before.md
npx @google/design.md diff /tmp/DESIGN.before.md DESIGN.md
```

Summarize for the reviewer in plain language: which tokens changed,
which sections changed, any new errors or warnings.

### Convert to Tailwind v4

```bash
npx @google/design.md export --format css-tailwind DESIGN.md > app/styles/theme.css
```

Drop into your CSS entry point. Tailwind v4 picks up the `@theme` block
automatically.

---

## Canonical examples (read prose first, tokens second)

These live in the upstream repo under `examples/`. Each one is a complete
DESIGN.md — read the Overview and Do's and Don'ts before the YAML.

- `examples/atmospheric-glass` — Glassmorphism weather UI. Monochromatic
  white palette over a vibrant gradient, blur-driven depth, `xl` radii.
- `examples/paws-and-paths` — Modern corporate with a friendly twist.
  Golden Retriever orange drives action; Sky Walk blue is the calmer
  counterpoint; generous whitespace.
- `examples/totality-festival` — Cosmic premium / eclipse-themed.
  Obsidian base with amber primary, glassmorphism, Ambient Glow on
  interaction.

When in doubt about the format, run `npx @google/design.md spec` and
trust the canonical output over this skill's notes — the spec is the
source of truth; this skill is operating instructions.

## Cross-references

- Spec source: <https://github.com/google-labs-code/design.md>
- Specification: `docs/spec.md` in that repo, or `npx @google/design.md spec`
- Philosophy: `PHILOSOPHY.md` in that repo — read this once.
- Examples: `examples/atmospheric-glass`, `examples/paws-and-paths`,
  `examples/totality-festival` in that repo. Read the prose in each
  before the tokens.
- npm package: <https://www.npmjs.com/package/@google/design.md>
