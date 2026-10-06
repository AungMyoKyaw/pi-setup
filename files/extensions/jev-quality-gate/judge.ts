import type { ClassifierContext, ClassifierResult } from "@earendil-works/pi-ai";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { Config } from "./config.ts";

const PREFERRED = [
  ["typesafe", "jev-latest"],
  ["openrouter", "~typesafe/jev-latest"],
  ["openrouter", "typesafe/jev-1.13"],
  ["cloudflare-workers-ai", "typesafe/jev"],
  ["vercel-ai-gateway", "typesafe-ai/jev"],
  ["opencode", "jev-1.13"],
  ["opencode", "jev-1.13-free"],
] as const;

export async function classify(
  ctx: ExtensionContext,
  config: Config,
  context: ClassifierContext,
  signal: AbortSignal | undefined = ctx.signal,
): Promise<ClassifierResult | undefined> {
  if (signal?.aborted) return undefined;
  const controller = new AbortController();
  let finishCancel: ((value: undefined) => void) | undefined;
  const cancelled = new Promise<undefined>((resolve) => {
    finishCancel = resolve;
  });
  const cancel = () => {
    controller.abort(signal?.reason);
    finishCancel?.(undefined);
  };
  signal?.addEventListener("abort", cancel, { once: true });
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const work = async () => {
      const available = await ctx.modelRegistry.getAvailableOfType("classifier", config.provider, {
        signal: controller.signal,
      });
      const candidates =
        config.provider || config.modelId
          ? available.filter(
              (m) =>
                (!config.provider || m.provider === config.provider) &&
                (!config.modelId || m.id === config.modelId) &&
                PREFERRED.some(([p, id]) => p === m.provider && id === m.id),
            )
          : PREFERRED.flatMap(([p, id]) =>
              available.filter((m) => m.provider === p && m.id === id),
            );
      const model = candidates[0];
      if (!model || controller.signal.aborted) return undefined;
      return ctx.modelRegistry.classify(model, context, {
        signal: controller.signal,
      });
    };
    // Bound both cancellation and providers that ignore their abort signal.
    const result = await Promise.race([
      work(),
      cancelled,
      new Promise<undefined>((resolve) => {
        timer = setTimeout(() => {
          controller.abort();
          resolve(undefined);
        }, config.timeoutMs);
      }),
    ]);
    return signal?.aborted || controller.signal.aborted ? undefined : result;
  } catch {
    return undefined; // Credential/provider failures are fail-open, not passes.
  } finally {
    if (timer) clearTimeout(timer);
    signal?.removeEventListener("abort", cancel);
  }
}
