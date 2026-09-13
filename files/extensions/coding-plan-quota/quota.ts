import { readFileSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

export const CODEX_USAGE_URL = "https://chatgpt.com/backend-api/wham/usage";
export const KIMI_USAGE_URL = "https://api.kimi.com/coding/v1/usages";
export const COPILOT_USAGE_URL = "https://api.github.com/copilot_internal/user";
export const QUOTA_TIMEOUT_MS = 1_500;

export type CodexQuotaWindow = {
  usedPercent: number;
  windowDurationMins: number | null;
  resetsAt: number | null;
};

export type CodexQuotaSnapshot = {
  primary?: CodexQuotaWindow;
  secondary?: CodexQuotaWindow;
  planType?: string;
  email?: string;
  error?: string;
} | null;

export type StandardQuotaWindow = {
  used: number;
  limit: number;
  pct: number;
  reset: string | null;
};

export type LlmQuotaSnapshot = {
  fiveHour?: StandardQuotaWindow;
  week?: StandardQuotaWindow;
  planType?: string;
  error?: string;
} | null;

export type KimiQuotaWindow = StandardQuotaWindow & {
  resetTime: string | null;
};

export type KimiQuotaSnapshot = {
  fiveHour?: KimiQuotaWindow;
  week?: KimiQuotaWindow;
  level?: string;
  error?: string;
} | null;

export type CopilotQuotaDetail = {
  entitlement: number;
  remaining: number;
  percentRemaining: number;
  unlimited: boolean;
  overageCount: number;
};

export type CopilotQuotaSnapshot = {
  planType?: string;
  resetDate?: string;
  premium?: CopilotQuotaDetail;
  chat?: CopilotQuotaDetail;
  completions?: CopilotQuotaDetail;
  error?: string;
} | null;

export type QuotaSnapshotSet = {
  llmapi: LlmQuotaSnapshot;
  codex: CodexQuotaSnapshot;
  kimi: KimiQuotaSnapshot;
  copilot: CopilotQuotaSnapshot;
};

function finiteNumber(value: unknown): number | undefined {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? number : undefined;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function normalizePercent(value: number): number {
  return Math.round(Math.max(0, Math.min(100, value)) * 100) / 100;
}

function normalizePlan(value: string): string {
  return value
    .replace(/^LEVEL_/i, "")
    .replace(/[_-]+/g, " ")
    .toLowerCase();
}

function parseCodexWindow(value: unknown): CodexQuotaWindow | undefined {
  if (!value || typeof value !== "object") return undefined;
  const raw = value as Record<string, unknown>;
  const usedPercent = finiteNumber(raw.used_percent);
  if (usedPercent === undefined) return undefined;

  return {
    usedPercent: normalizePercent(usedPercent),
    windowDurationMins:
      finiteNumber(raw.limit_window_seconds) !== undefined
        ? Math.round(finiteNumber(raw.limit_window_seconds)! / 60)
        : null,
    resetsAt: finiteNumber(raw.reset_at) ?? null,
  };
}

/** Parse the Codex `wham/usage` response without making a network request. */
export function parseCodexUsageResponse(raw: unknown): CodexQuotaSnapshot {
  if (!raw || typeof raw !== "object") {
    return { error: "empty/unrecognized response shape" };
  }

  const response = raw as Record<string, unknown>;
  const rateLimit =
    response.rate_limit && typeof response.rate_limit === "object"
      ? (response.rate_limit as Record<string, unknown>)
      : undefined;
  const primary = parseCodexWindow(rateLimit?.primary_window);
  const secondary = parseCodexWindow(rateLimit?.secondary_window);
  const planType = stringValue(response.plan_type);
  const email = stringValue(response.email);

  if (!primary && !secondary && !planType) {
    return { error: "no rate_limit in response" };
  }

  const snapshot: NonNullable<CodexQuotaSnapshot> = {};
  if (primary) snapshot.primary = primary;
  if (secondary) snapshot.secondary = secondary;
  if (planType) snapshot.planType = planType;
  if (email) snapshot.email = email;
  return snapshot;
}

function parseStandardWindow(value: unknown): StandardQuotaWindow | undefined {
  if (!value || typeof value !== "object") return undefined;
  const raw = value as Record<string, unknown>;
  const used = finiteNumber(raw.used ?? raw.usage ?? raw.current);
  const limit = finiteNumber(raw.limit ?? raw.total ?? raw.max);
  if (used === undefined || limit === undefined || limit <= 0) return undefined;
  return {
    used,
    limit,
    pct: normalizePercent((used / limit) * 100),
    reset: stringValue(raw.reset_at ?? raw.resetAt) ?? null,
  };
}

/** Parse the Anthropic-compatible `/v1/usage` shapes used by llmapi. */
export function parseLlmQuotaResponse(raw: unknown): LlmQuotaSnapshot {
  if (!raw || typeof raw !== "object") return null;
  const response = raw as Record<string, unknown>;
  const planType = stringValue(
    response.plan_type ?? response.planType ?? response.plan,
  );

  const directFiveHour = parseStandardWindow(
    response.five_hour ?? response.fiveHour,
  );
  const directWeek = parseStandardWindow(response.week);
  if (directFiveHour || directWeek) {
    return {
      ...(directFiveHour ? { fiveHour: directFiveHour } : {}),
      ...(directWeek ? { week: directWeek } : {}),
      ...(planType ? { planType } : {}),
    };
  }

  const windows = response.windows;
  if (windows && typeof windows === "object") {
    const nested = windows as Record<string, unknown>;
    const fiveHour = parseStandardWindow(nested.five_hour ?? nested.fiveHour);
    const week = parseStandardWindow(nested.week);
    if (fiveHour || week) {
      return {
        ...(fiveHour ? { fiveHour } : {}),
        ...(week ? { week } : {}),
        ...(planType ? { planType } : {}),
      };
    }
  }

  const flatFiveHour = parseFlatWindow(
    response.used_5h ?? response.used5h,
    response.limit_5h ?? response.limit5h,
  );
  const flatWeek = parseFlatWindow(
    response.used_week ?? response.usedWeek,
    response.limit_week ?? response.limitWeek,
  );
  if (flatFiveHour || flatWeek) {
    return {
      ...(flatFiveHour ? { fiveHour: flatFiveHour } : {}),
      ...(flatWeek ? { week: flatWeek } : {}),
    };
  }

  const single = parseStandardWindow(response);
  if (single || planType) {
    return {
      ...(single ? { fiveHour: single } : {}),
      ...(planType ? { planType } : {}),
    };
  }
  return null;
}

function parseFlatWindow(
  used: unknown,
  limit: unknown,
): StandardQuotaWindow | undefined {
  const usedNumber = finiteNumber(used);
  const limitNumber = finiteNumber(limit);
  if (
    usedNumber === undefined ||
    limitNumber === undefined ||
    limitNumber <= 0
  ) {
    return undefined;
  }
  return {
    used: usedNumber,
    limit: limitNumber,
    pct: normalizePercent((usedNumber / limitNumber) * 100),
    reset: null,
  };
}

function parseKimiWindow(value: unknown): KimiQuotaWindow | undefined {
  const window = parseStandardWindow(value);
  if (!window) return undefined;
  const raw = value as Record<string, unknown>;
  return {
    ...window,
    resetTime: stringValue(raw.resetTime) ?? window.reset,
  };
}

/** Parse Kimi Coding's `/coding/v1/usages` response. */
export function parseKimiUsageResponse(raw: unknown): KimiQuotaSnapshot {
  if (!raw || typeof raw !== "object") {
    return { error: "empty/unrecognized response shape" };
  }
  const response = raw as Record<string, unknown>;
  const week = parseKimiWindow(response.usage);
  let fiveHour: KimiQuotaWindow | undefined;

  if (Array.isArray(response.limits)) {
    const candidates = response.limits.map((entry) => {
      if (!entry || typeof entry !== "object") {
        return { window: undefined, isFiveHour: false };
      }
      const item = entry as Record<string, unknown>;
      const window =
        item.window && typeof item.window === "object"
          ? (item.window as Record<string, unknown>)
          : undefined;
      return {
        window: parseKimiWindow(item.detail),
        isFiveHour:
          finiteNumber(window?.duration) === 300 &&
          window?.timeUnit === "TIME_UNIT_MINUTE",
      };
    });
    fiveHour =
      candidates.find((candidate) => candidate.isFiveHour && candidate.window)
        ?.window ?? candidates.find((candidate) => candidate.window)?.window;
  }

  const membership =
    response.user && typeof response.user === "object"
      ? (response.user as Record<string, unknown>).membership
      : undefined;
  const level =
    membership && typeof membership === "object"
      ? stringValue((membership as Record<string, unknown>).level)
      : undefined;

  if (!week && !fiveHour && !level) {
    return { error: "no usage in response" };
  }
  return {
    ...(fiveHour ? { fiveHour } : {}),
    ...(week ? { week } : {}),
    ...(level ? { level } : {}),
  };
}

function booleanValue(value: unknown): boolean | undefined {
  if (typeof value === "boolean") return value;
  if (value === "true") return true;
  if (value === "false") return false;
  return undefined;
}

function parseCopilotDetail(value: unknown): CopilotQuotaDetail | undefined {
  if (!value || typeof value !== "object") return undefined;
  const raw = value as Record<string, unknown>;
  const entitlement = finiteNumber(raw.entitlement ?? raw.entitlement_requests);
  const used = finiteNumber(raw.used ?? raw.used_requests);
  const explicitRemaining = finiteNumber(
    raw.remaining ?? raw.remaining_requests ?? raw.quota_remaining,
  );
  const remaining =
    explicitRemaining ??
    (entitlement !== undefined && used !== undefined
      ? Math.max(0, entitlement - used)
      : undefined);
  const explicitPercent = finiteNumber(
    raw.percent_remaining ?? raw.remaining_percentage,
  );
  const percentRemaining =
    explicitPercent ??
    (entitlement !== undefined && remaining !== undefined && entitlement > 0
      ? (remaining / entitlement) * 100
      : undefined);
  const unlimited = booleanValue(raw.unlimited) ?? false;

  if (
    (!unlimited && entitlement === undefined) ||
    remaining === undefined ||
    percentRemaining === undefined
  ) {
    return undefined;
  }

  return {
    entitlement: entitlement ?? 0,
    remaining: Math.max(0, remaining),
    percentRemaining: normalizePercent(percentRemaining),
    unlimited,
    overageCount: finiteNumber(raw.overage_count) ?? 0,
  };
}

/** Parse GitHub Copilot's authenticated quota snapshot response. */
export function parseCopilotUsageResponse(raw: unknown): CopilotQuotaSnapshot {
  if (!raw || typeof raw !== "object") {
    return { error: "empty/unrecognized response shape" };
  }
  const response = raw as Record<string, unknown>;
  const snapshots =
    response.quota_snapshots && typeof response.quota_snapshots === "object"
      ? (response.quota_snapshots as Record<string, unknown>)
      : {};
  const planType = stringValue(response.copilot_plan ?? response.plan);
  const resetDate = stringValue(
    response.quota_reset_date ?? response.reset_date,
  );
  const premium = parseCopilotDetail(
    snapshots.premium_interactions ?? response.premium_interactions,
  );
  const chat = parseCopilotDetail(snapshots.chat ?? response.chat);
  const completions = parseCopilotDetail(
    snapshots.completions ?? response.completions,
  );

  if (!premium && !chat && !completions && !planType) {
    return { error: "no quota snapshots in response" };
  }
  return {
    ...(planType ? { planType } : {}),
    ...(resetDate ? { resetDate } : {}),
    ...(premium ? { premium } : {}),
    ...(chat ? { chat } : {}),
    ...(completions ? { completions } : {}),
  };
}

export function formatCodexQuota(
  snapshot: CodexQuotaSnapshot,
): string | undefined {
  if (!snapshot) return undefined;
  const parts = [
    snapshot.planType ? `codex ${normalizePlan(snapshot.planType)}` : "codex",
  ];
  if (snapshot.primary)
    parts.push(`5h ${Math.round(snapshot.primary.usedPercent)}%`);
  if (snapshot.secondary)
    parts.push(`wk ${Math.round(snapshot.secondary.usedPercent)}%`);
  if (snapshot.error && parts.length === 1) parts.push("err");
  return parts.join(" · ");
}

export function formatLlmQuota(snapshot: LlmQuotaSnapshot): string | undefined {
  if (!snapshot) return undefined;
  const parts = [
    snapshot.planType ? `llmapi ${normalizePlan(snapshot.planType)}` : "llmapi",
  ];
  if (snapshot.fiveHour) parts.push(`5h ${Math.round(snapshot.fiveHour.pct)}%`);
  if (snapshot.week) parts.push(`7d ${Math.round(snapshot.week.pct)}%`);
  if (snapshot.error && parts.length === 1) parts.push("err");
  return parts.join(" · ");
}

export function formatKimiQuota(
  snapshot: KimiQuotaSnapshot,
): string | undefined {
  if (!snapshot) return undefined;
  const parts = [
    snapshot.level ? `kimi ${normalizePlan(snapshot.level)}` : "kimi",
  ];
  if (snapshot.fiveHour) parts.push(`5h ${Math.round(snapshot.fiveHour.pct)}%`);
  if (snapshot.week) parts.push(`wk ${Math.round(snapshot.week.pct)}%`);
  if (snapshot.error && parts.length === 1) parts.push("err");
  return parts.join(" · ");
}

export function formatCopilotQuota(
  snapshot: CopilotQuotaSnapshot,
): string | undefined {
  if (!snapshot) return undefined;
  const parts = [
    snapshot.planType ? `gh ${normalizePlan(snapshot.planType)}` : "gh copilot",
  ];
  const detail = (label: string, quota: CopilotQuotaDetail | undefined) => {
    if (!quota) return;
    parts.push(
      quota.unlimited
        ? `${label} ∞`
        : `${label} ${Math.round(quota.percentRemaining)}% left`,
    );
  };
  detail("prem", snapshot.premium);
  detail("chat", snapshot.chat);
  detail("comp", snapshot.completions);
  if (snapshot.error && parts.length === 1) parts.push("err");
  return parts.join(" · ");
}

export function formatQuotaBar(snapshots: QuotaSnapshotSet): string {
  return [
    formatLlmQuota(snapshots.llmapi),
    formatCodexQuota(snapshots.codex),
    formatKimiQuota(snapshots.kimi),
    formatCopilotQuota(snapshots.copilot),
  ]
    .filter((value): value is string => Boolean(value))
    .join(" │ ");
}

type StoredCredential = {
  access?: string;
  refresh?: string;
  key?: string;
  accountId?: string;
  enterpriseUrl?: string;
  apiEndpoint?: string;
};

type AuthResult = { credential?: StoredCredential; error?: string };

function readStoredCredential(provider: string): AuthResult {
  try {
    const configDir =
      process.env.PI_CODING_AGENT_DIR ??
      path.join(os.homedir(), ".pi", "agent");
    const auth = JSON.parse(
      readFileSync(path.join(configDir, "auth.json"), "utf8"),
    ) as Record<string, StoredCredential | undefined>;
    const credential = auth[provider];
    return credential ? { credential } : { error: `${provider} not logged in` };
  } catch {
    return { error: "auth.json unreadable" };
  }
}

function credentialToken(
  provider: string,
  envNames: string[] = [],
): string | undefined {
  const stored = readStoredCredential(provider).credential;
  for (const value of [
    stored?.access,
    stored?.key,
    ...envNames.map((name) => process.env[name]),
  ]) {
    if (value) return value;
  }
  return undefined;
}

async function fetchJson(
  url: string,
  headers: Record<string, string>,
): Promise<unknown> {
  const response = await fetch(url, {
    method: "GET",
    headers: { Accept: "application/json", ...headers },
    signal: AbortSignal.timeout(QUOTA_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`http ${response.status}`);
  return response.json();
}

export async function fetchCodexQuota(): Promise<CodexQuotaSnapshot> {
  const auth = readStoredCredential("openai-codex").credential;
  const token = auth?.access ?? auth?.refresh;
  if (!token) return null;
  try {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
    };
    if (auth?.accountId) headers["ChatGPT-Account-Id"] = auth.accountId;
    return parseCodexUsageResponse(await fetchJson(CODEX_USAGE_URL, headers));
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

export async function fetchLlmQuota(): Promise<LlmQuotaSnapshot> {
  const base = process.env.ANTHROPIC_BASE_URL;
  const token =
    process.env.ANTHROPIC_AUTH_TOKEN ?? process.env.ANTHROPIC_API_KEY;
  if (!base || !token) return null;
  const root = base.replace(/\/+$/, "");
  const url = `${root.endsWith("/v1") ? root : `${root}/v1`}/usage`;
  let lastError = "fetch failed";
  for (const headers of [
    { Authorization: `Bearer ${token}` },
    { "x-api-key": token },
  ]) {
    try {
      const parsed = parseLlmQuotaResponse(await fetchJson(url, headers));
      if (parsed) return parsed;
      lastError = "empty/unrecognized response shape";
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
  }
  return { error: lastError };
}

export async function fetchKimiQuota(): Promise<KimiQuotaSnapshot> {
  const token = credentialToken("kimi-coding", ["KIMI_API_KEY"]);
  if (!token) return null;
  try {
    return parseKimiUsageResponse(
      await fetchJson(KIMI_USAGE_URL, { Authorization: `Bearer ${token}` }),
    );
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

function parseCopilotApiCredential(raw: string): string {
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return stringValue(parsed.token) ?? raw;
  } catch {
    return raw;
  }
}

function copilotApiBase(credential: StoredCredential | undefined): string {
  if (credential?.enterpriseUrl) {
    const enterprise = credential.enterpriseUrl
      .replace(/^https?:\/\//, "")
      .replace(/\/+$/, "");
    return enterprise.startsWith("api.")
      ? `https://${enterprise}`
      : `https://api.${enterprise}`;
  }
  return "https://api.github.com";
}

export async function fetchCopilotQuota(): Promise<CopilotQuotaSnapshot> {
  const stored = readStoredCredential("github-copilot");
  const credential = stored.credential;
  const rawToken =
    credential?.refresh ??
    credential?.access ??
    credential?.key ??
    process.env.COPILOT_GITHUB_TOKEN;
  if (!rawToken) return null;

  const token = parseCopilotApiCredential(rawToken);
  try {
    const raw = await fetchJson(
      `${copilotApiBase(credential)}/copilot_internal/user`,
      {
        Authorization: `Bearer ${token}`,
        "User-Agent": "opencode/1.3.15",
      },
    );
    return parseCopilotUsageResponse(raw);
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}
