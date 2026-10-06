import { afterEach, describe, expect, test } from "bun:test";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fixture, reply } from "./helpers.ts";
const cleanups: Array<() => Promise<void>> = [];
async function make(options: Parameters<typeof fixture>[0] = {}) {
  const f = await fixture(options);
  cleanups.push(f.cleanup);
  return f;
}
afterEach(async () => {
  await Promise.all(cleanups.splice(0).map((f) => f()));
});

describe("extension hooks and budgets", () => {
  test("preserves auto-todo prompt and actual request", async () => {
    const f = await make();
    const result = await f.start("fix login");
    expect(result.systemPrompt).toContain("Run artifacts (auto-todo extension)");
    expect(result.systemPrompt).toContain("Jev quality checkpoints");
    expect(f.requests[0].state.request).toBe("fix login");
    await f.emit("agent_before_settle", f.boundary());
    expect(f.requests.at(-1)!.state.request).toBe("fix login");
    expect(f.requests.at(-1)!.state.plan).toContain("## Interpretation");
  });
  test("artifact edits are exempt, project edits trigger plan review", async () => {
    const f = await make();
    await f.start();
    await f.emit("tool_call", {
      toolName: "write",
      input: { path: join(f.dir, "PLAN.md") },
    });
    expect(f.requests.length).toBe(1);
    expect(
      await f.emit("tool_call", {
        toolName: "edit",
        input: { path: join(f.dir, "..", "src.ts") },
      }),
    ).toBeUndefined();
    expect(f.requests.length).toBe(2);
  });
  test("parallel sibling edits share one plan check and all block on same-turn failure", async () => {
    const f = await make({ outcomes: [reply("coverage", 1)] });
    await f.start();
    const results = await Promise.all(
      [1, 2, 3].map((i) =>
        f.emit("tool_call", {
          toolName: "edit",
          toolCallId: String(i),
          input: { path: "src.ts" },
        }),
      ),
    );
    expect(results.every((r) => r?.block)).toBe(true);
    expect(f.requests.length).toBe(2);
    await f.emit("turn_start", { turnIndex: 1 });
    await writeFile(
      join(f.dir, "PLAN.md"),
      (await import("./helpers.ts")).filledPlan + "\nAdd retry tests too.",
    );
    expect(
      await f.emit("tool_call", {
        toolName: "edit",
        input: { path: "src.ts" },
      }),
    ).toBeUndefined();
  });
  test("completion continues once, preserves prior entries, and caps repeated failures", async () => {
    const f = await make({
      outcomes: [reply("coverage", 1), reply("validation", 1), reply("coverage", 0)],
    });
    await f.start();
    const event = f.boundary();
    event.entries = [{ type: "custom", customType: "other", data: 1 }] as any;
    const first = await f.emit("agent_before_settle", event);
    expect(first.continue).toBe(true);
    expect(first.entries[0].customType).toBe("other");
    expect(first.entries[1].content).toContain("coverage");
    expect(await f.emit("agent_before_settle", f.boundary("Revised answer one."))).toBeUndefined();
    expect(await f.emit("agent_before_settle", f.boundary("Revised answer two."))).toBeUndefined();
    expect(f.requests.filter((r) => r.state.phase === "done").length).toBe(2);
  });
  test("new request resets correction and evidence budgets", async () => {
    const f = await make({
      outcomes: [reply("coverage", 1), reply("coverage", 1)],
    });
    await f.start();
    expect((await f.emit("agent_before_settle", f.boundary())).continue).toBe(true);
    await f.start("Fix a totally different bug with tests.");
    expect((await f.emit("agent_before_settle", f.boundary())).continue).toBe(true);
  });
  test("nested bash verification evidence reaches completion classifier", async () => {
    const f = await make();
    await f.start();
    await f.emit("tool_execution_start", {
      toolCallId: "outer/1",
      toolName: "bash",
      args: { command: "bun test" },
      parentToolCallId: "outer",
    });
    await f.emit("tool_execution_end", {
      toolCallId: "outer/1",
      toolName: "bash",
      isError: false,
      result: { content: [{ type: "text", text: "18 pass, 0 fail" }] },
      parentToolCallId: "outer",
    });
    await f.emit("agent_before_settle", f.boundary());
    expect(JSON.stringify(f.requests.at(-1)!.state.observations)).toContain("command=bun test");
    expect(JSON.stringify(f.requests.at(-1)!.state.observations)).toContain("18 pass");
  });
  test("missing credentials neither block edits nor continue completion", async () => {
    const f = await make({ available: false });
    await f.start();
    expect(
      await f.emit("tool_call", { toolName: "edit", input: { path: "x.ts" } }),
    ).toBeUndefined();
    expect(await f.emit("agent_before_settle", f.boundary())).toBeUndefined();
    expect(f.requests.length).toBe(0);
  });
  test("API error never triggers a correction", async () => {
    const f = await make({
      outcomes: [{ ...reply(), stopReason: "error", errorMessage: "offline" }],
    });
    await f.start();
    expect(await f.emit("agent_before_settle", f.boundary())).toBeUndefined();
    expect(f.audits.at(-1).data.verdict).toBe("unavailable");
  });
  test("aborts, pending messages and other continuations skip completion", async () => {
    const f = await make();
    await f.start();
    for (const e of [
      { ...f.boundary(), outcome: "aborted" },
      { ...f.boundary(), continue: true },
    ])
      expect(await f.emit("agent_before_settle", e)).toBeUndefined();
    (f.ctx.hasPendingMessages as any) = () => true;
    expect(await f.emit("agent_before_settle", f.boundary())).toBeUndefined();
    expect(f.requests.length).toBe(1);
  });
  test("plan-only mode never runs completion", async () => {
    const f = await make({ mode: "plan" });
    await f.start();
    expect(await f.emit("agent_before_settle", f.boundary())).toBeUndefined();
    await f.emit("tool_call", { toolName: "edit", input: { path: "x.ts" } });
    expect(f.requests.length).toBe(2);
  });
  test("on/off commands take effect immediately, even when initially off", async () => {
    const f = await make({ mode: "off" });
    await f.start();
    expect(f.requests.length).toBe(0);
    await f.commands.get("jev-gate").handler("on", f.ctx);
    await f.start();
    expect(f.requests.length).toBe(1);
    await f.commands.get("jev-gate").handler("off", f.ctx);
    expect(await f.emit("agent_before_settle", f.boundary())).toBeUndefined();
  });
  test("explicit checkpoint returns verdict and usage without forced continuation", async () => {
    const f = await make();
    await f.start();
    const check = await f.tools
      .get("jev_check")
      .execute("id", { phase: "plan" }, undefined, undefined, f.ctx);
    expect(check.details.verdict).toBe("pass");
    expect(check.content[0].text).toContain("plan: pass");
  });
  test("plan-ready detection ignores untouched scaffold comments", async () => {
    const f = await make();
    await f.start();
    await writeFile(
      join(f.dir, "PLAN.md"),
      "## Interpretation\n<!-- description -->\n## Approach\n<!-- numbered steps -->",
    );
    expect(await f.emit("turn_end", f.boundary())).toBeUndefined();
    expect(f.requests.length).toBe(1);
  });
  test("supplied standalone plan is reused by automatic edit checkpoint", async () => {
    const f = await make();
    await f.start();
    f.ctx.getSystemPrompt = () => "base";
    await f.tools.get("jev_check").execute(
      "id",
      {
        phase: "plan",
        plan: "Implement retries and idempotency, test duplicate requests and failures.",
      },
      undefined,
      undefined,
      f.ctx,
    );
    await f.emit("tool_call", { toolName: "edit", input: { path: "x.ts" } });
    expect(f.requests.filter((r) => r.state.phase === "plan").length).toBe(1);
  });
  test("cached tool verdict does not count the same usage twice", async () => {
    const result = reply();
    result.usage = {
      input: 10,
      output: 5,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 15,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    };
    const f = await make({ outcomes: [result] });
    await f.start();
    const tool = f.tools.get("jev_check");
    const first = await tool.execute("id1", { phase: "plan" }, undefined, undefined, f.ctx);
    const second = await tool.execute("id2", { phase: "plan" }, undefined, undefined, f.ctx);
    expect(first.usage.totalTokens).toBe(15);
    expect(second.usage).toBeUndefined();
  });
  test("queued user request updates scope and resets budgets only when delivered", async () => {
    const f = await make({
      outcomes: [reply("coverage", 1), reply("coverage", 1)],
    });
    await f.start();
    expect((await f.emit("agent_before_settle", f.boundary())).continue).toBe(true);
    const additional = "Also add exponential backoff.";
    await f.emit("input", {
      source: "interactive",
      text: additional,
      streamingBehavior: "steer",
    });
    expect(await f.emit("agent_before_settle", f.boundary())).toBeUndefined();
    await f.emit("message_start", {
      message: { role: "user", content: [{ type: "text", text: additional }] },
    });
    expect((await f.emit("agent_before_settle", f.boundary())).continue).toBe(true);
    expect(String(f.requests.at(-1)!.state.request)).toContain("idempotency");
    expect(String(f.requests.at(-1)!.state.request)).toContain("exponential backoff");
  });
  test("plan-only mode cannot return cached completion pass", async () => {
    const f = await make();
    await f.start();
    const tool = f.tools.get("jev_check");
    expect(
      (await tool.execute("one", { phase: "done" }, undefined, undefined, f.ctx)).details.verdict,
    ).toBe("pass");
    await f.commands.get("jev-gate").handler("plan", f.ctx);
    expect(
      (await tool.execute("two", { phase: "done" }, undefined, undefined, f.ctx)).details.verdict,
    ).toBe("unavailable");
  });
  test("cancelled checkpoints do not cache or audit a late successful result", async () => {
    const f = await make();
    await f.start();
    const controller = new AbortController();
    f.ctx.signal = controller.signal;
    let finish: (value: ReturnType<typeof reply>) => void = () => {};
    let entered: () => void = () => {};
    const started = new Promise<void>((resolve) => {
      entered = resolve;
    });
    f.ctx.modelRegistry.classify = () =>
      new Promise((resolve) => {
        finish = resolve;
        entered();
      });
    const pending = f.emit("agent_before_settle", f.boundary());
    await started;
    controller.abort();
    await pending;
    finish(reply());
    await Promise.resolve();
    expect(f.audits.filter((a) => a.data.phase === "done" && a.data.verdict === "pass")).toEqual(
      [],
    );
  });
  test("branch navigation clears stale request state", async () => {
    const f = await make();
    await f.start();
    await f.emit("session_tree");
    expect(await f.emit("agent_before_settle", f.boundary())).toBeUndefined();
  });
});
