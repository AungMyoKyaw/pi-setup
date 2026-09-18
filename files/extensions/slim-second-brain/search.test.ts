import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test } from "bun:test";
import { searchMarkdown } from "./index";

const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

test("Second Brain search collapses exact mirrored note content", async () => {
  const root = await mkdtemp(join(tmpdir(), "slim-second-brain-"));
  temporaryRoots.push(root);
  const note = "# Deployment decision\n\nUse Bun for scripts.\n";
  await Promise.all([
    writeFile(join(root, "active.md"), note),
    writeFile(join(root, "archive.md"), note),
  ]);

  const results = await searchMarkdown(root, "deployment decision", 10);

  expect(results).toHaveLength(1);
  expect(results[0]?.path).toBe("active.md");
});
