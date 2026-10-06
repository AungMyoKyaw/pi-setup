import { describe, expect, test } from "bun:test";
import { assess, packet, shouldPreflight } from "../policy.ts";
import { resolveConfig } from "../config.ts";
import { reply } from "./helpers.ts";

describe("classification normalization", () => {
  test("high-confidence coverage with evidence passes", () =>
    expect(assess(reply()).verdict).toBe("pass"));
  test("score value is not its confidence", () => {
    const result = reply("ready", 0, 0.99);
    expect(assess(result).verdict).toBe("revise");
    expect(assess(result).coverage).toBe(0);
  });
  test("partial coverage is not a pass", () =>
    expect(assess(reply("ready", 1)).verdict).toBe("revise"));
  test("a confident concrete gap needs revision", () =>
    expect(assess(reply("coverage", 1)).verdict).toBe("revise"));
  test("confidence below floor is uncertain", () =>
    expect(assess(reply("coverage", 1, 0.3)).verdict).toBe("uncertain"));
  test("insufficient evidence is uncertain even at high confidence", () =>
    expect(assess(reply("insufficient")).verdict).toBe("uncertain"));
  test("missing answers cannot pass", () =>
    expect(assess({ ...reply(), answers: {} }).verdict).toBe("uncertain"));
  test("missing probability maps cannot pass or throw", () => {
    const r = reply();
    (r.answers.issue as any).probabilities = undefined;
    expect(assess(r).verdict).toBe("uncertain");
  });
  test("unknown labels cannot pass", () =>
    expect(assess(reply("imagined")).verdict).toBe("uncertain"));
  test("NaN scores cannot pass", () =>
    expect(assess(reply("ready", NaN)).verdict).toBe("uncertain"));
  test("provider errors and cancellation are unavailable", () => {
    for (const stopReason of ["error", "aborted"] as const)
      expect(assess({ ...reply(), stopReason }).verdict).toBe("unavailable");
  });
  test("low evidence probability cannot pass", () => {
    const r = reply();
    r.answers.evidenceSufficient = { type: "bool", probability: 0.2 };
    expect(assess(r).verdict).not.toBe("pass");
  });
  test("packets are actionable and retain uncertainty", () => {
    expect(packet("done", assess(reply("validation", 1)))).toContain("tests");
    expect(packet("done", assess(reply("insufficient")))).toContain("uncertain");
  });
});
describe("preflight routing and configuration", () => {
  test("short coding requests are not wrongly skipped", () =>
    expect(shouldPreflight("fix login")).toBe(true));
  test("only deterministic trivial inputs skip", () => {
    for (const p of ["", "hi", "thanks!", "/help", "!ls", "?skip"])
      expect(shouldPreflight(p)).toBe(false);
  });
  test("extension input is not recursively classified", () =>
    expect(shouldPreflight("Fix login", "extension")).toBe(false));
  test("plan and plan-only aliases agree", () => {
    expect(resolveConfig({ PI_JEV_GATE_MODE: "plan" }).mode).toBe("plan-only");
    expect(resolveConfig({ PI_JEV_GATE_MODE: "plan-only" }).mode).toBe("plan-only");
  });
  test("off flag overrides mode", () =>
    expect(resolveConfig({ PI_JEV_GATE: "0", PI_JEV_GATE_MODE: "full" }).mode).toBe("off"));
});
