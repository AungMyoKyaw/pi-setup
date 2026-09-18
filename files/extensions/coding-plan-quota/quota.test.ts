import { describe, expect, test } from "bun:test";
import {
  formatCodexQuota,
  formatCopilotQuota,
  formatKimiQuota,
  formatLlmQuota,
  formatQuotaBar,
  fetchLlmQuota,
  parseCodexUsageResponse,
  parseCopilotUsageResponse,
  parseKimiUsageResponse,
  parseLlmQuotaResponse,
} from "./quota";

describe("Codex quota", () => {
  test("parses plan type and both windows", () => {
    expect(
      parseCodexUsageResponse({
        email: "user@example.com",
        plan_type: "plus",
        rate_limit: {
          primary_window: {
            used_percent: 4,
            limit_window_seconds: 18_000,
            reset_at: 1_788_527_571,
          },
          secondary_window: {
            used_percent: 12,
            limit_window_seconds: 604_800,
            reset_at: 1_788_768_423,
          },
        },
      }),
    ).toEqual({
      email: "user@example.com",
      planType: "plus",
      primary: {
        usedPercent: 4,
        windowDurationMins: 300,
        resetsAt: 1_788_527_571,
      },
      secondary: {
        usedPercent: 12,
        windowDurationMins: 10_080,
        resetsAt: 1_788_768_423,
      },
    });
  });

  test("formats compactly", () => {
    expect(
      formatCodexQuota({
        planType: "plus",
        primary: { usedPercent: 4, windowDurationMins: 300, resetsAt: null },
        secondary: {
          usedPercent: 12,
          windowDurationMins: 10_080,
          resetsAt: null,
        },
      }),
    ).toBe("codex plus · 5h 4% · wk 12%");
  });
});

describe("llmapi quota", () => {
  test("supports nested, flat, and plan fields", () => {
    expect(
      parseLlmQuotaResponse({
        plan: "pro",
        windows: {
          five_hour: { used: 40, limit: 100 },
          week: { usage: 2, total: 10 },
        },
      }),
    ).toEqual({
      planType: "pro",
      fiveHour: { used: 40, limit: 100, pct: 40, reset: null },
      week: { used: 2, limit: 10, pct: 20, reset: null },
    });
    expect(
      formatLlmQuota({
        planType: "pro",
        fiveHour: { used: 40, limit: 100, pct: 40, reset: null },
      }),
    ).toBe("llmapi pro · 5h 40%");
  });

  test("retries transient failures", async () => {
    const previousFetch = globalThis.fetch;
    const previousBase = process.env.ANTHROPIC_BASE_URL;
    const previousToken = process.env.ANTHROPIC_AUTH_TOKEN;
    const previousKey = process.env.ANTHROPIC_API_KEY;
    let attempts = 0;

    process.env.ANTHROPIC_BASE_URL = "https://llmapi.example";
    process.env.ANTHROPIC_AUTH_TOKEN = "test-token";
    delete process.env.ANTHROPIC_API_KEY;
    globalThis.fetch = (async () => {
      attempts++;
      if (attempts < 3) return new Response(null, { status: 503 });
      return new Response(JSON.stringify({ used_5h: 40, limit_5h: 100 }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }) as typeof fetch;

    try {
      const snapshot = await fetchLlmQuota();
      expect(attempts).toBe(3);
      expect(snapshot?.fiveHour?.pct).toBe(40);
    } finally {
      globalThis.fetch = previousFetch;
      if (previousBase === undefined) delete process.env.ANTHROPIC_BASE_URL;
      else process.env.ANTHROPIC_BASE_URL = previousBase;
      if (previousToken === undefined) delete process.env.ANTHROPIC_AUTH_TOKEN;
      else process.env.ANTHROPIC_AUTH_TOKEN = previousToken;
      if (previousKey === undefined) delete process.env.ANTHROPIC_API_KEY;
      else process.env.ANTHROPIC_API_KEY = previousKey;
    }
  });
});

describe("Kimi quota", () => {
  test("parses the weekly pool and preferred five-hour window", () => {
    const snapshot = parseKimiUsageResponse({
      user: { membership: { level: "LEVEL_INTERMEDIATE" } },
      usage: { limit: "100", used: "8", resetTime: "2026-09-08T15:22:16Z" },
      limits: [
        {
          window: { duration: 300, timeUnit: "TIME_UNIT_MINUTE" },
          detail: {
            limit: "100",
            used: "7",
            resetTime: "2026-09-04T14:22:16Z",
          },
        },
      ],
    });
    expect(snapshot?.level).toBe("LEVEL_INTERMEDIATE");
    expect(snapshot?.week?.pct).toBe(8);
    expect(snapshot?.fiveHour?.pct).toBe(7);
    expect(formatKimiQuota(snapshot)).toBe("kimi intermediate · 5h 7% · wk 8%");
  });
});

describe("GitHub Copilot quota", () => {
  test("parses premium, chat, and completion snapshots", () => {
    const snapshot = parseCopilotUsageResponse({
      copilot_plan: "pro",
      quota_reset_date: "2026-10-01",
      quota_snapshots: {
        premium_interactions: {
          entitlement: 300,
          remaining: 240,
          percent_remaining: 80,
          unlimited: false,
          overage_count: 0,
        },
        chat: {
          entitlement: 1000,
          used_requests: 50,
          remaining_percentage: 95,
          unlimited: false,
        },
        completions: {
          unlimited: true,
          remaining: 0,
          percent_remaining: 100,
        },
      },
    });
    expect(snapshot?.premium?.percentRemaining).toBe(80);
    expect(snapshot?.chat?.remaining).toBe(950);
    expect(snapshot?.completions?.unlimited).toBe(true);
    expect(formatCopilotQuota(snapshot)).toBe("gh pro · prem 80% left · chat 95% left · comp ∞");
  });
});

describe("quota bar", () => {
  test("hides provider error paths", () => {
    expect(formatLlmQuota({ error: "http 503" })).toBeUndefined();
    expect(formatKimiQuota({ error: "timeout" })).toBeUndefined();
    expect(
      formatQuotaBar({
        llmapi: { error: "http 503" },
        codex: null,
        kimi: null,
        copilot: null,
      }),
    ).toBe("");
  });

  test("keeps every configured provider", () => {
    expect(
      formatQuotaBar({
        llmapi: {
          planType: "pro",
          fiveHour: { used: 1, limit: 10, pct: 10, reset: null },
        },
        codex: {
          planType: "plus",
          primary: { usedPercent: 2, windowDurationMins: 300, resetsAt: null },
        },
        kimi: {
          week: { used: 3, limit: 10, pct: 30, reset: null, resetTime: null },
        },
        copilot: {
          planType: "pro",
          premium: {
            entitlement: 10,
            remaining: 8,
            percentRemaining: 80,
            unlimited: false,
            overageCount: 0,
          },
        },
      }),
    ).toContain("llmapi pro");
    expect(formatQuotaBar({ llmapi: null, codex: null, kimi: null, copilot: null })).toBe("");
  });
});
