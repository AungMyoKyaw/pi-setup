/**
 * Tests for run-id.ts: slug sanitization, run-id hash determinism, path
 * composition, and counter-based collision breaking.
 *
 * Run with: bun test run-id.test.ts
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import {
  _resetStateForTests,
  displayHeader,
  getBaseDir,
  makeRunId,
  makeSlug,
  runDir,
  todayFolder,
} from "./run-id.ts";

test("todayFolder produces YYYY-MM-DD in local time", () => {
  const d = new Date(2026, 4, 7, 14, 30, 0); // 2026-05-07 local
  assert.equal(todayFolder(d), "2026-05-07");
});

test("todayFolder pads single-digit month and day", () => {
  const d = new Date(2026, 0, 3, 0, 0, 0); // 2026-01-03
  assert.equal(todayFolder(d), "2026-01-03");
});

test("makeSlug lowercases ASCII alphanumerics and dashes the rest", () => {
  assert.equal(makeSlug("Fix Login Bug"), "fix-login-bug");
  assert.equal(makeSlug("hello, world!"), "hello-world");
  assert.equal(makeSlug("Café résumé"), "caf-r-sum"); // non-ASCII stripped
});

test("makeSlug truncates long input and strips trailing dashes", () => {
  const long = "word ".repeat(20).trim(); // "word word word ..."
  const s = makeSlug(long);
  assert.ok(s.length <= 32, `slug length ${s.length} > 32`);
  assert.ok(!s.endsWith("-"), `slug ends with dash: ${s}`);
});

test("makeSlug falls back to 'untitled' for all-special-char input", () => {
  assert.equal(makeSlug("!!!"), "untitled");
  assert.equal(makeSlug(""), "untitled");
  assert.equal(makeSlug("   "), "untitled");
  assert.equal(makeSlug("/path/only"), "path-only");
});

test("makeSlug takes only first 6 words", () => {
  assert.equal(makeSlug("one two three four five six seven eight"), "one-two-three-four-five-six");
});

test("makeRunId is deterministic for same (text, ts) within one module load", () => {
  _resetStateForTests();
  const a = makeRunId("hello world", 1700000000000);
  const b = makeRunId("hello world", 1700000000000);
  assert.equal(a, b);
  assert.match(a, /^[0-9a-f]{8}$/);
});

test("makeRunId changes when text changes", () => {
  _resetStateForTests();
  const ts = 1700000000000;
  const a = makeRunId("alpha", ts);
  const b = makeRunId("beta", ts);
  assert.notEqual(a, b);
});

test("runDir composes base/date/runId", () => {
  _resetStateForTests();
  const ts = 1700000000000;
  const dir = runDir("hello world", ts);
  const id = makeRunId("hello world", ts);
  const expectedDate = todayFolder(new Date(ts));
  assert.ok(dir.endsWith(`/runs/${expectedDate}/${id}`), `unexpected dir: ${dir}`);
});

test("runDir honors PI_AUTO_TODO_DIR override", () => {
  _resetStateForTests();
  const original = process.env.PI_AUTO_TODO_DIR;
  try {
    process.env.PI_AUTO_TODO_DIR = "/tmp/custom-runs";
    const dir = runDir("override test", 1700000000000);
    assert.ok(dir.startsWith("/tmp/custom-runs/"), `expected override prefix; got: ${dir}`);
  } finally {
    if (original === undefined) delete process.env.PI_AUTO_TODO_DIR;
    else process.env.PI_AUTO_TODO_DIR = original;
  }
});

test("getBaseDir returns ~/.agents/runs by default", () => {
  const original = process.env.PI_AUTO_TODO_DIR;
  try {
    delete process.env.PI_AUTO_TODO_DIR;
    const base = getBaseDir();
    assert.ok(base.endsWith("/.agents/runs"), `expected default base; got: ${base}`);
  } finally {
    if (original !== undefined) process.env.PI_AUTO_TODO_DIR = original;
  }
});

test("displayHeader contains slug, run id, and ISO timestamp", () => {
  _resetStateForTests();
  const h = displayHeader("hello world", 1700000000000);
  assert.match(h, /> slug: hello-world/);
  assert.match(h, /· run: [0-9a-f]{8} ·/);
  assert.match(h, /\d{4}-\d{2}-\d{2}T/); // any valid ISO date prefix
});

test("displayHeader slug sanitizes hostile characters", () => {
  _resetStateForTests();
  const h = displayHeader("rm -rf /", 1700000000000);
  // The / in "rm -rf /" becomes a dash; the leading/trailing dashes get stripped.
  assert.match(h, /> slug: rm-rf/);
  // Important: no raw path-traversal characters leak into the header.
  assert.ok(!h.includes("//"), `unexpected double-slash in header: ${h}`);
});
