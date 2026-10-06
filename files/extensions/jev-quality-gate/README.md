# jev-quality-gate

A separate Pi extension that adds bounded TypeSafe Jev checkpoints around the coding LLM. Compatible with auto-todo; it does not replace it or edit its artifacts.

Requires Pi 1.0.4 (the installed version). No runtime SDK dependency beyond host-provided Pi packages.

## Behavior

1. **Preflight:** Jev classifies the actual user request as coding, analysis, or trivial. Confidently trivial requests skip further checks. Deterministic greetings skip the API entirely.
2. **Plan checkpoint:** The LLM calls `jev_check` after drafting the plan. The extension also reviews a filled auto-todo plan at a turn boundary, or before the first direct/nested project `edit`/`write`. Run artifacts are exempt. A flagged plan can hold project edits for one turn while the LLM fixes it.
3. **Completion checkpoint:** Before settlement, Jev sees the original request, current PLAN/TODO, observed tool outputs, changed-text snippets, and final answer. It classifies visible coverage gaps, missing/failed validation, contradictions, or insufficient evidence.
4. **Correction:** The LLM receives one focused correction per checkpoint. Each phase allows at most two checks per request. No endless verification loop. A remaining gap is not converted into a pass.
5. **Snapshot:** Auto-todo writes `outcome.md` only after all automatic corrections settle.

Classification is advisory. Test results, typechecks, and observed behavior establish correctness. Shell mutations are not parsed or automatically blocked; the prompt explicitly requests a plan checkpoint before mutating shell commands.

The same current rendered system prompt is preserved when adding guidance, so auto-todo's full-prompt replacement does not erase Jev instructions in either extension order.

## Activate

Already in `~/.pi/agent/extensions/jev-quality-gate/index.ts`; Pi discovers this directory.

Run `/reload`. Run `/jev-gate status` to inspect mode and call counts.

Default mode is full. Pi's existing classifier credentials are used; no new keys are saved. Selection prefers authenticated `typesafe/jev-latest`, then authenticated Jev models from OpenRouter, Cloudflare, Vercel, and OpenCode. It never falls back to a non-Jev classifier.

If credentials are absent, the API fails, or a request exceeds 15 seconds, work continues normally. This is recorded as unavailable, never verified success.

## Commands

- `/jev-gate status` — mode, last verdict, checkpoint counts.
- `/jev-gate off` — disable immediately for this session.
- `/jev-gate on` — full mode immediately.
- `/jev-gate plan` — plan-only mode immediately.

## Configuration

- `PI_JEV_GATE=0` — startup mode off (the command remains available).
- `PI_JEV_GATE_MODE=off|plan|plan-only|full` — startup mode.
- `PI_JEV_GATE_PROVIDER` and `PI_JEV_GATE_MODEL_ID` — choose an explicit supported Jev provider/model pair. Missing explicit models do not silently switch providers.

The default confidence floor is 0.8. Coverage uses the expected score index (0–2), not the score answer's confidence. Missing/malformed answers are uncertain.

## Manual checkpoints

```js
const verdict = await tools.jev_check({ phase: "plan" });
text(verdict);
```

After implementation and actual checks:

```js
text(
  await tools.jev_check({
    phase: "done",
    evidence: "bun test: 18 pass, 0 fail; bun run check: exit 0",
  }),
);
```

Without auto-todo, supply the plan via `plan`. Evidence is bounded and may be truncated; Jev does not have independent repository or tool access.

## Validation

```sh
cd ~/.pi/agent/extensions/jev-quality-gate
bun install
bun run check
bun run test
bun run test:live   # opt-in live API calls using synthetic fixtures
```

Tests cover malformed responses, score/confidence separation, unavailable credentials, timeouts, artifact paths, nested results, sibling edits, correction budgets, immediate mode changes, and the real Pi SDK lifecycle with auto-todo in both extension orders.

Verdict/provider/token usage is persisted as `jev-quality-gate` custom entries. Explicit tool calls return usage for Pi accounting. Automatic hook usage is recorded in the audit entries; do not assume it is included in the standard session footer totals.

Checkpoint state resets on a new request, reload, or branch navigation. Streaming steering/follow-up messages update the request scope and reset budgets when delivered, without forgetting the original requirements. Auto-todo still owns its artifact lifecycle; queued inputs use the artifact contract already in the current prompt. Start a normal new request when you want a fresh artifact contract. The extension does not resume an old checkpoint after reloading mid-task.
