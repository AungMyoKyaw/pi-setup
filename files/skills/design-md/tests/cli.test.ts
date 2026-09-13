import { describe, expect, test } from "bun:test";

/**
 * Smoke test for the @google/design.md CLI. The agent skill relies on this
 * package for `lint`, `diff`, `export`, and `spec` commands. If the CLI is
 * unreachable (offline, npm down, package unpublished), the test is
 * skipped — set DESIGNmd_SKIP_CLI=1 to force-skip, or DESIGNmd_REQUIRE_CLI=1
 * to fail-fast instead.
 *
 * We deliberately do not mock or stub this. If the CLI is reachable, we want
 * to know it actually works.
 */

const SHOULD_SKIP =
  process.env.DESIGNmd_SKIP_CLI === "1" || process.env.CI === "true";

describe("cli: npx @google/design.md spec smoke test (T5)", () => {
  test.skipIf(SHOULD_SKIP)(
    "spec command produces non-empty markdown starting with '# DESIGN.md'",
    () => {
      // bun's spawnSync is synchronous; we wait for npx to resolve the package,
      // download if needed, run, and exit. First call can take ~10s.
      const proc = Bun.spawnSync(["npx", "-y", "@google/design.md", "spec"], {
        cwd: import.meta.dir,
        env: process.env,
        stdout: "pipe",
        stderr: "pipe",
      });

      if (proc.exitCode !== 0) {
        const stderr = proc.stderr.toString();
        throw new Error(
          `npx @google/design.md spec exited with code ${proc.exitCode}.\n` +
            `stderr (first 500 chars): ${stderr.slice(0, 500)}`,
        );
      }

      const stdout = proc.stdout.toString();
      expect(stdout.length).toBeGreaterThan(0);
      // The spec output begins with an HTML-style comment line, then "# DESIGN.md Format".
      expect(stdout).toContain("# DESIGN.md");
    },
    // 90s timeout — npx first-call download can be slow
    90_000,
  );
});
