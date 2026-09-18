import { describe, expect, test } from "bun:test";
import { resolveVaultPath, shouldAutoRetrieve } from "./logic";

describe("Second Brain auto-retrieval", () => {
  test("only activates for explicit memory-related prompts", () => {
    expect(shouldAutoRetrieve("What did I decide about the deployment?")).toBe(true);
    expect(shouldAutoRetrieve("Use global xhigh thinking.")).toBe(false);
    expect(shouldAutoRetrieve("Fix the TypeScript test.")).toBe(false);
  });
});

describe("Second Brain vault paths", () => {
  const root = "/tmp/second-brain";

  test("resolves paths inside the vault", () => {
    expect(resolveVaultPath(root, "notes/today.md")).toBe("/tmp/second-brain/notes/today.md");
  });

  test("rejects traversal outside the vault", () => {
    expect(() => resolveVaultPath(root, "../../outside.md")).toThrow(
      "Path must stay inside the Second Brain vault",
    );
  });
});
