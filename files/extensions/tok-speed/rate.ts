/**
 * Sliding-window character rate calculator.
 *
 * Keeps a deque of {ts, count} samples within `windowMs`, prunes anything
 * older than `now - windowMs`, and reports the running rate as
 * chars/second over the surviving span. Using a span-relative denominator
 * (instead of always `windowMs`) keeps the first-second number honest
 * instead of artificially deflating it.
 */

export interface RateSample {
  ts: number;
  count: number;
}

export class RateCalculator {
  private readonly windowMs: number;
  private samples: RateSample[] = [];
  private total = 0;

  constructor(windowMs = 2000) {
    if (windowMs <= 0) throw new Error("windowMs must be > 0");
    this.windowMs = windowMs;
  }

  /** Record `count` characters at `ts` (default: Date.now()). */
  add(count: number, ts: number = Date.now()): void {
    if (count <= 0) return;
    this.samples.push({ ts, count });
    this.total += count;
  }

  /** Drop samples older than `now - windowMs`. */
  prune(now: number = Date.now()): void {
    const cutoff = now - this.windowMs;
    // Drop from the front while samples are stale. Avoids O(n) shift cost
    // on long streams because real windows stay small (a few hundred
    // samples at most at REFRESH_HZ * windowMs).
    while (this.samples.length > 0 && this.samples[0]!.ts < cutoff) {
      this.total -= this.samples[0]!.count;
      this.samples.shift();
    }
  }

  /** Characters/second over the current window. 0 when no samples survive. */
  rate(now: number = Date.now()): number {
    this.prune(now);
    if (this.samples.length === 0) return 0;
    const oldest = this.samples[0]!.ts;
    const spanSec = (now - oldest) / 1000;
    if (spanSec <= 0) return 0;
    return this.total / spanSec;
  }

  hasData(): boolean {
    return this.samples.length > 0;
  }

  reset(): void {
    this.samples = [];
    this.total = 0;
  }
}
