import { describe, expect, test } from "bun:test";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  fauxAssistantMessage,
  fauxProvider,
  getSystemMessageText,
  type ClassifierContext,
} from "@earendil-works/pi-ai";
import {
  createAgentSession,
  DefaultResourceLoader,
  ModelRuntime,
  SessionManager,
  SettingsManager,
  type ExtensionFactory,
} from "@earendil-works/pi-coding-agent";
import autoTodo from "../../auto-todo/index.ts";
import gate from "../index.ts";
import { model, preflight, reply } from "./helpers.ts";
import { runDirectory } from "../evidence.ts";

describe("real Pi SDK lifecycle with auto-todo", () => {
  for (const [gateFirst, streaming] of [
    [false, false],
    [true, false],
    [false, true],
  ] as const)
    test(`prompt composition and bounded correction (gate first=${gateFirst}, streaming=${streaming})`, async () => {
      const root = await mkdtemp(join(tmpdir(), "jev-sdk-"));
      const savedDir = process.env.PI_AUTO_TODO_DIR;
      const savedGate = process.env.PI_JEV_GATE;
      const savedMode = process.env.PI_JEV_GATE_MODE;
      process.env.PI_AUTO_TODO_DIR = join(root, "runs");
      delete process.env.PI_JEV_GATE;
      delete process.env.PI_JEV_GATE_MODE;
      let session: Awaited<ReturnType<typeof createAgentSession>>["session"] | undefined;
      try {
        const requests: ClassifierContext[] = [];
        const stub: ExtensionFactory = (pi) => {
          pi.on("before_agent_start", (_event, ctx) => {
            ctx.modelRegistry.getAvailableOfType = (async () => [model]) as any;
            ctx.modelRegistry.classify = async (_m, context) => {
              requests.push(context);
              return context.questions.workflow ? preflight() : reply("coverage", 1);
            };
          });
        };
        const compatibleAutoTodo = autoTodo as unknown as ExtensionFactory;
        const settings = SettingsManager.inMemory({
          compaction: { enabled: false },
          retry: { enabled: false },
        });
        const resourceLoader = new DefaultResourceLoader({
          cwd: root,
          agentDir: join(root, "agent"),
          settingsManager: settings,
          noSkills: true,
          noPromptTemplates: true,
          noThemes: true,
          noContextFiles: true,
          systemPrompt: "BASE_INSTRUCTIONS",
          extensionFactories: [
            stub,
            ...(gateFirst ? [gate, compatibleAutoTodo] : [compatibleAutoTodo, gate]),
          ],
        });
        await resourceLoader.reload();
        expect(resourceLoader.getExtensions().errors).toEqual([]);
        const runtime = await ModelRuntime.create({
          authPath: join(root, "auth.json"),
          modelsPath: null,
          modelsStorePath: join(root, "catalog.json"),
          refreshOnCreate: false,
        });
        const faux = fauxProvider({
          provider: "jev-test",
          api: "jev-test-api",
          models: [{ id: "test" }],
          tokensPerSecond: 0,
        });
        runtime.registerNativeProvider(faux.provider);
        const prompts: string[] = [];
        faux.setResponses([
          async (context) => {
            prompts.push(getSystemMessageText(context.messages[0] as any));
            if (streaming) await session!.steer("Also add exponential backoff.");
            return fauxAssistantMessage("Initial result: finished coding, but forgot idempotency.");
          },
          (context) => {
            prompts.push(getSystemMessageText(context.messages[0] as any));
            return fauxAssistantMessage(
              streaming
                ? "Intermediate result: backoff requested, reviewing requirements."
                : "Final result: gap inspected. Unimplemented requirements reported explicitly.",
            );
          },
          ...(streaming
            ? [
                fauxAssistantMessage(
                  "Final result: gap inspected. Unimplemented requirements reported explicitly.",
                ),
              ]
            : []),
        ]);
        const created = await createAgentSession({
          cwd: root,
          agentDir: join(root, "agent"),
          resourceLoader,
          modelRuntime: runtime,
          model: faux.getModel(),
          thinkingLevel: "off",
          noTools: "all",
          settingsManager: settings,
          sessionManager: SessionManager.inMemory(root),
        });
        session = created.session;
        const errors: unknown[] = [];
        await session.bindExtensions({
          onError: (error) => errors.push(error),
        });
        await session.prompt("Add payment retries with idempotency and tests.");
        expect(errors).toEqual([]);
        expect(faux.state.callCount).toBe(streaming ? 3 : 2);
        for (const prompt of prompts) {
          expect(prompt).toContain("BASE_INSTRUCTIONS");
          expect(prompt).toContain("Jev quality checkpoints");
          expect(prompt).toContain("Run artifacts (auto-todo extension)");
        }
        expect(requests.filter((r) => r.state.phase === "done").length).toBe(2);
        if (streaming) {
          expect(String(requests.at(-1)!.state.request)).toContain("exponential backoff");
          expect(String(requests.at(-1)!.state.request)).toContain("idempotency");
        } else
          expect(requests.at(-1)!.state.request).toBe(
            "Add payment retries with idempotency and tests.",
          );
        let dir = runDirectory(prompts[0])!;
        if (streaming) {
          const day = join(root, "runs", (await readdir(join(root, "runs")))[0]);
          for (const child of await readdir(day)) {
            try {
              await readFile(join(day, child, "outcome.md"));
              dir = join(day, child);
              break;
            } catch {
              /* older run has no settlement snapshot */
            }
          }
        }
        const outcome = await readFile(join(dir, "outcome.md"), "utf8");
        expect(outcome).toContain("Final result: gap inspected");
        expect(
          session.sessionManager
            .getBranch()
            .some((e) => e.type === "custom_message" && e.customType === "jev-quality-gate-review"),
        ).toBe(true);
      } finally {
        session?.dispose();
        if (savedDir === undefined) delete process.env.PI_AUTO_TODO_DIR;
        else process.env.PI_AUTO_TODO_DIR = savedDir;
        if (savedGate === undefined) delete process.env.PI_JEV_GATE;
        else process.env.PI_JEV_GATE = savedGate;
        if (savedMode === undefined) delete process.env.PI_JEV_GATE_MODE;
        else process.env.PI_JEV_GATE_MODE = savedMode;
        await rm(root, { recursive: true, force: true });
      }
    }, 15000);
});
