import { afterEach, describe, expect, test } from "bun:test";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  readlinkSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join, relative } from "node:path";
import { deepMerge, installProfile, manifest, prepareHome, repoRoot } from "./smoke.ts";

const scratch: string[] = [];
function home(): string {
  const path = mkdtempSync(join(tmpdir(), "pi-setup-smoke-test-"));
  scratch.push(path);
  return prepareHome(path);
}
afterEach(() => {
  for (const path of scratch.splice(0)) rmSync(path, { recursive: true, force: true });
});
const read = (path: string) => readFileSync(path, "utf8");

describe("manifest-driven smoke mirror", () => {
  for (const profile of Object.keys(manifest.profiles)) {
    test(`${profile}: installs precisely its selected resources without dependency/network calls`, () => {
      const root = home();
      installProfile(root, profile, false);
      const components = manifest.profiles[profile].map((name) => manifest.components[name]);
      const extensions = components.flatMap((component) => component.extensions ?? []).sort();
      const skills = components.flatMap((component) => component.skills ?? []).sort();
      const names = (path: string) => (existsSync(path) ? readdirSync(path).sort() : []);
      expect(names(join(root, ".pi/agent/extensions"))).toEqual(extensions);
      expect(names(join(root, ".agents/skills"))).toEqual(skills);
      expect(names(join(root, ".pi/agent/prompts"))).toEqual(
        readdirSync(join(repoRoot, "files/prompts")).sort(),
      );
      expect(existsSync(join(root, ".pi/agent/SOUL.md"))).toBe(
        manifest.profiles[profile].includes("soul"),
      );
      if (extensions.includes("jev-quality-gate")) {
        expect(
          existsSync(join(root, ".pi/agent/extensions/jev-quality-gate/tests/integration.test.ts")),
        ).toBe(true);
        expect(extensions).toContain("auto-todo");
      }
      expect(existsSync(join(root, ".pi/agent/parallel-tools.json"))).toBe(false);
      expect(existsSync(join(root, ".pi/agent/extensions/_shared"))).toBe(false);
      expect(existsSync(join(root, ".agents/skills/design-principles"))).toBe(false);
      expect(existsSync(join(root, ".pi/agent/extensions/auto-optimize-images/node_modules"))).toBe(
        false,
      );
      expect(existsSync(join(root, ".pi/agent/extensions/auto-optimize-images/bun.lock"))).toBe(
        false,
      );
    });
  }

  test("recommended includes every delivery-loop dependency", () => {
    const skills = manifest.components["skills-core"].skills!;
    for (const name of ["grilling", "grill-me", "loop-me"]) expect(skills).toContain(name);
    expect(manifest.components["extensions-core"].extensions).toHaveLength(3);
    expect(manifest.components["extensions-all"].extensions).toHaveLength(8);
  });

  test("deep merge preserves user-only nested keys and source arrays/scalars win", () => {
    expect(
      deepMerge(
        { keep: 1, nested: { keep: true, replace: 1 }, list: [1] },
        {
          nested: { replace: 2 },
          list: [2],
          added: true,
        },
      ),
    ).toEqual({ keep: 1, nested: { keep: true, replace: 2 }, list: [2], added: true });
  });

  test("repeat install preserves identity/user settings and backs up every managed overwrite", () => {
    const root = home();
    installProfile(root, "full", false);
    const settingsPath = join(root, ".pi/agent/settings.json");
    const settings = JSON.parse(read(settingsPath));
    settings.userOnly = { keep: true };
    settings.defaultProvider = "user-choice";
    const originalSettings = JSON.stringify(settings);
    writeFileSync(settingsPath, originalSettings);
    const agents = join(root, ".agents/AGENTS.md");
    const memory = join(root, ".agents/MEMORY.md");
    const soul = join(root, ".pi/agent/SOUL.md");
    for (const path of [agents, memory, soul]) writeFileSync(path, "Existing user identity\n");
    const extension = join(root, ".pi/agent/extensions/jev-quality-gate/index.ts");
    writeFileSync(extension, "Existing extension\n");
    const unrelated = join(root, ".pi/agent/extensions/user-extension.ts");
    writeFileSync(unrelated, "User-owned extension\n");
    const backup = installProfile(root, "full", false);
    const merged = JSON.parse(read(settingsPath));
    expect(merged.userOnly).toEqual({ keep: true });
    expect(merged.defaultProvider).toBe("openai-codex");
    expect(read(join(backup, relative(root, settingsPath)))).toBe(originalSettings);
    expect(read(join(backup, relative(root, extension)))).toBe("Existing extension\n");
    expect(read(extension)).toBe(
      read(join(repoRoot, "files/extensions/jev-quality-gate/index.ts")),
    );
    for (const path of [agents, memory, soul]) {
      expect(read(path)).toBe("Existing user identity\n");
      expect(existsSync(join(backup, relative(root, path)))).toBe(false);
    }
    expect(readlinkSync(join(root, ".pi/agent/AGENTS.md"))).toBe(agents);
    expect(read(unrelated)).toBe("User-owned extension\n");
  });

  test("replaces and backs up a conflicting context link", () => {
    const root = home();
    const context = join(root, ".pi/agent/AGENTS.md");
    writeFileSync(context, "Old conflicting context\n");
    const backup = installProfile(root, "recommended", false);
    expect(read(join(backup, ".pi/agent/AGENTS.md"))).toBe("Old conflicting context\n");
    expect(readlinkSync(context)).toBe(join(root, ".agents/AGENTS.md"));
  });

  test("rejects live HOME, unmarked nonempty directories, and root symlinks", () => {
    expect(() => prepareHome(homedir())).toThrow();
    const root = mkdtempSync(join(tmpdir(), "pi-setup-smoke-guard-"));
    scratch.push(root);
    writeFileSync(join(root, "user-file"), "Untouched\n");
    expect(() => prepareHome(root)).toThrow("not a smoke HOME");
    const link = join(root, "alias");
    symlinkSync(root, link);
    expect(() => prepareHome(link)).toThrow("symlink");
    expect(read(join(root, "user-file"))).toBe("Untouched\n");
  });

  test("rejects target parent symlinks escaping scratch HOME", () => {
    const root = home();
    const outside = mkdtempSync(join(tmpdir(), "pi-setup-smoke-outside-"));
    scratch.push(outside);
    rmSync(join(root, ".pi/agent"), { recursive: true });
    symlinkSync(outside, join(root, ".pi/agent"));
    expect(() => installProfile(root, "minimal", false)).toThrow();
    expect(readdirSync(outside)).toEqual([]);
  });

  test("unknown profiles fail before managed targets are written", () => {
    const root = home();
    expect(() => installProfile(root, "missing", false)).toThrow("Unknown profile");
    expect(existsSync(join(root, ".pi/agent/settings.json"))).toBe(false);
  });
});
