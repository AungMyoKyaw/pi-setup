/**
 * Token Speed Extension for pi
 *
 * Live output throughput in the footer (via setStatus) while the model is
 * streaming. During a stream the reading is characters/second over a 2s
 * sliding window (the standard cheap proxy for token throughput). When the
 * stream ends, the reading is FROZEN at the real `usage.output` tokens
 * divided by wall-clock stream duration — so the value you see at rest is
 * the actual tok/s, not an estimate. The frozen value persists at rest
 * until the next assistant message_start.
 *
 * Counts characters from text_delta + thinking_delta + toolcall_delta
 * events. Footer refresh is throttled to 4Hz regardless of chunk arrival
 * rate. Decays to 0 during stalls (honest window math).
 *
 * IMPORTANT — footer compatibility:
 * The status flows through `getExtensionStatuses()`. The built-in pi footer
 * renders extension statuses automatically. If you install a CUSTOM footer
 * extension (e.g. `compact-footer`) it MUST read
 * `footerData.getExtensionStatuses()` and render them, otherwise this pill
 * will not appear. `compact-footer` is patched to do this.
 *
 * Events used: session_start, session_shutdown, message_start,
 * message_update, message_end.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { RateCalculator } from "./rate";

const STATUS_KEY = "tok-speed";
const WINDOW_MS = 2000;
const REFRESH_HZ = 4;

type UiCtx = {
  ui: {
    setStatus: (key: string, value: string | undefined) => void;
    theme: { fg: (role: string, text: string) => string };
  };
};

function formatRate(rps: number): string {
  if (rps >= 100) return `${rps.toFixed(0)} tok/s`;
  if (rps >= 10) return `${rps.toFixed(1)} tok/s`;
  return `${rps.toFixed(2)} tok/s`;
}

interface FrozenReading {
  /** Pre-formatted string for the status pill. */
  label: string;
}

export default function (pi: ExtensionAPI) {
  const calc = new RateCalculator(WINDOW_MS);
  let refreshTimer: ReturnType<typeof setInterval> | null = null;
  // True between assistant message_start and message_end.
  let streaming = false;
  // Wall-clock start of the current stream — used to compute the real tok/s
  // from `usage.output` at message_end. Undefined outside a stream.
  let streamStartedAt: number | undefined;
  // Persists at rest until the next assistant message_start overwrites it.
  let frozen: FrozenReading | null = null;

  const stopTicker = (): void => {
    if (refreshTimer !== null) {
      clearInterval(refreshTimer);
      refreshTimer = null;
    }
  };

  const paint = (ctx: UiCtx): void => {
    // Before the first assistant message of the session there is nothing
    // to show — keep the pill off so it doesn't read "0.00 tok/s" forever.
    if (!streaming && frozen === null) {
      ctx.ui.setStatus(STATUS_KEY, undefined);
      return;
    }
    const label = streaming
      ? formatRate(calc.rate())
      : (frozen?.label ?? formatRate(0));
    // Decay to zero: when the rolling window empties mid-stream, rps hits
    // 0 and we still render "0.00 tok/s" rather than hiding the pill.
    ctx.ui.setStatus(STATUS_KEY, ctx.ui.theme.fg("dim", label));
  };

  // Compute real tokens/sec from provider-reported `usage.output` and the
  // wall-clock stream duration. Caller must have already narrowed
  // `event.message` to AssistantMessage (role === "assistant").
  const realTokensPerSecond = (message: {
    usage?: { output?: number };
    timestamp: number;
  }): number | null => {
    if (streamStartedAt === undefined) return null;
    const outputTokens = message.usage?.output ?? 0;
    if (outputTokens <= 0) return null;
    const elapsedSec = (message.timestamp - streamStartedAt) / 1000;
    if (elapsedSec <= 0) return null;
    return outputTokens / elapsedSec;
  };

  pi.on("session_start", async (_event, ctx) => {
    frozen = null;
    streaming = false;
    streamStartedAt = undefined;
    calc.reset();
    stopTicker();
    ctx.ui.setStatus(STATUS_KEY, undefined);
  });

  // Defensive: kill the ticker on reload/shutdown so we don't leak an
  // interval pointing at a stale `ctx`.
  pi.on("session_shutdown", async () => {
    stopTicker();
  });

  pi.on("message_start", async (event, ctx) => {
    if (event.message.role !== "assistant") return;
    // New assistant message: reset the rolling window, start the wall clock
    // for the real-tok/s freeze calculation, and show the pill reading 0
    // until the first delta lands.
    streaming = true;
    streamStartedAt = Date.now();
    frozen = null;
    calc.reset();
    paint(ctx);
  });

  pi.on("message_update", async (event, ctx) => {
    if (!streaming) return;
    const ev = event.assistantMessageEvent;
    if (!ev) return;

    // Stream-level terminal failure (network error, provider 5xx, abort).
    // The runtime will follow with message_end; stop the ticker so we
    // don't paint stale readings, but don't blank the pill — message_end
    // owns the final freeze.
    if (ev.type === "error") {
      stopTicker();
      return;
    }

    // TypeScript narrows the union on `type`; `delta` is required on each
    // of these three variants, so no `?? ""` fallback is needed.
    let chars = 0;
    if (ev.type === "text_delta") chars = ev.delta.length;
    else if (ev.type === "thinking_delta") chars = ev.delta.length;
    else if (ev.type === "toolcall_delta") chars = ev.delta.length;
    if (chars <= 0) return;

    calc.add(chars);

    if (refreshTimer === null) {
      const intervalMs = Math.max(1, Math.round(1000 / REFRESH_HZ));
      refreshTimer = setInterval(() => paint(ctx), intervalMs);
    }
  });

  pi.on("message_end", async (event, ctx) => {
    if (event.message.role !== "assistant") return;
    // Freeze the final reading. Prefer the real token rate (output tokens
    // reported by the provider divided by wall-clock stream duration) over
    // the rolling char estimate — it's the truthful number for the just-
    // completed turn. Fall back to the rolling reading if usage is absent
    // (e.g. some compaction/branch-summary paths don't report output
    // tokens, or the stream started with no measurable elapsed time).
    streaming = false;
    streamStartedAt = undefined;
    const real = realTokensPerSecond(event.message);
    const label = real !== null ? formatRate(real) : formatRate(calc.rate());
    frozen = { label };
    calc.reset();
    paint(ctx);
    stopTicker();
  });
}
