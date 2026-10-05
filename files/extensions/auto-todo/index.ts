/**
 * auto-todo — pi extension
 *
 * For every user message that passes the trigger filter, this extension:
 *
 *   1. Creates a run folder at `${PI_AUTO_TODO_DIR | ~/.agents/runs}/<date>/<id>/`
 *   2. Seeds `TODO.md` and `PLAN.md` with empty scaffolds (idempotent —
 *      re-submissions reuse the same folder)
 *   3. Injects a contract block into the system prompt via
 *      `before_agent_start` so the agent knows to fill the files first
 *   4. Writes `outcome.md` at `agent_settled` with a snapshot of the
 *      final TODO state and the last assistant message
 *   5. Exposes `/todo` and `/plan` slash commands to inspect the active
 *      run's files from inside pi
 *
 * Disable: PI_AUTO_TODO=0
 * Override base dir: PI_AUTO_TODO_DIR=/some/path
 * Disable outcome.md: PI_AUTO_TODO_OUTCOME=0
 *
 * No external deps; uses node:fs/promises, node:path, node:os.
 */

import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { displayHeader, runDir } from "./run-id.ts";
import { shouldTrigger } from "./trigger.ts";
import { buildContractBlock } from "./prompts.ts";
import { renderOutcomeMd, renderPlanMd, renderTodoMd } from "./templates.ts";

/** How much of the user's request to inline into the seeded TODO/PLAN.
 *  Long pastes blow up the file; 400 chars is enough for a one-screen
 *  context preview and stays under typical agent tool-output truncation. */
const REQUEST_PREVIEW_LIMIT = 400;

/** How much of the last assistant message to snapshot into outcome.md.
 *  Same reason as REQUEST_PREVIEW_LIMIT. */
const ASSISTANT_SNIPPET_LIMIT = 600;

/** Notification helper that no-ops safely when ctx.ui isn't there (RPC / JSON / print modes). */
function notify(
  ctx:
    | {
        hasUI: boolean;
        ui: {
          notify: (msg: string, level?: "info" | "warning" | "error") => void;
        };
      }
    | undefined,
  msg: string,
  level: "info" | "warning" | "error" = "info",
): void {
  if (!ctx?.hasUI) return;
  try {
    ctx.ui.notify(msg, level);
  } catch {
    // A failing notify must never crash the agent.
  }
}

/** Trim to a single-line preview if short, else multi-line slice with ellipsis. */
function previewRequest(text: string): string {
  const trimmed = text.trim();
  if (trimmed.length <= REQUEST_PREVIEW_LIMIT) return trimmed;
  return trimmed.slice(0, REQUEST_PREVIEW_LIMIT) + "\n... (truncated)";
}

/** Multi-line snippet of assistant text for outcome.md. */
function snippet(text: string, max: number): string {
  const trimmed = text.trim();
  if (trimmed.length <= max) return trimmed;
  return trimmed.slice(0, max) + "\n... (truncated)";
}

interface AssistantMessage {
  role: string;
  content: string | Array<{ type?: string; text?: string }>;
}

interface BranchEntry {
  type: string;
  message?: AssistantMessage;
}

/** Best-effort: pull the last assistant message text from the active branch.
 *  Returns "" on any failure (RPC, missing message, non-text content). */
function lastAssistantText(branch: BranchEntry[]): string {
  for (let i = branch.length - 1; i >= 0; i--) {
    const e = branch[i];
    if (e?.type !== "message" || !e.message) continue;
    if (e.message.role !== "assistant") continue;
    const c = e.message.content;
    if (typeof c === "string") return c;
    if (Array.isArray(c)) {
      return c
        .filter(
          (p): p is { type: string; text: string } =>
            !!p && typeof p === "object" && p.type === "text" && typeof p.text === "string",
        )
        .map((p) => p.text)
        .join("\n")
        .trim();
    }
  }
  return "";
}

