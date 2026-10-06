import { open, realpath } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";

export function clip(value: string, max = 12_000): string {
  if (value.length <= max) return value;
  const half = Math.floor((max - 40) / 2);
  return value.slice(0, half) + "\n... [middle truncated] ...\n" + value.slice(-half);
}

export function textOf(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .filter((p) => p?.type === "text" && typeof p.text === "string")
    .map((p) => p.text)
    .join("\n");
}

// Match the generated auto-todo contract, not arbitrary mentions of PLAN.md.
export function runDirectory(prompt: string): string | undefined {
  const start = prompt.lastIndexOf("## Run artifacts (auto-todo extension)");
  if (start < 0) return undefined;
  const match = prompt.slice(start).match(/- `([^`\n]+\/PLAN\.md)` — design doc/);
  return match && isAbsolute(match[1]) ? dirname(match[1]) : undefined;
}

export async function isRunArtifact(
  path: string,
  runDir: string | undefined,
  cwd: string,
): Promise<boolean> {
  if (!runDir) return false;
  let target = resolve(cwd, path);
  let root = resolve(runDir);
  // Resolve symlinks when files exist, and parent symlinks for new files.
  try {
    target = await realpath(target);
  } catch {
    try {
      target = join(await realpath(dirname(target)), target.split("/").at(-1)!);
    } catch {
      /* lexical fallback */
    }
  }
  try {
    root = await realpath(root);
  } catch {
    /* lexical fallback */
  }
  const rel = relative(root, target);
  return !!rel && !rel.startsWith("..") && !isAbsolute(rel);
}

export async function readBounded(path: string): Promise<string> {
  let file;
  try {
    file = await open(path, "r");
    const stat = await file.stat();
    if (!stat.isFile()) return "(not a regular file)";
    const buffer = Buffer.alloc(Math.min(stat.size, 24_000));
    const { bytesRead } = await file.read(buffer, 0, buffer.length, 0);
    return (
      buffer.subarray(0, bytesRead).toString("utf8") +
      (stat.size > buffer.length ? "\n[file truncated]" : "")
    );
  } catch {
    return "(missing or unreadable)";
  } finally {
    await file?.close();
  }
}

export async function artifacts(runDir?: string): Promise<{ plan: string; todo: string }> {
  if (!runDir) return { plan: "(auto-todo not active)", todo: "(auto-todo not active)" };
  const [plan, todo] = await Promise.all([
    readBounded(join(runDir, "PLAN.md")),
    readBounded(join(runDir, "TODO.md")),
  ]);
  return { plan: clip(plan), todo: clip(todo) };
}

export function planReady(plan: string): boolean {
  const withoutComments = plan.replace(/<!--[\s\S]*?-->/g, "").trim();
  const interpretation = withoutComments
    .match(/## Interpretation\s+([\s\S]*?)(?=\n## |$)/)?.[1]
    ?.trim();
  const approach = withoutComments.match(/## Approach\s+([\s\S]*?)(?=\n## |$)/)?.[1]?.trim();
  return !!interpretation && !!approach && /\d+\./.test(approach);
}
