import { describe, expect, test } from "bun:test";
import { RateCalculator, tokensPerSecond } from "./rate";

describe("tokensPerSecond", () => {
  test("uses wall-clock end time instead of provider creation timestamp", () => {
    expect(tokensPerSecond(120, 1_000, 4_000)).toBe(40);
  });

  test("returns null when timing or output is unusable", () => {
    expect(tokensPerSecond(0, 1_000, 4_000)).toBeNull();
    expect(tokensPerSecond(120, undefined, 4_000)).toBeNull();
    expect(tokensPerSecond(120, 4_000, 1_000)).toBeNull();
  });
});

describe("RateCalculator", () => {
  test("empty calculator reports 0", () => {
    const r = new RateCalculator(1000);
    expect(r.rate(0)).toBe(0);
  });

  test("zero or negative adds are ignored", () => {
    const r = new RateCalculator(1000);
    r.add(0, 0);
    r.add(-5, 0);
    expect(r.hasData()).toBe(false);
  });

  test("single sample spans from its own timestamp", () => {
    const r = new RateCalculator(2000);
    r.add(100, 1000); // 100 chars at t=1000ms
    // 0.5s later: 100 chars / 0.5s = 200 chars/s
    expect(r.rate(1500)).toBeCloseTo(200, 5);
  });

  test("constant rate over a window", () => {
    const r = new RateCalculator(1000);
    // 10 chars every 100ms for 1s = 100 chars/s.
    // Query at exactly the window edge so the denominator is a clean 1s.
    for (let t = 0; t < 1000; t += 100) r.add(10, t);
    expect(r.rate(1000)).toBeCloseTo(100, 5);
  });

  test("old samples are pruned out of the window", () => {
    const r = new RateCalculator(500);
    r.add(1000, 0); // huge burst at t=0
    r.add(10, 600); // tiny at t=600
    // At t=1000: only the t=600 sample survives. 10 chars / 0.4s = 25
    expect(r.rate(1000)).toBeCloseTo(25, 5);
  });

  test("all samples expired -> rate 0", () => {
    const r = new RateCalculator(500);
    r.add(100, 0);
    // well past the window
    expect(r.rate(10_000)).toBe(0);
    expect(r.hasData()).toBe(false);
  });

  test("reset clears state", () => {
    const r = new RateCalculator(1000);
    r.add(100, 0);
    r.reset();
    expect(r.rate(500)).toBe(0);
    expect(r.hasData()).toBe(false);
  });

  test("constructor rejects non-positive window", () => {
    expect(() => new RateCalculator(0)).toThrow();
    expect(() => new RateCalculator(-1)).toThrow();
  });

  test("rate reflects a burst that is mid-window", () => {
    const r = new RateCalculator(2000);
    // 200 chars in one burst at t=0
    r.add(200, 0);
    // At t=500: 200 / 0.5 = 400 chars/s
    expect(r.rate(500)).toBeCloseTo(400, 5);
    // At t=2000 (window edge): the burst is exactly at cutoff, still kept
    // because prune uses strict < . 200 / 2 = 100 chars/s
    expect(r.rate(2000)).toBeCloseTo(100, 5);
    // At t=2001: pruned, rate 0
    expect(r.rate(2001)).toBe(0);
  });
});
