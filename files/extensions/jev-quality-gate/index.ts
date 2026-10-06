import { createHash } from "node:crypto";
import { Type, StringEnum } from "@earendil-works/pi-ai";
import type { ClassifierContext, ClassifierResult, Usage } from "@earendil-works/pi-ai";
import type {
  ExtensionAPI,
  ExtensionContext,
  AgentBeforeSettleEvent,
  TurnEndEvent,
} from "@earendil-works/pi-coding-agent";
import { MAX_CHECKS, resolveConfig, STATUS_KEY, type Mode } from "./config.ts";
import { artifacts, clip, isRunArtifact, planReady, runDirectory, textOf } from "./evidence.ts";
import { classify } from "./judge.ts";
import { assess, packet, shouldPreflight, type Assessment } from "./policy.ts";
import { GUIDANCE, questions } from "./prompts.ts";

type Phase = "plan" | "done";
interface Check {
  assessment: Assessment;
  usage?: Usage;
  fingerprint: string;
}
interface Run {
  request: string;
  suppliedPlan?: string;
  workflow: string;
  disabled: boolean;
  checks: Record<Phase, number>;
  corrections: Record<Phase, number>;
  cache: Partial<Record<Phase, Check>>;
  observations: string[];
  pendingTools: Map<string, { toolName: string; args: Record<string, unknown> }>;
  turn: number;
  blockedTurn?: number;
  queue: Promise<unknown>;
}

function newRun(request: string): Run {
  return {
    request,
    workflow: "coding",
    disabled: false,
    checks: { plan: 0, done: 0 },
    corrections: { plan: 0, done: 0 },
    cache: {},
    observations: [],
    pendingTools: new Map(),
    turn: 0,
    queue: Promise.resolve(),
  };
}
const unavailable = (): Assessment => ({
  verdict: "unavailable",
  issue: "api",
  message: "Jev unavailable; continue with normal verification. Not a verified pass.",
});

