# Golden transcript: AUDIT mode

Manual regression case for the design-md skill. Run by pasting the prompt
into a fresh agent session that has the skill loaded, against the repo
described in **Setup**. Mark pass/fail against the criteria.

## Setup

Repo has a `DESIGN.md` with intentional issues:

- A broken token reference: `components.button-primary.backgroundColor:
"{colors.missing-accent}"` where `missing-accent` is not defined.
- No `primary` color (a `tertiary` is defined, but no `primary`).
- A contrast failure: a component pairing where `backgroundColor` and
  `textColor` produce a contrast ratio below 4.5:1 (WCAG AA).
- A typo'd top-level key: `colours:` instead of `colors:`.
- An orphaned token: a defined color that no component references.

The file should still parse as YAML — the issues are semantic, not
syntactic.

## Prompt

> Lint our DESIGN.md and tell me what to fix.

## Expected behavior

Mode: **AUDIT**.

The agent should:

1. **Run `npx @google/design.md lint`** against the file, capturing JSON.
2. **Parse findings**, grouped by severity (error / warning / info).
3. **Triage each finding** using the SKILL.md's lint rules table:
   - `broken-ref` → must fix (error). Suggest: define the missing token
     or fix the reference path.
   - `missing-primary` → should fix or justify (warning). Suggest: promote
     one of the existing colors to `primary`, or add a one-line note to
     the Overview explaining the deliberate absence.
   - `contrast-ratio` → should fix (warning). Suggest: adjust the colors,
     swap the component pairing, or document the contrast exception in
     the prose.
   - `unknown-key` → likely a typo (warning). Suggest: rename `colours:`
     to `colors:`.
   - `orphaned-tokens` → either wire it into a component or remove it
     (warning).
4. **Report findings in a structured table** (path, rule, severity, fix
   suggestion), not as a wall of prose.
5. **Distinguish blocking errors from reviewable warnings.** Make clear
   that errors gate a commit; warnings are reviewable.
6. **Do not auto-fix.** The agent proposes; the user decides. v1 does
   not edit the file.

## Pass criteria

- The agent runs `npx @google/design.md lint` (or equivalent), not a
  hand-rolled YAML lint.
- The agent surfaces all five seeded issues, mapped to their canonical
  rule names (`broken-ref`, `missing-primary`, `contrast-ratio`,
  `unknown-key`, `orphaned-tokens`).
- Each finding is reported with: file path, rule, severity, suggestion.
- The agent does not edit the DESIGN.md (no auto-fix in v1).
- The agent's reply is structured (table or list), not narrative prose.

## Fail signals

- The agent invents its own lint rules rather than invoking the npm CLI.
- The agent reports findings in unstructured prose, making it hard to
  triage.
- The agent edits the DESIGN.md without being asked.
- The agent misses one or more of the seeded issues.
- The agent uses generic terms ("there are some issues with your file")
  instead of canonical rule names.

## Run command

Paste the prompt into a fresh session. Observe. Tick each pass criterion.
Note any fail signals verbatim.
