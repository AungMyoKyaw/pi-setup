import { describe, expect, test } from "bun:test";
import { formatCompactFooter, formatDuration, type CompactFooterData } from "./format";

const colorCodes: Record<string, string> = {
  muted: "90",
  text: "37",
  warning: "33",
};

const theme = {
  fg: (color: string, text: string) => `\x1b[${colorCodes[color] ?? "37"}m${text}\x1b[0m`,
};

const data: CompactFooterData = {
  location: "~/.pi (master)",
  fullStats: "$0.000 (sub)",
  compactStats: "$0.000 (sub)",
  contextDisplay: "0.0%/272k (auto)",
  contextPercent: 0,
  model: "(openai-codex) gpt-5.6-luna • xhigh",
  modelWithoutProvider: "gpt-5.6-luna • xhigh",
};

const plain = (line: string) => line.replace(/\x1b\[[0-9;]*m/g, "");

describe("compact footer", () => {
  test("aligns location/stats left and context/model right", () => {
    const lines = formatCompactFooter(data, 120, theme);
    const line = plain(lines[0]!);
    const right = "0.0%/272k (auto)  (openai-codex) gpt-5.6-luna • xhigh";

    expect(lines).toHaveLength(1);
    expect(line.startsWith("~/.pi (master)  $0.000 (sub)")).toBe(true);
    expect(line.endsWith(right)).toBe(true);
    expect(line.length).toBe(120);
    expect(line.indexOf(right)).toBe(120 - right.length);
  });

  test("uses muted color for routine footer metadata", () => {
    const line = formatCompactFooter(data, 120, theme)[0]!;

    expect(line).toContain("\x1b[90m~/.pi (master)\x1b[0m");
    expect(line).toContain("\x1b[90m0.0%/272k (auto)\x1b[0m");
    expect(line).toContain("\x1b[90m(openai-codex) gpt-5.6-luna • xhigh\x1b[0m");
  });

  test("drops the provider before using the two-sided layout on a narrower terminal", () => {
    const lines = formatCompactFooter(data, 80, theme);
    const line = plain(lines[0]!);
    const right = "0.0%/272k (auto)  gpt-5.6-luna • xhigh";

    expect(lines).toHaveLength(1);
    expect(line.startsWith("~/.pi (master)  $0.000 (sub)")).toBe(true);
    expect(line.endsWith(right)).toBe(true);
    expect(line.length).toBe(80);
  });

  test("keeps context and model when stats no longer fit", () => {
    const lines = formatCompactFooter(data, 60, theme);
    const line = plain(lines[0]!);
    const right = "0.0%/272k (auto)  gpt-5.6-luna • xhigh";

    expect(lines).toHaveLength(1);
    expect(line.startsWith("~/.pi (master)")).toBe(true);
    expect(line).not.toContain("$0.000 (sub)");
    expect(line.endsWith(right)).toBe(true);
    expect(line.length).toBe(60);
  });

  test("uses semantic warning color for high context usage", () => {
    const lines = formatCompactFooter(
      { ...data, contextPercent: 75, contextDisplay: "75.0%/272k (auto)" },
      120,
      theme,
    );

    expect(lines[0]).toContain("\x1b[33m75.0%/272k (auto)\x1b[0m");
  });

  test("shows the latest request duration", () => {
    const line = plain(formatCompactFooter({ ...data, requestTime: "⏱ 12s" }, 120, theme)[0]!);

    expect(line).toContain("~/.pi (master)  $0.000 (sub)  ⏱ 12s");
  });

  test("formats request durations across time scales", () => {
    expect(formatDuration(0)).toBe("0s");
    expect(formatDuration(59_999)).toBe("59s");
    expect(formatDuration(60_000)).toBe("1m00s");
    expect(formatDuration(3_723_000)).toBe("1h02m03s");
    expect(formatDuration(-1)).toBe("0s");
  });

  test("never exceeds a tight terminal width", () => {
    for (const width of [0, 1, 5, 14, 20, 40, 60, 80, 120]) {
      const line = plain(formatCompactFooter(data, width, theme)[0]!);
      expect(line.length).toBeLessThanOrEqual(width);
    }
  });
});
