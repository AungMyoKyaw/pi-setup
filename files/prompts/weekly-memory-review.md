---
description: Review recent work and improve durable Pi memory
argument-hint: "[days]"
---

Run a focused memory-maintenance review for the last ${1:-7} days.

Goal: improve `~/.agents/MEMORY.md` (universal workflow), `~/.agents/memory/*.md`
(topic files), and `~/.pi/agent/SOUL.md` (identity/voice/bright lines) with
durable, evidence-based preferences and lessons. Do not turn any of these into
a diary — dated session notes belong in `~/.agents/memory/journal/`. Never
store sensitive data.

1. Read the entry point and current state:
   - `~/.pi/agent/AGENTS.md` — loading rules
   - `~/.pi/agent/SOUL.md` — identity, voice, values, bright lines
   - `~/.agents/MEMORY.md` — universal workflow + topic index
   - Each topic file referenced in MEMORY.md's index
   - Recent entries in `~/.agents/memory/journal/` if any

   Follow project instructions and higher-priority instructions before making
   changes. Loading order is SOUL → AGENTS → MEMORY → project.

2. Get the current UTC time with:

   ```sh
   date -u '+%Y-%m-%dT%H:%M:%SZ'
   ```

3. Review the relevant recent Pi sessions under `~/.pi/agent/sessions/`.
   Sessions are JSONL trees: follow the active branch when possible, and use
   user messages, corrections, repeated preferences, accepted decisions, and
   recurring workflow lessons as evidence. Do not treat an old abandoned
   branch as a current preference.

4. Classify each possible memory entry:
   - **Durable universal** → belongs in MEMORY.md (cross-cutting workflow,
     applies to nearly every task). Keep this file slim (~50 lines cap).
   - **Durable topic** → belongs in `memory/coding-style.md`, `memory/people.md`,
     `memory/tools.md`, or a new topic file if a recurring theme doesn't fit.
   - **SOUL-worthy** → belongs in SOUL.md (identity, voice rule, bright line,
     default that should be added or tightened).
   - **Project-specific** → belongs in `<project>/NOTES.md` or
     `<project>/AGENTS.md`. Never store project notes in global memory.
   - **Diary-worthy** → belongs in `memory/journal/YYYY-MM-DD.md` (one file
     per day if multiple days).
   - **Temporary** → specific to one task/incident; do not capture.
   - **Uncertain** → ambiguous or contradicted by other evidence; do not guess.
   - **Sensitive** → credentials, tokens, private session content; never store.

5. For each durable candidate:
   - Compare with existing entries. Merge duplicates. Resolve clear stale
     wording. Keep bullets concise.
   - **Move, don't duplicate.** If a rule fits a topic file, add it there —
     not MEMORY.md. If it fits SOUL.md, edit there — not MEMORY.md.
   - **Only remove or rewrite** an existing preference when the user
     explicitly changed it or recent evidence clearly makes it obsolete. Never
     invent a preference from silence or from a single accidental wording
     choice.
   - **SOUL Evolution triggers**: a default consistently overridden (the
     default is wrong); a bright line too tight or too loose; a voice rule
     that doesn't match how we actually talk. Propose as a diff for review —
     do not silently rewrite identity.
   - **Topic file bloat**: if a topic file exceeds ~100 lines, propose
     splitting it.

6. Update files directly when there are justified changes:
   - `~/.agents/MEMORY.md` — preserve existing structure. Do not let it
     creep past ~50 lines; extract topic files instead of bloating.
   - `~/.agents/memory/*.md` — append under existing headings if structure
     exists; otherwise propose a heading first.
   - `~/.pi/agent/SOUL.md` — propose diffs; never silently rewrite identity.
   - `~/.agents/memory/journal/YYYY-MM-DD.md` — dated entries, brief.
     Do not modify project files, session files, credentials, or unrelated
     configuration.

7. Report concisely:
   - sessions and date window reviewed;
   - files changed and what was added/modified/removed in each;
   - candidates deliberately rejected (with reason: temporary / uncertain /
     sensitive / already covered);
   - proposed SOUL.md diffs (do not apply silently);
   - unresolved conflicts or follow-up questions.

If no durable change is justified in any file, leave them all untouched and
report that clearly. This prompt is intended to be run about once a week with
`/weekly-memory-review`.
