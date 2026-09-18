import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import type { Usage } from "@earendil-works/pi-ai";
import type {
  ExtensionAPI,
  ExtensionContext,
  ReadonlyFooterDataProvider,
  SessionEntry,
} from "@earendil-works/pi-coding-agent";
import { formatCompactFooter, formatDuration, type CompactFooterData } from "./format";
import { RateCalculator, tokensPerSecond } from "./rate";

const HOME = process.env.HOME ?? process.env.USERPROFILE;
const MODELS_STORE = join(homedir(), ".pi", "agent", "models-store.json");
const SPEED_WINDOW_MS = 2_000;
const RENDER_INTERVAL_MS = 250;
const WORKING_UPDATE_INTERVAL_MS = 1_000;

type RenderTarget = {
  requestRender: () => void;
};

type UsageTotals = Pick<Usage, "input" | "output" | "cacheRead" | "cacheWrite"> & {
  cost: number;
  projectedCost: number;
};

type PriceTier = {
  inputTokensAbove: number;
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
};

type PriceRate = {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  tiers?: PriceTier[];
};

type PriceMap = Record<string, PriceRate>;

type UsageSnapshot = {
  entryCount: number;
  modelKey: string;
  totals: UsageTotals;
  latestCacheHitRate: number | undefined;
};

function createUsageTotals(): UsageTotals {
  return {
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
    cost: 0,
    projectedCost: 0,
  };
}

function finiteNumber(value: unknown): number | undefined {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? number : undefined;
}

function loadPriceRate(raw: unknown): PriceRate | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const value = raw as Record<string, unknown>;
  const input = finiteNumber(value.input);
  const output = finiteNumber(value.output);
  const cacheRead = finiteNumber(value.cacheRead);
  const cacheWrite = finiteNumber(value.cacheWrite);
  if (
    input === undefined ||
    output === undefined ||
    cacheRead === undefined ||
    cacheWrite === undefined
  ) {
    return undefined;
  }

  const tiers = Array.isArray(value.tiers)
    ? value.tiers.flatMap((rawTier) => {
        if (!rawTier || typeof rawTier !== "object") return [];
        const tier = rawTier as Record<string, unknown>;
        const inputTokensAbove = finiteNumber(tier.inputTokensAbove);
        const tierInput = finiteNumber(tier.input);
        const tierOutput = finiteNumber(tier.output);
        const tierCacheRead = finiteNumber(tier.cacheRead);
        const tierCacheWrite = finiteNumber(tier.cacheWrite);
        if (
          inputTokensAbove === undefined ||
          tierInput === undefined ||
          tierOutput === undefined ||
          tierCacheRead === undefined ||
          tierCacheWrite === undefined
        ) {
          return [];
        }
        return [
          {
            inputTokensAbove,
            input: tierInput,
            output: tierOutput,
            cacheRead: tierCacheRead,
            cacheWrite: tierCacheWrite,
          },
        ];
      })
    : undefined;

  return { input, output, cacheRead, cacheWrite, ...(tiers ? { tiers } : {}) };
}

async function loadPriceMap(): Promise<PriceMap> {
  try {
    const parsed = JSON.parse(await readFile(MODELS_STORE, "utf8")) as Record<
      string,
      { models?: Array<{ id?: unknown; cost?: unknown }> } | undefined
    >;
    const map: PriceMap = {};
    for (const [provider, data] of Object.entries(parsed ?? {})) {
      for (const model of data?.models ?? []) {
        if (typeof model.id !== "string") continue;
        const rate = loadPriceRate(model.cost);
        if (rate) map[`${provider}/${model.id}`] = rate;
      }
    }
    return map;
  } catch {
    return {};
  }
}

function lookupRate(
  priceMap: PriceMap,
  provider: string | undefined,
  modelId: string | undefined,
): PriceRate | undefined {
  if (!modelId) return undefined;
  if (provider && priceMap[`${provider}/${modelId}`]) {
    return priceMap[`${provider}/${modelId}`];
  }
  for (const key of Object.keys(priceMap)) {
    if (key.endsWith(`/${modelId}`)) return priceMap[key];
  }
  return undefined;
}

