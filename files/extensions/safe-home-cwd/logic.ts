import { chmodSync, lstatSync, mkdirSync, realpathSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { isAbsolute, join, parse, resolve } from "node:path";

export const SAFE_HOME_DIR_NAME = "pi-home-scratch";

const PATH_TOOLS = new Set(["read", "write", "edit", "grep", "find", "ls"]);
const OPTIONAL_PATH_TOOLS = new Set(["grep", "find", "ls"]);

export function isHomeCwd(cwd: string, home = homedir()): boolean {
  try {
    return realpathSync(cwd) === realpathSync(home);
  } catch {
    return resolve(cwd) === resolve(home);
  }
}

export function isRootCwd(cwd: string): boolean {
  const absoluteCwd = resolve(cwd);
  const root = parse(absoluteCwd).root;

  try {
    return realpathSync(absoluteCwd) === realpathSync(root);
  } catch {
    return absoluteCwd === root;
  }
}

export function isProtectedCwd(cwd: string, home = homedir()): boolean {
  return isHomeCwd(cwd, home) || isRootCwd(cwd);
}

export function getSafeHomeCwd(tempRoot = tmpdir()): string {
  return join(tempRoot, SAFE_HOME_DIR_NAME);
}

export function ensureSafeHomeCwd(tempRoot = tmpdir()): string {
  const safeCwd = getSafeHomeCwd(tempRoot);
  mkdirSync(safeCwd, { recursive: true, mode: 0o700 });

  // `mode` is ignored when the directory already exists. Reject symlinks and
  // enforce private permissions before any tool can use this directory.
  if (!lstatSync(safeCwd).isDirectory()) {
    throw new Error(`Safe Pi cwd is not a directory: ${safeCwd}`);
  }
  chmodSync(safeCwd, 0o700);
  return safeCwd;
}

export function resolveSafeToolPath(rawPath: string, safeCwd: string): string {
  const path = rawPath.startsWith("@") ? rawPath.slice(1) : rawPath;

  // Preserve explicitly absolute or tilde-prefixed paths. Only implicit
  // relative paths are redirected to the safe cwd.
  if (isAbsolute(path) || path === "~" || path.startsWith("~/")) return path;
  return resolve(safeCwd, path);
}

export function shellQuote(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

export function redirectBashCommand(command: string, safeCwd: string): string {
  return `cd ${shellQuote(safeCwd)} && ${command}`;
}

export function redirectToolInput(
  toolName: string,
  input: Record<string, unknown>,
  safeCwd: string,
): void {
  if (toolName === "bash") {
    if (typeof input.command === "string") {
      input.command = redirectBashCommand(input.command, safeCwd);
    }
    return;
  }

  if (!PATH_TOOLS.has(toolName)) return;

  if (typeof input.path === "string") {
    input.path = resolveSafeToolPath(input.path, safeCwd);
  } else if (input.path === undefined && OPTIONAL_PATH_TOOLS.has(toolName)) {
    input.path = safeCwd;
  }
}
