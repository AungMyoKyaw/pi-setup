import { afterEach, describe, expect, test } from "bun:test";
import { lstatSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import {
  ensureSafeHomeCwd,
  getSafeHomeCwd,
  isHomeCwd,
  isProtectedCwd,
  isRootCwd,
  redirectBashCommand,
  redirectToolInput,
  resolveSafeToolPath,
  shellQuote,
} from "./logic.ts";

const temporaryDirectories: string[] = [];

afterEach(() => {
  while (temporaryDirectories.length > 0) {
    const directory = temporaryDirectories.pop();
    if (directory) rmSync(directory, { recursive: true, force: true });
  }
});

describe("home cwd detection", () => {
  test("matches the exact home path", () => {
    expect(isHomeCwd("/Users/tester", "/Users/tester")).toBe(true);
    expect(isHomeCwd("/Users/tester/project", "/Users/tester")).toBe(false);
  });
});

describe("protected cwd detection", () => {
  test("protects the filesystem root", () => {
    expect(isRootCwd("/")).toBe(true);
    expect(isProtectedCwd("/", "/Users/tester")).toBe(true);
    expect(isProtectedCwd("/Users/tester/project", "/Users/tester")).toBe(false);
  });
});

describe("safe home cwd", () => {
  test("creates a stable private scratch directory", () => {
    const tempRoot = mkdtempSync("/tmp/pi-safe-home-test-");
    temporaryDirectories.push(tempRoot);

    const safeCwd = ensureSafeHomeCwd(tempRoot);

    expect(safeCwd).toBe(getSafeHomeCwd(tempRoot));
    expect(lstatSync(safeCwd).isDirectory()).toBe(true);
    expect(lstatSync(safeCwd).mode & 0o777).toBe(0o700);
  });
});

describe("relative tool redirection", () => {
  const safeCwd = "/tmp/pi-home-scratch";

  test("resolves relative paths under the safe cwd", () => {
    expect(resolveSafeToolPath("src/index.ts", safeCwd)).toBe("/tmp/pi-home-scratch/src/index.ts");
    expect(resolveSafeToolPath("@README.md", safeCwd)).toBe("/tmp/pi-home-scratch/README.md");
  });

  test("preserves explicit absolute and tilde paths", () => {
    expect(resolveSafeToolPath("/Users/tester/file.txt", safeCwd)).toBe("/Users/tester/file.txt");
    expect(resolveSafeToolPath("~/.zshrc", safeCwd)).toBe("~/.zshrc");
  });

  test("redirects optional search roots when omitted", () => {
    const input: Record<string, unknown> = {};
    redirectToolInput("find", input, safeCwd);
    expect(input.path).toBe(safeCwd);
  });

  test("redirects file tool paths without touching unrelated inputs", () => {
    const input: Record<string, unknown> = {
      path: "notes.txt",
      limit: 20,
    };
    redirectToolInput("read", input, safeCwd);
    expect(input).toEqual({ path: join(safeCwd, "notes.txt"), limit: 20 });
  });
});

describe("bash redirection", () => {
  test("quotes the safe cwd and prefixes the command", () => {
    const safeCwd = "/tmp/pi home/'scratch'";
    expect(shellQuote(safeCwd)).toBe("'/tmp/pi home/'\\''scratch'\\''' ".trim());
    expect(redirectBashCommand("pwd && printf 'ok'", safeCwd)).toBe(
      "cd '/tmp/pi home/'\\''scratch'\\''' && pwd && printf 'ok'",
    );
  });

  test("redirects bash tool input", () => {
    const input: Record<string, unknown> = { command: "pwd" };
    redirectToolInput("bash", input, "/tmp/pi-home-scratch");
    expect(input.command).toBe("cd '/tmp/pi-home-scratch' && pwd");
  });
});
