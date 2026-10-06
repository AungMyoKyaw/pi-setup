import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type {
  ClassifierApi,
  ClassifierContext,
  ClassifierModel,
  ClassifierResult,
} from "@earendil-works/pi-ai";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import gate from "../index.ts";
import { buildContractBlock } from "../../auto-todo/prompts.ts";

export const model: ClassifierModel<ClassifierApi> = {
  type: "classifier",
  id: "jev-latest",
  provider: "typesafe",
  name: "Jev",
  api: "typesafe-system-one",
  baseUrl: "https://api.typesafe.ai/v1",
  input: ["text"],
  contextWindow: 64000,
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
};
export function reply(issue = "ready", coverage = 2, confidence = 0.95): ClassifierResult {
  return {
    api: "typesafe-system-one",
    provider: "typesafe",
    model: "jev-latest",
    stopReason: "stop",
    timestamp: 0,
    answers: {
      issue: {
        type: "choice",
        choice: issue,
        confidence,
        probabilities: { [issue]: confidence },
      },
      coverage: { type: "score", score: coverage, confidence },
      evidenceSufficient: { type: "bool", probability: 0.95 },
    },
  };
}
export function preflight(workflow = "coding"): ClassifierResult {
  return {
    ...reply(),
    answers: {
      workflow: {
        type: "choice",
        choice: workflow,
        confidence: 0.95,
        probabilities: { [workflow]: 0.95 },
      },
    },
  };
}
export const filledPlan =
  "# PLAN\n\n## Interpretation\nAdd retries, idempotency and tests.\n\n## Approach\n1. Add retries and keys.\n2. Test duplicates and failures.\n";
export async function fixture(
  options: {
    outcomes?: ClassifierResult[];
    available?: boolean;
    mode?: string;
  } = {},
) {
  const root = await mkdtemp(join(tmpdir(), "jev-gate-"));
  const dir = join(root, "run");
  await mkdir(dir);
  await writeFile(join(dir, "PLAN.md"), filledPlan);
  await writeFile(join(dir, "TODO.md"), "- [x] Add retries and idempotency\n- [x] Run tests\n");
  const handlers = new Map<string, (event: any, ctx: any) => any>();
  const tools = new Map<string, any>();
  const commands = new Map<string, any>();
  const audits: any[] = [];
  const requests: ClassifierContext[] = [];
  let outcomeIndex = 0;
  const pi = {
    on: (name: string, handler: any) => {
      handlers.set(name, handler);
      return () => handlers.delete(name);
    },
    registerTool: (tool: any) => tools.set(tool.name, tool),
    registerCommand: (name: string, command: any) => commands.set(name, command),
    appendEntry: (customType: string, data: unknown) => audits.push({ customType, data }),
  } as unknown as ExtensionAPI;
  const ctx = {
    cwd: root,
    hasUI: false,
    mode: "print",
    signal: undefined,
    ui: { setStatus: () => {}, notify: () => {} },
    hasPendingMessages: () => false,
    getSystemPrompt: () => "base prompt" + buildContractBlock(dir),
    modelRegistry: {
      getAvailableOfType: async () => (options.available === false ? [] : [model]),
      classify: async (_model: unknown, context: ClassifierContext) => {
        requests.push(context);
        if (context.questions.workflow) return preflight();
        return options.outcomes?.[outcomeIndex++] ?? reply();
      },
    },
  } as unknown as ExtensionContext;
  const savedMode = process.env.PI_JEV_GATE_MODE;
  const savedEnabled = process.env.PI_JEV_GATE;
  if (options.mode) process.env.PI_JEV_GATE_MODE = options.mode;
  else delete process.env.PI_JEV_GATE_MODE;
  delete process.env.PI_JEV_GATE;
  gate(pi);
  if (savedMode === undefined) delete process.env.PI_JEV_GATE_MODE;
  else process.env.PI_JEV_GATE_MODE = savedMode;
  if (savedEnabled === undefined) delete process.env.PI_JEV_GATE;
  else process.env.PI_JEV_GATE = savedEnabled;
  const emit = (type: string, event: Record<string, any> = {}) =>
    handlers.get(type)?.({ type, ...event }, ctx);
  const start = async (prompt = "Add payment retries with idempotency and tests.") => {
    await emit("input", { source: "interactive", text: prompt });
    return emit("before_agent_start", {
      prompt,
      systemPrompt: ctx.getSystemPrompt(),
    });
  };
  const boundary = (
    text = "Implemented retries and keys. Duplicate-request and failure tests pass.",
  ) => ({
    outcome: "completed",
    entries: [],
    continue: false,
    context: {
      canContinue: true,
      contextMessages: [{ role: "assistant", content: [{ type: "text", text }] }],
      pendingMessages: [],
    },
  });
  return {
    dir,
    pi,
    ctx,
    handlers,
    tools,
    commands,
    audits,
    requests,
    emit,
    start,
    boundary,
    cleanup: () => rm(root, { recursive: true, force: true }),
  };
}