function projectedCost(
  tokens: Pick<Usage, "input" | "output" | "cacheRead" | "cacheWrite">,
  rate: PriceRate | undefined,
): number {
  if (!rate) return 0;
  const totalInput = tokens.input + tokens.cacheRead + tokens.cacheWrite;
  let rates: PriceRate | PriceTier = rate;
  let matched = -1;
  for (const tier of rate.tiers ?? []) {
    if (totalInput > tier.inputTokensAbove && tier.inputTokensAbove > matched) {
      rates = tier;
      matched = tier.inputTokensAbove;
    }
  }
  return (
    (tokens.input / 1_000_000) * rates.input +
    (tokens.output / 1_000_000) * rates.output +
    (tokens.cacheRead / 1_000_000) * rates.cacheRead +
    (tokens.cacheWrite / 1_000_000) * rates.cacheWrite
  );
}

function addUsage(
  totals: UsageTotals,
  usage: Usage | undefined,
  rate: PriceRate | undefined,
): void {
  if (!usage) return;
  totals.input += usage.input;
  totals.output += usage.output;
  totals.cacheRead += usage.cacheRead;
  totals.cacheWrite += usage.cacheWrite;
  totals.cost += usage.cost?.total ?? 0;
  totals.projectedCost += projectedCost(usage, rate);
}

function collectUsage(
  entries: SessionEntry[],
  priceMap: PriceMap,
  fallbackProvider: string | undefined,
  fallbackModel: string | undefined,
): {
  totals: UsageTotals;
  latestCacheHitRate: number | undefined;
} {
  const totals = createUsageTotals();
  let latestCacheHitRate: number | undefined;

  for (const entry of entries) {
    let usage: Usage | undefined;
    let provider: string | undefined;
    let model: string | undefined;

    if (entry.type === "message") {
      if (entry.message.role !== "assistant" && entry.message.role !== "toolResult") {
        continue;
      }
      usage = entry.message.usage;
      const message = entry.message as {
        provider?: string;
        model?: string;
      };
      provider = message.provider;
      model = message.model;

      if (entry.message.role === "assistant" && usage) {
        const promptTokens = usage.input + usage.cacheRead + usage.cacheWrite;
        latestCacheHitRate = promptTokens > 0 ? (usage.cacheRead / promptTokens) * 100 : undefined;
      }
    } else if ((entry.type === "branch_summary" || entry.type === "compaction") && entry.usage) {
      usage = entry.usage;
    }

    addUsage(
      totals,
      usage,
      lookupRate(priceMap, provider ?? fallbackProvider, model ?? fallbackModel),
    );
  }

  return { totals, latestCacheHitRate };
}

