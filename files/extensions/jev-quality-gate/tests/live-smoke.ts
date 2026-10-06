// Opt-in: uses the current Pi credentials and sends only synthetic fixtures.
// Run with: bun run test:live
import assert from "node:assert/strict";
import { homedir } from "node:os";
import { join } from "node:path";
import {
  ModelRegistry,
  ModelRuntime,
  type ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { resolveConfig } from "../config.ts";
import { classify } from "../judge.ts";
import { assess } from "../policy.ts";
import { questions } from "../prompts.ts";

const agentDir = process.env.PI_CODING_AGENT_DIR ?? join(homedir(), ".pi", "agent");
const runtime = await ModelRuntime.create({
  authPath: join(agentDir, "auth.json"),
  modelsPath: join(agentDir, "models.json"),
  refreshOnCreate: false,
  allowModelNetwork: false,
});
const ctx = {
  modelRegistry: new ModelRegistry(runtime),
  signal: undefined,
} as unknown as ExtensionContext;
const config = resolveConfig();
const positive = {
  request: "Add payment retries with idempotency and tests.",
  plan: "Implement bounded retries with backoff and idempotency keys. Test duplicate requests, retries, and exhausted retries.",
  todo: "- [x] Add retries and idempotency\n- [x] Test duplicate and failure paths",
  observations: [
    "write payments.ts: retry up to 3 times, use stored idempotency key to deduplicate.",
    "bash command=bun test isError=false\n3 pass, 0 fail: duplicates; successful retry; exhausted retry",
  ],
};
const negative = {
  request: "Add payment retries with idempotency and tests.",
  plan: "Only rename a function. Do not add retries or idempotency or tests.",
  todo: "- [ ] Retries\n- [ ] Idempotency\n- [ ] Tests",
  observations: [
    "write payments.ts: renamed a function; no retries or idempotency implemented",
    "bash command=bun test isError=true\n0 pass, 3 fail",
  ],
};
for (const [label, state] of [
  ["positive", positive],
  ["negative", negative],
] as const) {
  const result = await classify(ctx, config, {
    state,
    questions: questions("done"),
  });
  assert.ok(result, "No authenticated Jev model or request timed out.");
  assert.equal(result.stopReason, "stop", result.errorMessage);
  assert.equal(result.answers.issue?.type, "choice");
  const assessment = assess(result);
  // Positive confidence varies; uncertain is acceptable, but not a definite defect.
  if (label === "positive") assert.notEqual(assessment.verdict, "unavailable");
  else assert.notEqual(assessment.verdict, "pass", "Obviously incomplete work must not pass.");
  console.log(
    JSON.stringify({
      label,
      provider: result.provider,
      model: result.model,
      ...assessment,
      usage: result.usage,
    }),
  );
}