export default function jevQualityGate(pi: ExtensionAPI) {
  const config = resolveConfig();
  let mode: Mode = config.mode;
  let active: Run | undefined;
  let inputSource: string | undefined;
  const queuedInputs: string[] = [];
  let calls = 0;
  let last = "idle";
  const isOff = () => mode === "off";

  function status(ctx: ExtensionContext) {
    if (ctx.hasUI) ctx.ui.setStatus(STATUS_KEY, `Jev ${mode} · ${last} · ${calls} calls`);
  }
  function audit(phase: string, result?: ClassifierResult, assessment?: Assessment) {
    pi.appendEntry("jev-quality-gate", {
      phase,
      verdict: assessment?.verdict,
      issue: assessment?.issue,
      provider: result?.provider,
      model: result?.model,
      usage: result?.usage,
      stopReason: result?.stopReason ?? "unavailable",
    });
  }

  // Serialize checkpoints, including sibling nested edit calls inside codemode.
  function checkpoint(
    run: Run,
    phase: Phase,
    ctx: ExtensionContext,
    suppliedEvidence = "",
    suppliedPlan = "",
    signal: AbortSignal | undefined = ctx.signal,
  ): Promise<Check> {
    const task = async (): Promise<Check> => {
      const documents = await artifacts(runDirectory(ctx.getSystemPrompt()));
      const state: ClassifierContext["state"] = {
        request: clip(run.request, 8_000),
        plan:
          suppliedPlan || run.suppliedPlan
            ? clip(suppliedPlan || run.suppliedPlan!)
            : documents.plan,
        todo: documents.todo,
        observations: run.observations.slice(-12).map((s) => clip(s, 2_000)),
        suppliedEvidence: clip(suppliedEvidence, 4_000),
        phase,
        evidenceLimits:
          "Tool output may be truncated; only supplied observations are available. Do not assume unseen code is correct.",
      };
      const fingerprint = createHash("sha256").update(JSON.stringify(state)).digest("hex");
      if (run.disabled || isOff() || signal?.aborted || (phase === "done" && mode !== "full")) {
        return { assessment: unavailable(), fingerprint };
      }
      const cached = run.cache[phase];
      if (cached?.fingerprint === fingerprint) return { ...cached, usage: undefined };
      if (run.checks[phase] >= MAX_CHECKS)
        return {
          assessment: {
            verdict: "uncertain",
            issue: "budget",
            message:
              "Checkpoint budget reached; inspect remaining gaps normally and report unresolved limitations.",
          },
          fingerprint,
        };
      run.checks[phase] += 1; // Reserve before awaits, even on errors.
      const result = await classify(ctx, config, { state, questions: questions(phase) }, signal);
      calls += 1;
      if (signal?.aborted || ctx.signal?.aborted) return { assessment: unavailable(), fingerprint };
      const assessment = result ? assess(result, config.threshold) : unavailable();
      const value = { assessment, fingerprint, usage: result?.usage };
      if (active === run) {
        run.cache[phase] = value;
        if (assessment.verdict === "unavailable") run.disabled = true;
        last = `${phase}: ${assessment.verdict}`;
        audit(phase, result, assessment);
        status(ctx);
      }
      return value;
    };
    const result = run.queue.then(task);
    run.queue = result.catch(() => undefined);
    return result;
  }

  function correction(run: Run, phase: Phase, check: Check): string | undefined {
    if (
      check.assessment.verdict === "pass" ||
      check.assessment.verdict === "unavailable" ||
      check.assessment.issue === "budget" ||
      run.corrections[phase] >= 1
    )
      return;
    run.corrections[phase] += 1;
    return (
      packet(phase, check.assessment) +
      "\nMake one focused evidence-based correction. Recheck at most once. Never fabricate a missing requirement from this verdict."
    );
  }

  pi.on("input", (event) => {
    inputSource = event.source;
    if (event.source !== "extension" && event.streamingBehavior) {
      queuedInputs.push(event.text);
      if (queuedInputs.length > 32) queuedInputs.shift();
    }
    return { action: "continue" };
  });

  // Streaming steer/follow-up messages can arrive without before_agent_start.
  // Update scope only when Pi actually delivers the queued user message.
  pi.on("message_start", (event) => {
    if (event.message.role !== "user") return;
    const text = textOf(event.message.content);
    const queued = queuedInputs.indexOf(text);
    if (queued < 0) return;
    queuedInputs.splice(queued, 1);
    if (active?.request === text) return; // Already initialized by before_agent_start.
    if (isOff() || !shouldPreflight(text)) {
      active = undefined;
      return;
    }
    const previous = active;
    const run = newRun(
      previous ? previous.request + "\\n\\nAdditional user request:\\n" + text : text,
    );
    if (previous) run.observations = [...previous.observations];
    active = run;
    last = "updated request";
  });

  pi.on("before_agent_start", async (event, ctx) => {
    const source = inputSource;
    inputSource = undefined;
    active = undefined; // A new user request never inherits old budgets or evidence.
    if (mode === "off" || !shouldPreflight(event.prompt, source)) {
      last = "skipped";
      status(ctx);
      return;
    }
    const run = newRun(event.prompt);
    active = run;
    const result = await classify(ctx, config, {
      state: { request: clip(event.prompt, 8_000) },
      questions: questions("preflight"),
    });
    calls += 1;
    if (active !== run || isOff() || ctx.signal?.aborted) return;
    const workflow = result?.stopReason === "stop" ? result.answers.workflow : undefined;
    if (!result || result.stopReason !== "stop") run.disabled = true;
    else if (
      workflow?.type === "choice" &&
      ["coding", "analysis", "trivial"].includes(workflow.choice) &&
      workflow.confidence >= config.threshold &&
      (workflow.probabilities[workflow.choice] ?? 0) >= config.threshold
    ) {
      run.workflow = workflow.choice;
    }
    last = run.disabled ? "unavailable" : run.workflow;
    audit("preflight", result);
    status(ctx);
    if (run.workflow === "trivial") {
      active = undefined;
      return;
    }
    // auto-todo returns a forced full prompt. Append the CURRENT rendered prompt
    // so neither extension loses instructions, regardless of registration order.
    return { systemPrompt: event.systemPrompt + GUIDANCE };
  });

  pi.registerTool({
    name: "jev_check",
    label: "Jev checkpoint",
    description:
      "Check a drafted plan or completed coding task with Jev. Uses the actual user request, auto-todo PLAN/TODO and observed tool results. Supply additional real verification evidence when needed. Verdicts are advisory, not proof.",
    promptGuidelines: [
      "Call jev_check with phase=plan before project changes, and phase=done after validation. Correct one flagged gap; do not loop.",
    ],
    parameters: Type.Object({
      phase: StringEnum(["plan", "done"] as const),
      plan: Type.Optional(Type.String({ description: "Plan text if auto-todo is not active." })),
      evidence: Type.Optional(
        Type.String({
          description: "Actual verification commands and outputs; do not fabricate success.",
        }),
      ),
    }),
    async execute(_id, params, signal, _onUpdate, ctx) {
      const run = active;
      if (!run || mode === "off")
        return {
          content: [
            {
              type: "text",
              text: "Jev checkpoint skipped: no active substantive request or mode=off.",
            },
          ],
          details: { verdict: "unavailable" },
        };
      try {
        if (params.plan) run.suppliedPlan = params.plan;
        const check = await checkpoint(
          run,
          params.phase,
          ctx,
          params.evidence,
          params.plan,
          signal,
        );
        const instruction = active === run ? correction(run, params.phase, check) : undefined;
        return {
          content: [
            {
              type: "text",
              text: instruction ?? packet(params.phase, check.assessment),
            },
          ],
          details: { phase: params.phase, ...check.assessment },
          usage: check.usage,
        };
      } catch {
        return {
          content: [{ type: "text", text: unavailable().message }],
          details: unavailable(),
        };
      }
    },
  });

  // Both direct and nested edit/write calls are intercepted by Pi. Shell
  // mutations cannot be detected reliably; guidance requests a manual plan check.
  pi.on("turn_start", (event) => {
    if (active) active.turn = event.turnIndex;
  });
  pi.on("tool_call", async (event, ctx) => {
    const run = active;
    if (
      !run ||
      run.disabled ||
      run.workflow !== "coding" ||
      mode === "off" ||
      !["edit", "write"].includes(event.toolName)
    )
      return;
    const path = "path" in event.input ? event.input.path : undefined;
    if (
      typeof path !== "string" ||
      (await isRunArtifact(path, runDirectory(ctx.getSystemPrompt()), ctx.cwd))
    )
      return;
    try {
      const check = await checkpoint(run, "plan", ctx);
      if (active !== run || isOff()) return;
      if (
        run.blockedTurn === run.turn &&
        check.assessment.verdict !== "pass" &&
        check.assessment.verdict !== "unavailable"
      )
        return { block: true, reason: packet("plan", check.assessment) };
      const reason = correction(run, "plan", check);
      if (reason) {
        run.blockedTurn = run.turn;
        return { block: true, reason };
      }
    } catch {
      run.disabled = true; // A handler exception would block tools in Pi; swallow it.
      last = "unavailable";
      status(ctx);
    }
  });

  // Collect nested and direct results without storing full file contents or
  // binary blocks. Keep command output and diff/result observations bounded.
  pi.on("tool_execution_start", (event) => {
    if (active && event.args && typeof event.args === "object") {
      active.pendingTools.set(event.toolCallId, {
        toolName: event.toolName,
        args: event.args,
      });
    }
  });
  pi.on("tool_execution_end", (event) => {
    const run = active;
    if (!run) return;
    const pending = run.pendingTools.get(event.toolCallId);
    run.pendingTools.delete(event.toolCallId);
    if (!pending || event.toolName === "jev_check" || event.toolName === "codemode") return;
    const output =
      event.result && typeof event.result === "object" && "content" in event.result
        ? textOf(event.result.content)
        : "";
    const args = pending.args;
    const input =
      typeof args.command === "string"
        ? ` command=${clip(args.command, 600)}`
        : typeof args.path === "string"
          ? ` path=${args.path}`
          : "";
    const details =
      event.result && typeof event.result === "object" ? event.result.details : undefined;
    const changes =
      event.toolName === "write" && typeof args.content === "string"
        ? args.content
        : event.toolName === "edit" && typeof details?.diff === "string"
          ? details.diff
          : "";
    run.observations.push(
      clip(
        `${event.toolName}${input} isError=${event.isError}\n${output}${changes ? "\nChanged text:\n" + clip(changes, 2_000) : ""}`,
        3_000,
      ),
    );
    if (run.observations.length > 24) run.observations.shift();
  });

  async function boundary(
    event: TurnEndEvent | AgentBeforeSettleEvent,
    ctx: ExtensionContext,
    phase: Phase,
  ) {
    const run = active;
    if (
      !run ||
      run.disabled ||
      run.workflow !== "coding" ||
      mode === "off" ||
      (phase === "done" && mode !== "full") ||
      event.outcome !== "completed" ||
      event.continue ||
      ctx.hasPendingMessages()
    )
      return;
    if (phase === "plan") {
      // Do not rejudge after every tool result. Initial plan check only.
      if (run.checks.plan > 0) return;
      const documents = await artifacts(runDirectory(ctx.getSystemPrompt()));
      if (!planReady(documents.plan)) return;
    }
    const messages = event.context.contextMessages;
    const assistant = [...messages].reverse().find((m) => m.role === "assistant");
    // The final assistant text is supplemental, never the sole completion evidence.
    const evidence = assistant && "content" in assistant ? textOf(assistant.content) : "";
    const check = await checkpoint(run, phase, ctx, phase === "done" ? evidence : "");
    if (active !== run || isOff() || ctx.signal?.aborted) return;
    const content = correction(run, phase, check);
    if (!content) return;
    return {
      entries: [
        ...event.entries,
        {
          type: "custom_message" as const,
          customType: "jev-quality-gate-review",
          content,
          display: false,
          details: { phase, ...check.assessment },
        },
      ],
      continue: true,
    };
  }

  pi.on("turn_end", async (event, ctx) => {
    try {
      return await boundary(event, ctx, "plan");
    } catch {
      last = "unavailable";
      status(ctx);
    }
  });
  pi.on("agent_before_settle", async (event, ctx) => {
    try {
      return await boundary(event, ctx, "done");
    } catch {
      last = "unavailable";
      status(ctx);
    }
  });

  pi.on("session_start", (_event, ctx) => {
    active = undefined;
    queuedInputs.length = 0;
    calls = 0;
    last = "idle";
    status(ctx);
  });
  pi.on("session_tree", () => {
    active = undefined;
    queuedInputs.length = 0;
    last = "idle";
  });
  pi.on("session_shutdown", (_event, ctx) => {
    active = undefined;
    if (ctx.hasUI) ctx.ui.setStatus(STATUS_KEY, undefined);
  });

  pi.registerCommand("jev-gate", {
    description: "Jev gate status or mode: /jev-gate [status|on|off|plan]",
    handler: async (args, ctx) => {
      const command = args.trim() || "status";
      if (command === "off") mode = "off";
      else if (command === "on" || command === "full") mode = "full";
      else if (command === "plan" || command === "plan-only") mode = "plan-only";
      else if (command !== "status") {
        if (ctx.hasUI) ctx.ui.notify("Usage: /jev-gate [status|on|off|plan]", "warning");
        return;
      }
      status(ctx);
      const report = `Jev mode=${mode}; last=${last}; calls=${calls}; provider=${config.provider ?? "auto"}; model=${config.modelId ?? "auto"}; plan=${active?.checks.plan ?? 0}/2; done=${active?.checks.done ?? 0}/2`;
      if (ctx.hasUI) ctx.ui.notify(report, "info");
      else console.error(report);
    },
  });
}
