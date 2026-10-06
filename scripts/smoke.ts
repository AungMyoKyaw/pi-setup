// Development-only mirror of SETUP.md. Never use this on a live HOME.
import assert from "node:assert/strict";
import {
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  readlinkSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

export const repoRoot = resolve(import.meta.dir, "..");
const generated = new Set(["node_modules", ".git", "__pycache__", "bun.lock", "package-lock.json"]);
const marker = ".pi-setup-smoke-root";

type FileEntry = { source: string; target: string };
type Component = Partial<FileEntry> & {
  strategy: "deep-merge" | "copy" | "skip-if-exists" | "extension" | "skill";
  files?: FileEntry[];
  links?: FileEntry[];
  extensions?: string[];
  skills?: string[];
};
type Manifest = { profiles: Record<string, string[]>; components: Record<string, Component> };
export const manifest = Bun.YAML.parse(
  readFileSync(join(repoRoot, "setup.yaml"), "utf8"),
) as Manifest;

function present(path: string): boolean {
  try {
    lstatSync(path);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    return false;
  }
}

function within(root: string, path: string): boolean {
  const rel = relative(root, path);
  return rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel);
}

export function prepareHome(input?: string): string {
  const home = input ? resolve(input) : mkdtempSync(join(tmpdir(), "pi-setup-smoke-"));
  assert(home !== homedir() && home !== resolve("/"), "Smoke HOME must be disposable");
  assert(!present(home) || !lstatSync(home).isSymbolicLink(), "Smoke HOME cannot be a symlink");
  mkdirSync(home, { recursive: true });
  const real = realpathSync(home);
  assert(
    real !== realpathSync(homedir()) && !within(real, realpathSync(homedir())),
    "Refusing live HOME or its ancestors",
  );
  assert(
    !within(realpathSync(homedir()), real) || within(realpathSync(tmpdir()), real),
    "Use a temporary HOME outside your real HOME",
  );
  assert(
    readdirSync(real).length === 0 || existsSync(join(real, marker)),
    "Existing directory is not a smoke HOME",
  );
  writeFileSync(join(real, marker), "Disposable pi-setup smoke HOME\n");
  mkdirSync(join(real, ".pi/agent"), { recursive: true });
  mkdirSync(join(real, ".agents"), { recursive: true });
  return real;
}

function targetPath(home: string, target: string): string {
  assert(
    target.startsWith("~/.pi/") || target.startsWith("~/.agents/"),
    `Invalid target: ${target}`,
  );
  const path = resolve(home, target.slice(2));
  assert(within(home, path), "Target escapes scratch HOME");
  let parent = dirname(path);
  while (!present(parent)) parent = dirname(parent);
  assert(within(home, realpathSync(parent)), "Target parent symlink escapes scratch HOME");
  return path;
}

function sourcePath(source: string): string {
  const path = resolve(repoRoot, source);
  assert(within(join(repoRoot, "files"), path), "Source escapes files/");
  assert(existsSync(path), `Missing manifest source: ${source}`);
  return path;
}

export function deepMerge(target: Record<string, unknown>, source: Record<string, unknown>) {
  const object = (value: unknown): value is Record<string, unknown> =>
    value !== null && typeof value === "object" && !Array.isArray(value);
  for (const [key, value] of Object.entries(source)) {
    target[key] = object(target[key]) && object(value) ? deepMerge(target[key], value) : value;
  }
  return target;
}

function verifyFiles(source: string, target: string): void {
  if (lstatSync(source).isDirectory()) {
    for (const name of readdirSync(source).filter((name) => !generated.has(name))) {
      verifyFiles(join(source, name), join(target, name));
    }
  } else {
    assert(existsSync(target), `Missing installed file: ${target}`);
    assert.equal(readFileSync(target).compare(readFileSync(source)), 0, `File differs: ${target}`);
  }
}

