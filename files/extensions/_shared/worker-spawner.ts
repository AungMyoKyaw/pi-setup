// Shared worker spawner + agent discovery for pi extensions.
//
// Used by:
//   - parallel-tools (runSubagentItem wraps runAgentWorker to add the agent
//     name field used by parallel_subagent's per-item output schema)
//   - teams (team_run claims tasks from disk and dispatches each one via
//     runAgentWorker)
//
// API:
//   - runAgentWorker({ agent, task, cwd, signal, model, thinkingLevel })
//     spawns `pi --mode json -p --no-session` with the agent's system prompt
//     appended. Returns the final assistant text + usage metadata.
//   - discoverAgents(cwd, scope) returns all agents visible from cwd.
//   - AgentDef is the in-memory agent shape (name, description, tools,
//     model, systemPrompt, source, filePath).
//
// No pi imports — pure Node + child_process so any extension can use it.

import { spawn } from "node:child_process";
import * as fs from "node:fs/promises";
import { existsSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import * as path from "node:path";

export interface AgentDef {
  name: string;
  description: string;
  tools?: string[];
  model?: string;
  systemPrompt: string;
  source: "user" | "project";
  filePath: string;
}

export interface WorkerSpawnInput {
  agent: AgentDef;
  task: string;
  cwd?: string;
  signal: AbortSignal;
  model?: { provider: string; id: string };
  thinkingLevel?: string;
}

export interface WorkerSpawnOutput {
  output: string;
  exitCode: number;
  stopReason?: string;
  errorMessage?: string;
  durationMs: number;
  costUsd?: number;
}

// ---------- agent discovery ----------

function parseFrontmatterSimple(content: string): {
  frontmatter: Record<string, unknown>;
  body: string;
} {
  const m = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!m) return { frontmatter: {}, body: content };
  const yamlText = m[1];
  const body = m[2];
  const out: Record<string, unknown> = {};
  for (const line of yamlText.split("\n")) {
    const colon = line.indexOf(":");
    if (colon === -1) continue;
    const key = line.slice(0, colon).trim();
    let value: unknown = line.slice(colon + 1).trim();
    if (typeof value === "string") {
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
    }
    out[key] = value;
  }
  return { frontmatter: out, body };
}

async function loadAgentsFromDir(
  dir: string,
  source: "user" | "project",
): Promise<AgentDef[]> {
  const agents: AgentDef[] = [];
  if (!existsSync(dir)) return agents;
  let entries: import("node:fs").Dirent[];
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return agents;
  }
  for (const entry of entries) {
    if (!entry.name.endsWith(".md")) continue;
    if (!entry.isFile() && !entry.isSymbolicLink()) continue;
    const filePath = path.join(dir, entry.name);
    let content: string;
    try {
      content = await fs.readFile(filePath, "utf-8");
    } catch {
      continue;
    }
    const { frontmatter, body } = parseFrontmatterSimple(content);
    if (
      typeof frontmatter.name !== "string" ||
      typeof frontmatter.description !== "string"
    )
      continue;
    const toolsRaw = frontmatter.tools;
    const tools =
      typeof toolsRaw === "string"
        ? toolsRaw
            .split(",")
            .map((t) => t.trim())
            .filter(Boolean)
        : Array.isArray(toolsRaw)
          ? toolsRaw.filter((t): t is string => typeof t === "string")
          : undefined;
    agents.push({
      name: frontmatter.name,
      description: frontmatter.description,
      tools: tools && tools.length > 0 ? tools : undefined,
      model:
        typeof frontmatter.model === "string" ? frontmatter.model : undefined,
      systemPrompt: body,
      source,
      filePath,
    });
  }
  return agents;
}

async function findNearestProjectAgentsDir(
  cwd: string,
): Promise<string | null> {
  let current = cwd;
  while (true) {
    const candidate = path.join(current, ".pi", "agents");
    try {
      const st = await fs.stat(candidate);
      if (st.isDirectory()) return candidate;
    } catch {}
    const parent = path.join(current, "..");
    if (parent === current) return null;
    current = parent;
  }
}

export async function discoverAgents(
  cwd: string,
  scope: "user" | "project" | "both" = "user",
): Promise<{ agents: AgentDef[]; agentsDir: string }> {
  const userDir = path.join(homedir(), ".pi", "agent", "agents");
  const projectDir = await findNearestProjectAgentsDir(cwd);

  const userAgents =
    scope === "project" ? [] : await loadAgentsFromDir(userDir, "user");
  const projectAgents =
    scope === "user" || !projectDir
      ? []
      : await loadAgentsFromDir(projectDir, "project");

  // Project agents override user agents with the same name.
  const map = new Map<string, AgentDef>();
  if (scope === "both" || scope === "user") {
    for (const a of userAgents) map.set(a.name, a);
  }
  if (scope === "both" || scope === "project") {
    for (const a of projectAgents) map.set(a.name, a);
  }
  return { agents: Array.from(map.values()), agentsDir: userDir };
}