function formatTokens(count: number): string {
  if (count < 1000) return count.toString();
  if (count < 10000) return `${(count / 1000).toFixed(1)}k`;
  if (count < 1_000_000) return `${Math.round(count / 1000)}k`;
  if (count < 10_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
  return `${Math.round(count / 1_000_000)}M`;
}

function formatUsd(value: number): string {
  if (value < 0.01) return value === 0 ? "$0" : "<$0.01";
  if (value < 1) return `$${value.toFixed(3)}`;
  return `$${value.toFixed(2)}`;
}

function formatCwd(cwd: string): string {
  if (!HOME) return cwd;

  const resolvedCwd = resolve(cwd);
  const resolvedHome = resolve(HOME);
  const relativeToHome = relative(resolvedHome, resolvedCwd);
  const insideHome =
    relativeToHome === "" ||
    (relativeToHome !== ".." &&
      !relativeToHome.startsWith(`..${sep}`) &&
      !isAbsolute(relativeToHome));

  if (!insideHome) return cwd;
  return relativeToHome === "" ? "~" : `~${sep}${relativeToHome}`;
}

function formatSpeed(rate: number): string {
  if (rate >= 100) return `${rate.toFixed(0)} tok/s`;
  if (rate >= 10) return `${rate.toFixed(1)} tok/s`;
  return `${rate.toFixed(2)} tok/s`;
}

function usingSubscription(provider: string): boolean {
  return provider === "openai-codex" || provider === "kimi-coding" || provider === "github-copilot";
}

function buildFooterData(
  ctx: ExtensionContext,
  footerData: ReadonlyFooterDataProvider,
  usageSnapshot: UsageSnapshot,
  speedLabel: string | undefined,
  requestTime?: string,
): CompactFooterData {
  const model = ctx.model;
  const provider = model?.provider ?? "";
  const modelName = model?.id ?? "no-model";
  const showProvider = Boolean(model) && footerData.getAvailableProviderCount() > 1;
  const modelWithoutProvider = model
    ? model.reasoning
      ? `${modelName} • ${ctx.thinkingLevel ?? "off"}`
      : modelName
    : "no-model";
  const modelDisplay = showProvider
    ? `(${provider}) ${modelWithoutProvider}`
    : modelWithoutProvider;

  const { totals, latestCacheHitRate } = usageSnapshot;
  const statParts: string[] = [];
  if (totals.input) statParts.push(`↑${formatTokens(totals.input)}`);
  if (totals.output) statParts.push(`↓${formatTokens(totals.output)}`);
  if (totals.cacheRead) statParts.push(`R${formatTokens(totals.cacheRead)}`);
  if (totals.cacheWrite) statParts.push(`W${formatTokens(totals.cacheWrite)}`);
  if ((totals.cacheRead > 0 || totals.cacheWrite > 0) && latestCacheHitRate !== undefined) {
    statParts.push(`CH${latestCacheHitRate.toFixed(1)}%`);
  }

  const showCost = totals.projectedCost > 0 || totals.cost > 0 || usingSubscription(provider);
  const cost = showCost ? `P${formatUsd(totals.projectedCost)}/B${formatUsd(totals.cost)}` : "";
  if (cost) statParts.push(cost);
  if (speedLabel) statParts.push(speedLabel);
  const extensionStatus = [...footerData.getExtensionStatuses().values()].join(" ");
  if (extensionStatus) statParts.push(extensionStatus);
  const fullStats = statParts.join(" ");

  const contextUsage = ctx.getContextUsage();
  const contextWindow = contextUsage?.contextWindow ?? model?.contextWindow ?? 0;
  const contextPercentValue = contextUsage?.percent ?? 0;
  const contextPercent = contextUsage?.percent == null ? "?" : contextPercentValue.toFixed(1);
  const contextDisplay = `${contextPercent}%/${formatTokens(contextWindow)} (auto)`;

  const branch = footerData.getGitBranch();
  let location = formatCwd(ctx.sessionManager.getCwd());
  if (branch) location += ` (${branch})`;
  const sessionName = ctx.sessionManager.getSessionName();
  if (sessionName) location += ` • ${sessionName}`;

  return {
    location,
    fullStats,
    compactStats: [cost, speedLabel, extensionStatus].filter(Boolean).join(" "),
    contextDisplay,
    contextPercent: contextPercentValue,
    model: modelDisplay,
    modelWithoutProvider,
    requestTime,
  };
}

export default function (pi: ExtensionAPI) {
  const speedCalculator = new RateCalculator(SPEED_WINDOW_MS);
  let activeTui: RenderTarget | undefined;
  let priceMap: PriceMap = {};
  let usageSnapshot: UsageSnapshot | undefined;
  let requestStartedAt: number | undefined;
  let lastRequestDurationMs: number | undefined;
  let lastWorkingUpdateAt = 0;
  let renderTimer: ReturnType<typeof setInterval> | undefined;
  let streaming = false;
  let streamStartedAt: number | undefined;
  let frozenSpeed: string | undefined;

  const stopRenderTimer = (): void => {
    if (renderTimer !== undefined) {
      clearInterval(renderTimer);
      renderTimer = undefined;
    }
  };

  const currentSpeedLabel = (): string | undefined => {
    if (streaming) return formatSpeed(speedCalculator.rate());
    return frozenSpeed;
  };

  const currentRequestDurationMs = (): number | undefined => {
    if (requestStartedAt !== undefined) {
      return Math.max(0, Date.now() - requestStartedAt);
    }
    return lastRequestDurationMs;
  };

  const requestTimeLabel = (): string | undefined => {
    const durationMs = currentRequestDurationMs();
    return durationMs === undefined ? undefined : `⏱ ${formatDuration(durationMs)}`;
  };

  const getUsageSnapshot = (ctx: ExtensionContext): UsageSnapshot => {
    const entries = ctx.sessionManager.getEntries();
    const modelKey = `${ctx.model?.provider ?? ""}/${ctx.model?.id ?? ""}`;
    if (
      usageSnapshot &&
      usageSnapshot.entryCount === entries.length &&
      usageSnapshot.modelKey === modelKey
    ) {
      return usageSnapshot;
    }

    const collected = collectUsage(entries, priceMap, ctx.model?.provider, ctx.model?.id);
    usageSnapshot = {
      entryCount: entries.length,
      modelKey,
      ...collected,
    };
    return usageSnapshot;
  };

  const renderFooter = (ctx: ExtensionContext): void => {
    activeTui?.requestRender();
    if (requestStartedAt === undefined) return;
    const now = Date.now();
    if (now - lastWorkingUpdateAt < WORKING_UPDATE_INTERVAL_MS) return;
    lastWorkingUpdateAt = now;
    ctx.ui.setWorkingMessage(`Working · ${formatDuration(now - requestStartedAt)}`);
  };

  const startRequest = (ctx: ExtensionContext): void => {
    if (requestStartedAt !== undefined) return;
    requestStartedAt = Date.now();
    lastRequestDurationMs = undefined;
    lastWorkingUpdateAt = 0;
    stopRenderTimer();
    renderTimer = setInterval(() => renderFooter(ctx), RENDER_INTERVAL_MS);
    renderFooter(ctx);
  };

  const finishRequest = (ctx: ExtensionContext): void => {
    if (requestStartedAt === undefined) return;
    lastRequestDurationMs = Math.max(0, Date.now() - requestStartedAt);
    requestStartedAt = undefined;
    stopRenderTimer();
    ctx.ui.setWorkingMessage();
    activeTui?.requestRender();
  };

  pi.on("session_start", async (_event, ctx) => {
    stopRenderTimer();
    requestStartedAt = undefined;
    lastRequestDurationMs = undefined;
    activeTui = undefined;
    usageSnapshot = undefined;
    streaming = false;
    streamStartedAt = undefined;
    frozenSpeed = undefined;
    speedCalculator.reset();
    priceMap = await loadPriceMap();

    if (ctx.mode !== "tui") return;

    ctx.ui.setFooter((tui, theme, footerData) => {
      const renderTarget: RenderTarget = {
        requestRender: () => tui.requestRender(),
      };
      activeTui = renderTarget;
      const unsubscribe = footerData.onBranchChange(() => {
        usageSnapshot = undefined;
        tui.requestRender();
      });

      return {
        dispose() {
          unsubscribe();
          if (activeTui === renderTarget) activeTui = undefined;
        },
        invalidate() {},
        render(width: number): string[] {
          return formatCompactFooter(
            buildFooterData(
              ctx,
              footerData,
              getUsageSnapshot(ctx),
              currentSpeedLabel(),
              requestTimeLabel(),
            ),
            width,
            theme,
          );
        },
      };
    });
  });

  pi.on("agent_start", (_event, ctx) => {
    if (ctx.mode !== "tui") return;
    startRequest(ctx);
  });

  pi.on("message_start", (event, ctx) => {
    if (ctx.mode !== "tui" || event.message.role !== "assistant") return;
    streaming = true;
    streamStartedAt = Date.now();
    frozenSpeed = undefined;
    speedCalculator.reset();
    activeTui?.requestRender();
  });

  pi.on("message_update", (event, ctx) => {
    if (ctx.mode !== "tui" || !streaming) return;
    const update = event.assistantMessageEvent;
    if (!update || update.type === "error") return;

    let chars = 0;
    if (
      update.type === "text_delta" ||
      update.type === "thinking_delta" ||
      update.type === "toolcall_delta"
    ) {
      chars = update.delta.length;
    }
    if (chars > 0) speedCalculator.add(chars);
    activeTui?.requestRender();
  });

  pi.on("message_end", (event, ctx) => {
    if (ctx.mode !== "tui" || event.message.role !== "assistant") return;
    const real = tokensPerSecond(event.message.usage?.output ?? 0, streamStartedAt, Date.now());
    frozenSpeed = formatSpeed(real ?? speedCalculator.rate());
    streaming = false;
    streamStartedAt = undefined;
    speedCalculator.reset();
    usageSnapshot = undefined;
    activeTui?.requestRender();
  });

  pi.on("agent_settled", (_event, ctx) => {
    if (ctx.mode !== "tui") return;
    usageSnapshot = undefined;
    finishRequest(ctx);
  });

  pi.on("session_shutdown", () => {
    stopRenderTimer();
    requestStartedAt = undefined;
    lastRequestDurationMs = undefined;
    activeTui = undefined;
    usageSnapshot = undefined;
    streaming = false;
    streamStartedAt = undefined;
    frozenSpeed = undefined;
    speedCalculator.reset();
  });
}
