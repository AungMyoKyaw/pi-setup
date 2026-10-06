import { describe, expect, test } from "bun:test";
import { mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { clip, isRunArtifact, planReady, readBounded, runDirectory, textOf } from "../evidence.ts";
import { buildContractBlock } from "../../auto-todo/prompts.ts";
import { filledPlan } from "./helpers.ts";

describe("bounded evidence", () => {
  test("extracts only the generated auto-todo contract", () => {
    expect(runDirectory("some unrelated /tmp/PLAN.md")).toBeUndefined();
    expect(runDirectory(buildContractBlock("/tmp/run"))).toBe("/tmp/run");
    expect(runDirectory(buildContractBlock("/tmp/old") + buildContractBlock("/tmp/new"))).toBe(
      "/tmp/new",
    );
  });
  test("requires real filled plan sections", () => {
    expect(planReady(filledPlan)).toBe(true);
    expect(planReady("## Interpretation\n<!-- fill -->\n## Approach\n<!-- steps -->")).toBe(false);
  });
  test("clip preserves both beginning and ending", () => {
    const result = clip("START" + "x".repeat(20000) + "END", 1000);
    expect(result).toStartWith("START");
    expect(result).toEndWith("END");
    expect(result.length).toBeLessThanOrEqual(1000);
  });
  test("only text content reaches classifier; no binary or thinking", () => {
    expect(
      textOf([
        { type: "image", data: "SECRET" },
        { type: "thinking", thinking: "hidden" },
        { type: "text", text: "ok" },
      ]),
    ).toBe("ok");
  });
  test("reads bounded file data and rejects missing files/directories", async () => {
    const dir = await mkdtemp(join(tmpdir(), "jev-evidence-"));
    try {
      await writeFile(join(dir, "big"), "x".repeat(100_000));
      expect((await readBounded(join(dir, "big"))).length).toBeLessThan(25000);
      expect(await readBounded(join(dir, "missing"))).toContain("missing");
      expect(await readBounded(dir)).toContain("regular file");
    } finally {
      await rm(dir, { recursive: true });
    }
  });
  test("artifact exemptions honor path boundary and symlink escape", async () => {
    const root = await mkdtemp(join(tmpdir(), "jev-path-"));
    try {
      await writeFile(join(root, "outside.ts"), "code");
      const run = join(root, "run");
      await (await import("node:fs/promises")).mkdir(run);
      await symlink(join(root, "outside.ts"), join(run, "escape.ts"));
      expect(await isRunArtifact(join(run, "PLAN.md"), run, root)).toBe(true);
      expect(await isRunArtifact(join(root, "run-evil", "file"), run, root)).toBe(false);
      expect(await isRunArtifact(join(run, "escape.ts"), run, root)).toBe(false);
    } finally {
      await rm(root, { recursive: true });
    }
  });
});
