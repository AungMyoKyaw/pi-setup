import { describe, expect, test } from "bun:test";
import { classify } from "../judge.ts";
import { resolveConfig } from "../config.ts";
import { fixture, model, reply } from "./helpers.ts";

describe("credential selection, timeouts, cancellation", () => {
  test("uses an authenticated fallback instead of catalog-only model", async () => {
    const f = await fixture();
    try {
      const routerModel = {
        ...model,
        provider: "openrouter",
        id: "typesafe/jev-1.13",
      };
      f.ctx.modelRegistry.getAvailableOfType = (async () => [routerModel]) as any;
      let selected: unknown;
      f.ctx.modelRegistry.classify = async (m) => {
        selected = m;
        return reply();
      };
      await classify(f.ctx, resolveConfig({}), { state: {}, questions: {} });
      expect(selected).toEqual(routerModel);
    } finally {
      await f.cleanup();
    }
  });
  test("explicit unavailable provider/model does not silently switch", async () => {
    const f = await fixture();
    try {
      const result = await classify(
        f.ctx,
        resolveConfig({
          PI_JEV_GATE_PROVIDER: "openrouter",
          PI_JEV_GATE_MODEL_ID: "missing",
        }),
        { state: {}, questions: {} },
      );
      expect(result).toBeUndefined();
      expect(f.requests.length).toBe(0);
    } finally {
      await f.cleanup();
    }
  });
  test("provider exceptions are swallowed without a fake pass", async () => {
    const f = await fixture();
    try {
      f.ctx.modelRegistry.classify = async () => {
        throw new Error("network");
      };
      expect(
        await classify(f.ctx, resolveConfig({}), { state: {}, questions: {} }),
      ).toBeUndefined();
    } finally {
      await f.cleanup();
    }
  });
  test("unresponsive provider cannot hang checkpoints", async () => {
    const f = await fixture();
    try {
      f.ctx.modelRegistry.classify = () => new Promise(() => {});
      const start = Date.now();
      expect(
        await classify(
          f.ctx,
          { ...resolveConfig({}), timeoutMs: 10 },
          { state: {}, questions: {} },
        ),
      ).toBeUndefined();
      expect(Date.now() - start).toBeLessThan(1000);
    } finally {
      await f.cleanup();
    }
  });
  test("mid-flight cancellation settles even if provider ignores abort", async () => {
    const f = await fixture();
    try {
      f.ctx.modelRegistry.classify = () => new Promise(() => {});
      const controller = new AbortController();
      const start = Date.now();
      const pending = classify(
        f.ctx,
        resolveConfig({}),
        { state: {}, questions: {} },
        controller.signal,
      );
      await new Promise((resolve) => setTimeout(resolve, 5));
      controller.abort();
      expect(await pending).toBeUndefined();
      expect(Date.now() - start).toBeLessThan(1000);
    } finally {
      await f.cleanup();
    }
  });
  test("already-aborted signal does not call provider", async () => {
    const f = await fixture();
    try {
      expect(
        await classify(f.ctx, resolveConfig({}), { state: {}, questions: {} }, AbortSignal.abort()),
      ).toBeUndefined();
      expect(f.requests.length).toBe(0);
    } finally {
      await f.cleanup();
    }
  });
});
