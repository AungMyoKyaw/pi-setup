/**
 * Markdown templates for TODO.md, PLAN.md, and outcome.md.
 *
 * Templates are pure functions — no fs, no globals, fully testable.
 * Each renders to a self-contained markdown string with literal sections
 * the agent must fill. Comments inside the templates use HTML-comment syntax
 * (`<!-- ... -->`) so they survive rendering but stay invisible when
 * the file is displayed.
 *
 * Trivial-collapse rule: PLAN.md has optional sections (Non-goals,
 * Assumptions, Risks, Acceptance). The contract in prompts.ts instructs
 * the agent to delete those section headers entirely when not applicable,
 * rather than leave empty placeholders.
 */

export interface TemplateArgs {
  /** Pre-formatted header line, e.g. "> slug: foo · run: abc12345 · 2026-...". */
  header: string;
  /** Absolute path to the run folder. Echoed back for self-locating reference. */
  runDir: string;
  /** User's original request, optionally truncated for safe display. */
  request: string;
}

export function renderTodoMd(args: TemplateArgs): string {
  return `# TODO

${args.header}

> Run folder: \`${args.runDir}\`
>
> Request:
>
> \`\`\`
> ${args.request.replace(/\n/g, "\n> ")}
> \`\`\`

## Steps

<!-- Mirror the PLAN.md "Approach" section 1:1. Tick items as you complete them: - [x]. -->
- [ ] Read \`PLAN.md\` first; fill in Interpretation + any optional sections that apply
- [ ] Mirror the Approach into these Steps (replace these starter steps)
- [ ] Implement the smallest coherent change
- [ ] Validate (tests / typecheck / lint / build as the project requires)
- [ ] Record outcome notes in this file's "Done" section

## Discovered during work

<!-- Append new items here as they surface mid-flight. Do not edit PLAN.md to add them. -->

## Done

<!-- Move completed items here, or just tick [x] above and leave them in place. -->
`;
}

export function renderPlanMd(args: TemplateArgs): string {
  return `# PLAN

${args.header}

> Run folder: \`${args.runDir}\`
>
> Request:
>
> \`\`\`
> ${args.request.replace(/\n/g, "\n> ")}
> \`\`\`

## Interpretation

<!-- 1-3 sentences: what does the user actually want? Quote the request if it's ambiguous. -->

## Approach

<!-- Numbered, small, actionable steps. Mirror these 1:1 into TODO.md "Steps". -->

## Files touched

<!-- One bullet per path: "- \`src/foo.ts\` — what changes." -->

## Non-goals

<!-- optional; DELETE this section header if there are none. Don't leave empty placeholders. -->

## Assumptions

<!-- optional; DELETE this section header if there are none. -->

## Risks / unknowns

<!-- optional; DELETE this section header if there are none. -->

## Acceptance

<!-- optional; DELETE this section header if not stated. What proves the work is done? -->
`;
}

export interface OutcomeArgs extends TemplateArgs {
  /** Frozen contents of TODO.md at agent_settled. */
  todoSnapshot: string;
  /** Last assistant message text, trimmed. */
  assistantSnippet: string;
  /** Settled vs abandoned (compaction/retry queued). */
  status: "settled" | "abandoned";
}

export function renderOutcomeMd(args: OutcomeArgs): string {
  return `# OUTCOME

${args.header}

## Status

${args.status}

## Final TODO.md state

\`\`\`markdown
${args.todoSnapshot.replace(/```/g, "~~~")}
\`\`\`

## Last assistant message

\`\`\`
${args.assistantSnippet.replace(/```/g, "~~~")}
\`\`\`

## Run folder

${args.runDir}
`;
}
