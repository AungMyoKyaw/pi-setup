import { relative, resolve, sep, isAbsolute } from "node:path";
import type { Usage } from "@earendil-works/pi-ai";
import type {
  ExtensionAPI,
  ExtensionContext,
  ReadonlyFooterDataProvider,
  SessionEntry,
} from "@earendil-works/pi-coding-agent";
import {
  formatCompactFooter,
  formatDuration,
  type CompactFooterData,
} from "./format";

const HOME = process.env.HOME ?? process.env.USERPROFILE;

type RenderTarget = {
  requestRender: () => void;
};

type UsageTotals = Pick<
  Usage,
  "input" | "output" | "cacheRead" | "cacheWrite"
> & { cost: number };

function createUsageTotals(): UsageTotals {
  return {
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
    cost: 0,
  };
}

function addUsage(totals: UsageTotals, usage: Usage | undefined): void {
  if (!usage) return;
  totals.input += usage.input;
  totals.output += usage.output;
  totals.cacheRead += usage.cacheRead;
  totals.cacheWrite += usage.cacheWrite;
  totals.cost += usage.cost.total;
}

function formatTokens(count: number): string {
  if (count < 1000) return count.toString();
  if (count < 10000) return `${(count / 1000).toFixed(1)}k`;
  if (count < 1_000_000) return `${Math.round(count / 1000)}k`;
  if (count < 10_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
  return `${Math.round(count / 1_000_000)}M`;
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

function collectUsage(entries: SessionEntry[]): {
  totals: UsageTotals;
  latestCacheHitRate: number | undefined;
} {
  const totals = createUsageTotals();
  let latestCacheHitRate: number | undefined;

  for (const entry of entries) {
    if (entry.type === "message") {
      if (entry.message.role === "assistant") {
        addUsage(totals, entry.message.usage);
        const promptTokens =
          entry.message.usage.input +
          entry.message.usage.cacheRead +
          entry.message.usage.cacheWrite;
        latestCacheHitRate =
          promptTokens > 0
            ? (entry.message.usage.cacheRead / promptTokens) * 100
            : undefined;
      } else if (entry.message.role === "toolResult") {
        addUsage(totals, entry.message.usage);
      }
    } else if (
      (entry.type === "branch_summary" || entry.type === "compaction") &&
      entry.usage
    ) {
      addUsage(totals, entry.usage);
    }
  }

  return { totals, latestCacheHitRate };
}

function buildFooterData(
  ctx: ExtensionContext,
  footerData: ReadonlyFooterDataProvider,
  requestTime?: string,
): CompactFooterData {
  const model = ctx.model;
  const provider = model?.provider ?? "";
  const modelName = model?.id ?? "no-model";
  const showProvider =
    Boolean(model) && footerData.getAvailableProviderCount() > 1;
  const modelWithoutProvider = model
    ? model.reasoning
      ? `${modelName} • ${ctx.thinkingLevel ?? "off"}`
      : modelName
    : "no-model";
  const modelDisplay = showProvider
    ? `(${provider}) ${modelWithoutProvider}`
    : modelWithoutProvider;

  const { totals, latestCacheHitRate } = collectUsage(
    ctx.sessionManager.getEntries(),
  );
  const usingSubscription =
    provider === "openai-codex" ||
    provider === "kimi-coding" ||
    provider === "github-copilot";

  const statParts: string[] = [];
  if (totals.input) statParts.push(`↑${formatTokens(totals.input)}`);
  if (totals.output) statParts.push(`↓${formatTokens(totals.output)}`);
  if (totals.cacheRead) statParts.push(`R${formatTokens(totals.cacheRead)}`);
  if (totals.cacheWrite) statParts.push(`W${formatTokens(totals.cacheWrite)}`);
  if (
    (totals.cacheRead > 0 || totals.cacheWrite > 0) &&
    latestCacheHitRate !== undefined
  ) {
    statParts.push(`CH${latestCacheHitRate.toFixed(1)}%`);
  }

  const cost =
    totals.cost || usingSubscription
      ? `$${totals.cost.toFixed(3)}${usingSubscription ? " (sub)" : ""}`
      : "";
  if (cost) statParts.push(cost);

  const contextUsage = ctx.getContextUsage();
  const contextWindow =
    contextUsage?.contextWindow ?? model?.contextWindow ?? 0;
  const contextPercentValue = contextUsage?.percent ?? 0;
  const contextPercent =
    contextUsage?.percent !== null ? contextPercentValue.toFixed(1) : "?";
  const contextDisplay = `${contextPercent}%/${formatTokens(contextWindow)} (auto)`;

  const branch = footerData.getGitBranch();
  let location = formatCwd(ctx.sessionManager.getCwd());
  if (branch) location += ` (${branch})`;
  const sessionName = ctx.sessionManager.getSessionName();
  if (sessionName) location += ` • ${sessionName}`;

  return {
    location,
    fullStats: statParts.join(" "),
    compactStats: cost,
    contextDisplay,
    contextPercent: contextPercentValue,
    model: modelDisplay,
    modelWithoutProvider,
    requestTime,
  };
}

export default function (pi: ExtensionAPI) {
  let activeTui: RenderTarget | undefined;
  let requestStartedAt: number | undefined;
  let lastRequestDurationMs: number | undefined;
  let requestTimer: ReturnType<typeof setInterval> | undefined;

  const stopRequestTimer = (): void => {
    if (requestTimer !== undefined) {
      clearInterval(requestTimer);
      requestTimer = undefined;
    }
  };

  const currentRequestDurationMs = (): number | undefined => {
    if (requestStartedAt !== undefined) {
      return Math.max(0, Date.now() - requestStartedAt);
    }
    return lastRequestDurationMs;
  };

  const requestTimeLabel = (): string | undefined => {
    const durationMs = currentRequestDurationMs();
    return durationMs === undefined
      ? undefined
      : `⏱ ${formatDuration(durationMs)}`;
  };

  const paintWorkingMessage = (ctx: ExtensionContext): void => {
    if (requestStartedAt === undefined) return;
    ctx.ui.setWorkingMessage(
      `Working · ${formatDuration(Date.now() - requestStartedAt)}`,
    );
    activeTui?.requestRender();
  };

  const startRequestTimer = (ctx: ExtensionContext): void => {
    if (requestStartedAt !== undefined) return;

    requestStartedAt = Date.now();
    lastRequestDurationMs = undefined;
    stopRequestTimer();
    paintWorkingMessage(ctx);
    requestTimer = setInterval(() => paintWorkingMessage(ctx), 1000);
  };

  const finishRequestTimer = (ctx: ExtensionContext): void => {
    if (requestStartedAt === undefined) return;

    lastRequestDurationMs = Math.max(0, Date.now() - requestStartedAt);
    requestStartedAt = undefined;
    stopRequestTimer();
    ctx.ui.setWorkingMessage();
    activeTui?.requestRender();
  };

  pi.on("session_start", (_event, ctx) => {
    stopRequestTimer();
    requestStartedAt = undefined;
    lastRequestDurationMs = undefined;
    activeTui = undefined;

    if (ctx.mode !== "tui") return;

    ctx.ui.setFooter((tui, theme, footerData) => {
      const renderTarget: RenderTarget = {
        requestRender: () => tui.requestRender(),
      };
      activeTui = renderTarget;
      const unsubscribe = footerData.onBranchChange(() => tui.requestRender());

      return {
        dispose() {
          unsubscribe();
          if (activeTui === renderTarget) activeTui = undefined;
        },
        invalidate() {},
        render(width: number): string[] {
          return formatCompactFooter(
            buildFooterData(ctx, footerData, requestTimeLabel()),
            width,
            theme,
          );
        },
      };
    });
  });

  pi.on("agent_start", (_event, ctx) => {
    if (ctx.mode !== "tui") return;
    startRequestTimer(ctx);
  });

  pi.on("agent_settled", (_event, ctx) => {
    if (ctx.mode !== "tui") return;
    finishRequestTimer(ctx);
  });

  pi.on("session_shutdown", () => {
    stopRequestTimer();
    requestStartedAt = undefined;
    lastRequestDurationMs = undefined;
    activeTui = undefined;
  });
}