export function installProfile(home: string, profile = "full", installDependencies = true): string {
  assert(existsSync(join(home, marker)), "prepareHome must establish a disposable HOME first");
  const selected = manifest.profiles[profile];
  assert(selected, `Unknown profile: ${profile}`);
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  mkdirSync(join(home, ".pi-setup-backups"), { recursive: true });
  const backup = mkdtempSync(join(home, ".pi-setup-backups", `${stamp}-`));
  const backupTarget = (path: string) => {
    if (!present(path)) return;
    const saved = join(backup, relative(home, path));
    mkdirSync(dirname(saved), { recursive: true });
    cpSync(path, saved, { recursive: true, dereference: false, verbatimSymlinks: true });
  };
  const copy = (entry: FileEntry, skip: boolean) => {
    const source = sourcePath(entry.source);
    const target = targetPath(home, entry.target);
    if (skip && present(target)) return;
    backupTarget(target);
    // Replacing only managed targets keeps unrelated user files intact.
    if (present(target)) rmSync(target, { recursive: true, force: true });
    mkdirSync(dirname(target), { recursive: true });
    cpSync(source, target, {
      recursive: true,
      filter: (path) => !generated.has(path.split(sep).at(-1)!),
    });
    verifyFiles(source, target);
  };
  for (const name of selected) {
    const component = manifest.components[name];
    assert(component, `Missing component: ${name}`);
    if (component.strategy === "deep-merge") {
      const source = JSON.parse(readFileSync(sourcePath(component.source!), "utf8"));
      const target = targetPath(home, component.target!);
      assert(
        !present(target) || !lstatSync(target).isSymbolicLink(),
        "Settings target cannot be a symlink",
      );
      const existing = existsSync(target) ? JSON.parse(readFileSync(target, "utf8")) : {};
      backupTarget(target);
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, JSON.stringify(deepMerge(existing, source), null, 2) + "\n");
      const installed = JSON.parse(readFileSync(target, "utf8"));
      assert.deepEqual(deepMerge(structuredClone(installed), source), installed);
    } else if (component.strategy === "copy" || component.strategy === "skip-if-exists") {
      for (const entry of component.files ?? [component as FileEntry]) {
        copy(entry, component.strategy === "skip-if-exists");
      }
    } else {
      const extensions = component.strategy === "extension";
      for (const item of (extensions ? component.extensions : component.skills) ?? []) {
        assert(/^[a-z0-9-]+$/.test(item), `Invalid resource name: ${item}`);
        const target = extensions ? `~/.pi/agent/extensions/${item}` : `~/.agents/skills/${item}`;
        copy({ source: `files/${extensions ? "extensions" : "skills"}/${item}`, target }, false);
        const dir = targetPath(home, target);
        if (extensions && installDependencies && existsSync(join(dir, "package.json"))) {
          const result = Bun.spawnSync([process.execPath, "install", "--silent", "--no-save"], {
            cwd: dir,
            env: { ...process.env, HOME: home },
            stdout: "inherit",
            stderr: "inherit",
          });
          assert.equal(result.exitCode, 0, `Dependency installation failed: ${item}`);
          const pkg = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
          for (const dependency of Object.keys({ ...pkg.dependencies, ...pkg.devDependencies })) {
            assert(
              existsSync(join(dir, "node_modules", dependency)),
              `Missing dependency: ${dependency}`,
            );
          }
        }
      }
    }
    for (const link of component.links ?? []) {
      const source = targetPath(home, link.source);
      const target = targetPath(home, link.target);
      assert(existsSync(source), `Missing link source: ${link.source}`);
      if (present(target) && lstatSync(target).isSymbolicLink() && readlinkSync(target) === source)
        continue;
      if (
        present(target) &&
        !lstatSync(target).isDirectory() &&
        !lstatSync(target).isSymbolicLink() &&
        readFileSync(target).equals(readFileSync(source))
      )
        continue;
      backupTarget(target);
      if (present(target)) rmSync(target, { recursive: true, force: true });
      mkdirSync(dirname(target), { recursive: true });
      symlinkSync(source, target);
      assert.equal(realpathSync(target), realpathSync(source));
    }
  }
  return backup;
}

if (import.meta.main) {
  const home = prepareHome(process.argv[2]);
  const profile = process.argv[3] ?? "full";
  mkdirSync(join(home, ".pi-setup-backups"), { recursive: true });
  const backup = installProfile(home, profile);
  console.log(`SMOKE PASS — profile=${profile} HOME=${home} backup=${backup}`);
}
