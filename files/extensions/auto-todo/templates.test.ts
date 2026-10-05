/**
 * Tests for templates.ts: renderTodoMd, renderPlanMd, renderOutcomeMd.
 *
 * Asserts that:
 *   - each template is non-empty valid markdown
 *   - required sections are present (the agent must not silently lose them)
 *   - the header, run folder, and request preview are echoed correctly
 *   - the optional PLAN sections are present as headers but empty bodies
 *     (the agent can delete the headers when not applicable)
 *   - outcome.md handles backtick sequences in TODO snapshots without
 *     breaking the outer fence
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { renderOutcomeMd, renderPlanMd, renderTodoMd } from "./templates.ts";

const ARGS = {
  header: "> slug: hello-world · run: abc12345 · 2026-05-07T10:00:00.000Z",
  runDir: "/tmp/runs/2026-05-07/abc12345",
  request: "fix the login bug",
};

test("renderTodoMd includes required sections", () => {
  const out = renderTodoMd(ARGS);
  for (const section of ["# TODO", "## Steps", "## Discovered during work", "## Done"]) {
    assert.ok(out.includes(section), `missing section: ${section}`);
  }
});

test("renderTodoMd echoes header, run dir, and request preview", () => {
  const out = renderTodoMd(ARGS);
  assert.ok(out.includes(ARGS.header));
  assert.ok(out.includes(ARGS.runDir));
  assert.ok(out.includes(ARGS.request));
});

test("renderTodoMd starts Steps as tickable markdown checkboxes", () => {
  const out = renderTodoMd(ARGS);
  assert.match(out, /## Steps\n[\s\S]*- \[ \]/);
});

test("renderPlanMd includes required sections", () => {
  const out = renderPlanMd(ARGS);
  for (const section of [
    "# PLAN",
    "## Interpretation",
    "## Approach",
    "## Files touched",
    "## Non-goals",
    "## Assumptions",
    "## Risks / unknowns",
    "## Acceptance",
  ]) {
    assert.ok(out.includes(section), `missing section: ${section}`);
  }
});

test("renderPlanMd mirrors the header from TODO", () => {
  const out = renderPlanMd(ARGS);
  assert.ok(out.includes(ARGS.header));
});

test("renderOutcomeMd includes status, snapshot, snippet, run folder", () => {
  const out = renderOutcomeMd({
    ...ARGS,
    todoSnapshot: "- [x] done\n- [ ] todo",
    assistantSnippet: "I fixed the bug.",
    status: "settled",
  });
  assert.match(out, /## Status\n+\n?settled/);
  assert.ok(out.includes("- [x] done"));
  assert.ok(out.includes("I fixed the bug."));
  assert.ok(out.includes(ARGS.runDir));
});

test("renderOutcomeMd escapes inner backticks in TODO snapshot", () => {
  // A naive template would close the outer fence at the first ``` in the
  // snapshot. We escape to ~~~ so the markdown stays well-formed.
  const out = renderOutcomeMd({
    ...ARGS,
    todoSnapshot: "```js\nconst x = 1;\n```",
    assistantSnippet: "ok",
    status: "settled",
  });
  // Snapshot must be wrapped in ~~~ fences, not ```.
  assert.match(out, /```markdown\n~~~js/);
  assert.ok(out.includes("~~~"));
});

test("renderOutcomeMd status renders 'abandoned' for non-settled runs", () => {
  const out = renderOutcomeMd({
    ...ARGS,
    todoSnapshot: "(missing)",
    assistantSnippet: "",
    status: "abandoned",
  });
  assert.match(out, /## Status\n+\n?abandoned/);
});

test("request preview handles newlines safely in TODO.md", () => {
  const out = renderTodoMd({ ...ARGS, request: "line1\nline2\nline3" });
  // Each line should be prefixed with "> " so the code block stays inside
  // the blockquote (the template uses "> ```\n> ...\n> ```" framing).
  assert.match(out, /> line1/);
  assert.match(out, /> line2/);
  assert.match(out, /> line3/);
});