// ---------- subprocess invocation ----------

function resolvePiInvocation(): { command: string; baseArgs: string[] } {
  const currentScript = process.argv[1];
  const isBunVirtualScript = currentScript?.startsWith("/$bunfs/root/");
  if (currentScript && !isBunVirtualScript && existsSync(currentScript)) {
    return { command: process.execPath, baseArgs: [currentScript] };
  }
  const execName = process.execPath.split("/").pop()?.toLowerCase() ?? "";
  if (/^(node|bun)(\.exe)?$/.test(execName)) {
    return { command: "pi", baseArgs: [] };
  }
  return { command: process.execPath, baseArgs: [] };
}

export async function runAgentWorker(
  input: WorkerSpawnInput,
): Promise<WorkerSpawnOutput> {
  const { agent, task, cwd, signal, model, thinkingLevel } = input;
  const args: string[] = ["--mode", "json", "-p", "--no-session"];
  const useModel =
    agent.model ?? (model ? `${model.provider}/${model.id}` : undefined);
  if (useModel) args.push("--model", useModel);
  if (!agent.model && thinkingLevel) args.push("--thinking", thinkingLevel);
  if (agent.tools && agent.tools.length > 0)
    args.push("--tools", agent.tools.join(","));

  let tmpPromptPath: string | null = null;
  if (agent.systemPrompt.trim()) {
    const tmpDir = await fs.mkdtemp(path.join(tmpdir(), "pi-shared-worker-"));
    const safeName = agent.name.replace(/[^\w.-]+/g, "_");
    tmpPromptPath = path.join(tmpDir, `prompt-${safeName}.md`);
    await fs.writeFile(tmpPromptPath, agent.systemPrompt, {
      encoding: "utf-8",
      mode: 0o600,
    });
    args.push("--append-system-prompt", tmpPromptPath);
  }
  args.push(`Task: ${task}`);

  const inv = resolvePiInvocation();
  const startedAt = Date.now();

  const cleanup = () => {
    if (tmpPromptPath) fs.unlink(tmpPromptPath).catch(() => {});
  };

  return new Promise<WorkerSpawnOutput>((resolve) => {
    let proc: ReturnType<typeof spawn>;
    try {
      proc = spawn(inv.command, [...inv.baseArgs, ...args], {
        cwd: cwd ?? process.cwd(),
        shell: false,
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch (e) {
      cleanup();
      resolve({
        output: "",
        exitCode: 1,
        errorMessage: `spawn failed: ${(e as Error).message}`,
        durationMs: Date.now() - startedAt,
      });
      return;
    }

    let buffer = "";
    let stderrBuf = "";
    const messages: Array<{
      role: string;
      content?: Array<{ type: string; text?: string }>;
      stopReason?: string;
      errorMessage?: string;
    }> = [];
    let costUsd: number | undefined;

    const kill = () => {
      try {
        proc.kill("SIGTERM");
      } catch {}
      setTimeout(() => {
        try {
          if (!proc.killed) proc.kill("SIGKILL");
        } catch {}
      }, 5000);
    };
    const onAbort = () => kill();
    if (signal.aborted) kill();
    else signal.addEventListener("abort", onAbort, { once: true });

    proc.stdout.on("data", (c: Buffer) => {
      buffer += c.toString("utf8");
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.trim()) continue;
        let evt: any;
        try {
          evt = JSON.parse(line);
        } catch {
          continue;
        }
        if (evt.type === "message_end" && evt.message) {
          messages.push(evt.message);
        }
        if (evt.type === "tool_result_end" && evt.message) {
          messages.push(evt.message);
        }
        if (evt.type === "agent_end" && typeof evt.cost === "number") {
          costUsd = evt.cost;
        }
      }
    });

    proc.stderr.on("data", (c: Buffer) => {
      stderrBuf += c.toString("utf8");
    });

    proc.on("close", (code) => {
      signal.removeEventListener("abort", onAbort);
      cleanup();
      let output = "";
      let stopReason: string | undefined;
      let errorMessage: string | undefined;
      for (let i = messages.length - 1; i >= 0; i--) {
        const msg = messages[i];
        if (msg.role === "assistant") {
          stopReason = msg.stopReason;
          errorMessage = msg.errorMessage;
          for (const part of msg.content ?? []) {
            if (part.type === "text" && part.text) {
              output = part.text;
              break;
            }
          }
          if (output) break;
        }
      }
      resolve({
        output,
        exitCode: code ?? 0,
        stopReason,
        errorMessage:
          errorMessage ||
          (code !== 0 ? `exit ${code}` : undefined) ||
          (stderrBuf ? stderrBuf.slice(0, 500) : undefined),
        durationMs: Date.now() - startedAt,
        costUsd,
      });
    });

    proc.on("error", (e) => {
      signal.removeEventListener("abort", onAbort);
      cleanup();
      resolve({
        output: "",
        exitCode: 1,
        errorMessage: `proc error: ${e.message}`,
        durationMs: Date.now() - startedAt,
      });
    });
  });
}
