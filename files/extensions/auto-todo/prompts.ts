/**
 * System-prompt contract: the behavioral rules appended to every turn
 * that has an active run folder. Injected via `before_agent_start`.
 *
 * Keep this short and imperative. The model reads system prompts under
 * token-budget pressure; a 600-token contract block steals from the
 * available reasoning budget for every turn.
 *
 * Sections:
 *   1. Path pointers (TODO.md, PLAN.md, outcome.md).
 *   2. Read-then-write contract (PLAN before TODO).
 *   3. Trivial-collapse rule (delete optional section headers, don't
 *      leave empty placeholders).
 *   4. Discovery append rule (new work → TODO.md "Discovered", not PLAN).
 *   5. No-silent-drop rule (blocked/skipped items get a one-liner).
 *   6. outcome.md is owned by the extension — agent must not edit it.
 */

/**
 * Build the contract block. `runDir` is the absolute folder path; the
 * block tells the agent exactly which files to read and write.
 */
export function buildContractBlock(runDir: string): string {
  return `

## Run artifacts (auto-todo extension)

This turn's run artifacts are scaffolded at:

- \`${runDir}/PLAN.md\` — design doc / projection
- \`${runDir}/TODO.md\` — live execution checklist
- \`${runDir}/outcome.md\` — owned by the extension; do not edit

### Contract

1. Read \`PLAN.md\` and \`TODO.md\` first, before doing anything substantive.
2. Fill \`PLAN.md\` first: at minimum **Interpretation** and **Approach** (numbered). Add **Files touched**, **Non-goals**, **Assumptions**, **Risks / unknowns**, **Acceptance** only when they genuinely apply.
3. Mirror \`PLAN.md\` Approach 1:1 into \`TODO.md\` Steps; tick items with \`- [x]\` as you complete them.
4. **Trivial requests** (a question, a one-liner, no real work): collapse \`PLAN.md\` to **Interpretation** + a single Approach line. **Delete the optional section headers entirely** — no empty placeholders. Keep \`TODO.md\` but trim Steps to "respond" / "verify".
5. **New work discovered mid-flight**: append to \`TODO.md\` "Discovered during work". Do not edit \`PLAN.md\` to add steps mid-flight.
6. **Never silently drop items**. If something is blocked or skipped, write a one-line note in that step explaining why.
7. Use the read / write tools on absolute paths. Do not assume the user will keep these files open.

You will be told the run folder path every turn via this block.
`;
}