export default function autoTodoExtension(pi: ExtensionAPI) {
  // ── hard kill switch ────────────────────────────────────────────────────
  if (process.env.PI_AUTO_TODO === "0") return;

  // ── per-session active-run state ───────────────────────────────────────
  // Cleared on every new `input` event. Used by `before_agent_start` to
  // know which folder's contract to inject, and by `agent_settled` to
  // know which folder's outcome.md to write.
  let activeRunDir: string | null = null;
  let activeHeader: string | null = null;
  let activeRequest: string | null = null;

  // ── Hook 1: input ───────────────────────────────────────────────────────
  // Fires when a user message is submitted. We create the run folder +
  // seed TODO/PLAN. We do NOT inject the contract here — that's the
  // `before_agent_start` hook's job, because the input transform returns
  // user-visible text and we don't want to perturb the user's input.
  pi.on("input", async (event, ctx) => {
    if (!shouldTrigger(event)) return { action: "continue" as const };

    const text = event.text ?? "";
    const ts = Date.now();
    const dir = runDir(text, ts);

    try {
      await mkdir(dir, { recursive: true });

      const todoPath = join(dir, "TODO.md");
      const planPath = join(dir, "PLAN.md");

      const header = displayHeader(text, ts);
      const args = {
        header,
        runDir: dir,
        request: previewRequest(text),
      };

      // Idempotent: never overwrite. Re-submission of the same prompt in
      // the same ms produces the same id → same folder → these checks
      // short-circuit, the agent inherits the previously-populated files.
      if (!existsSync(todoPath)) {
        await writeFile(todoPath, renderTodoMd(args), "utf8");
      }
      if (!existsSync(planPath)) {
        await writeFile(planPath, renderPlanMd(args), "utf8");
      }

      activeRunDir = dir;
      activeHeader = header;
      activeRequest = text;
    } catch (err) {
      // Filesystem errors must never block the agent loop. Log to
      // stderr (visible in --mode=json and CLI runs) and notify the user
      // once so a broken deploy doesn't fail silently.
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[auto-todo] failed to scaffold run dir: ${message}`);
      notify(ctx, `auto-todo: scaffold failed (${message}); agent will still run`, "warning");
      activeRunDir = null;
      activeHeader = null;
      activeRequest = null;
    }

    return { action: "continue" as const };
  });

  // ── Hook 2: before_agent_start ─────────────────────────────────────────
  // Inject the contract block telling the model where the files live and
  // what to do with them. Only fires when we have an active run from the
  // `input` hook — empty during pure slash-command flows, resumed
  // sessions before any user input, etc.
  pi.on("before_agent_start", async (event) => {
    if (!activeRunDir) return;
    return {
      systemPrompt: event.systemPrompt + buildContractBlock(activeRunDir),
    };
  });

  // ── Hook 3: agent_settled ──────────────────────────────────────────────
  // Fires when pi is fully idle (no queued retries, compaction, follow-ups).
  // Snapshot the final TODO state and last assistant text into outcome.md.
  // Skippable via PI_AUTO_TODO_OUTCOME=0 for users who want to keep the
  // run folder to TODO/PLAN only.
  pi.on("agent_settled", async (_event, ctx) => {
    if (!activeRunDir || !activeHeader || !activeRequest) return;
    if (process.env.PI_AUTO_TODO_OUTCOME === "0") return;

    try {
      const todoPath = join(activeRunDir, "TODO.md");
      const todoSnapshot = existsSync(todoPath)
        ? await readFile(todoPath, "utf8")
        : "(missing — agent never wrote TODO.md)";

      let assistantText = "";
      try {
        const branch = ctx.sessionManager.getBranch() as BranchEntry[];
        assistantText = lastAssistantText(branch);
      } catch {
        // Branch read can fail in some RPC / JSON modes. outcome.md just
        // gets an empty snippet — better than blocking the agent.
      }

      const args = {
        header: activeHeader,
        runDir: activeRunDir,
        request: previewRequest(activeRequest),
        todoSnapshot,
        assistantSnippet: snippet(assistantText, ASSISTANT_SNIPPET_LIMIT),
        status: "settled" as const,
      };

      await writeFile(join(activeRunDir, "outcome.md"), renderOutcomeMd(args), "utf8");
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[auto-todo] failed to write outcome.md: ${message}`);
    }
  });

  // ── /todo: show the active run's TODO.md ────────────────────────────────
  pi.registerCommand("todo", {
    description: "Show the active run's TODO.md",
    handler: async (_args, ctx) => {
      if (!activeRunDir) {
        notify(ctx, "auto-todo: no active run", "warning");
        return;
      }
      const p = join(activeRunDir, "TODO.md");
      if (!existsSync(p)) {
        notify(ctx, `auto-todo: TODO.md not found at ${p}`, "warning");
        return;
      }
      try {
        const content = await readFile(p, "utf8");
        // Print to a notification. For TUI users wanting full content /
        // scroll, they can `cat` it. We don't open the editor — that
        // would invite the user to manually edit TODO.md while the
        // agent is mid-flight, which leads to conflicting writes.
        const header = `TODO.md — ${p}  (${content.length} chars)`;
        const preview =
          content.length > 800 ? content.slice(0, 800) + "\n... (truncated)" : content;
        notify(ctx, `${header}\n\n${preview}`, "info");
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        notify(ctx, `auto-todo: read failed (${message})`, "error");
      }
    },
  });

  // ── /plan: show the active run's PLAN.md ────────────────────────────────
  pi.registerCommand("plan", {
    description: "Show the active run's PLAN.md",
    handler: async (_args, ctx) => {
      if (!activeRunDir) {
        notify(ctx, "auto-todo: no active run", "warning");
        return;
      }
      const p = join(activeRunDir, "PLAN.md");
      if (!existsSync(p)) {
        notify(ctx, `auto-todo: PLAN.md not found at ${p}`, "warning");
        return;
      }
      try {
        const content = await readFile(p, "utf8");
        const header = `PLAN.md — ${p}  (${content.length} chars)`;
        const preview =
          content.length > 800 ? content.slice(0, 800) + "\n... (truncated)" : content;
        notify(ctx, `${header}\n\n${preview}`, "info");
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        notify(ctx, `auto-todo: read failed (${message})`, "error");
      }
    },
  });
}
