const ANSI_RE = /\x1b\[[0-9;]*m/g;

function visibleWidth(text: string): number {
  return text.replace(ANSI_RE, "").length;
}

function truncateToWidth(text: string, width: number): string {
  if (width <= 0) return "";
  if (visibleWidth(text) <= width) return text;

  let output = "";
  let visible = 0;
  let match: RegExpExecArray | null;
  let index = 0;
  const ansi = new RegExp(ANSI_RE.source, "g");

  while ((match = ansi.exec(text)) !== null) {
    for (const char of text.slice(index, match.index)) {
      if (visible >= width) return `${output}\x1b[0m`;
      output += char;
      visible++;
    }
    output += match[0];
    index = match.index + match[0].length;
  }

  for (const char of text.slice(index)) {
    if (visible >= width) break;
    output += char;
    visible++;
  }
  return `${output}\x1b[0m`;
}

export type CompactFooterTheme = {
  fg: (color: "muted" | "warning" | "error", text: string) => string;
};

export type CompactFooterData = {
  location: string;
  fullStats: string;
  compactStats: string;
  contextDisplay: string;
  contextPercent: number;
  model: string;
  modelWithoutProvider: string;
  requestTime?: string;
};

export function formatDuration(durationMs: number): string {
  const totalSeconds = Math.max(0, Math.floor(durationMs / 1000));
  if (totalSeconds < 60) return `${totalSeconds}s`;

  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes < 60) return `${minutes}m${String(seconds).padStart(2, "0")}s`;

  const hours = Math.floor(minutes / 60);
  return `${hours}h${String(minutes % 60).padStart(2, "0")}m${String(
    seconds,
  ).padStart(2, "0")}s`;
}

function joinParts(parts: string[]): string {
  return parts.filter(Boolean).join("  ");
}

function styleText(text: string, theme: CompactFooterTheme): string {
  return text ? theme.fg("muted", text) : "";
}

function styleContext(
  contextDisplay: string,
  contextPercent: number,
  theme: CompactFooterTheme,
): string {
  if (contextPercent > 90) return theme.fg("error", contextDisplay);
  if (contextPercent > 70) return theme.fg("warning", contextDisplay);
  return theme.fg("muted", contextDisplay);
}

function alignFooterSides(
  left: string,
  right: string,
  width: number,
): string | undefined {
  const gap = width - visibleWidth(left) - visibleWidth(right);
  if (gap < 2) return undefined;
  return `${left}${" ".repeat(gap)}${right}`;
}

/** Render the footer as a readable, responsive left/right status line. */
export function formatCompactFooter(
  data: CompactFooterData,
  width: number,
  theme: CompactFooterTheme,
): string[] {
  // Keep routine metadata quiet so it does not compete with the conversation.
  // Context usage becomes warning/error-colored as it rises.
  const location = styleText(data.location, theme);
  const fullStats = styleText(data.fullStats, theme);
  const compactStats = styleText(data.compactStats, theme);
  const context = styleContext(data.contextDisplay, data.contextPercent, theme);
  const model = styleText(data.model, theme);
  const modelWithoutProvider = styleText(data.modelWithoutProvider, theme);
  const requestTime = styleText(data.requestTime ?? "", theme);
  const locationWithTime = joinParts([location, requestTime]);

  const leftWithFullStats = joinParts([location, fullStats, requestTime]);
  const leftWithCompactStats = joinParts([location, compactStats, requestTime]);
  const rightWithModel = joinParts([context, model]);
  const rightWithoutProvider = joinParts([context, modelWithoutProvider]);

  // Wide terminals get a true two-sided layout. Each fallback drops the least
  // important detail before falling back to a compact, left-aligned line.
  const sideCandidates: Array<[string, string]> = [
    [leftWithFullStats, rightWithModel],
    [leftWithFullStats, rightWithoutProvider],
    [leftWithCompactStats, rightWithModel],
    [leftWithCompactStats, rightWithoutProvider],
    [locationWithTime, rightWithoutProvider],
    [leftWithFullStats, context],
    [leftWithCompactStats, context],
    [locationWithTime, modelWithoutProvider],
    [locationWithTime, context],
  ];

  for (const [left, right] of sideCandidates) {
    const line = alignFooterSides(left, right, width);
    if (line !== undefined) return [line];
  }

  const compactCandidates = [
    joinParts([leftWithFullStats, rightWithModel]),
    joinParts([leftWithFullStats, rightWithoutProvider]),
    joinParts([leftWithCompactStats, rightWithModel]),
    joinParts([leftWithCompactStats, rightWithoutProvider]),
    joinParts([locationWithTime, rightWithoutProvider]),
    joinParts([leftWithCompactStats, context]),
    joinParts([locationWithTime, modelWithoutProvider]),
    joinParts([locationWithTime, context]),
    locationWithTime,
  ];

  const line =
    compactCandidates.find((candidate) => visibleWidth(candidate) <= width) ??
    truncateToWidth(compactCandidates.at(-1) ?? "", width);
  return [line];
}
