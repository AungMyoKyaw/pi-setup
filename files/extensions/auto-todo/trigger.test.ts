/**
 * Tests for trigger.ts: the input-event filter that decides whether a
 * given user submission should create a new run folder.
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { shouldTrigger } from "./trigger.ts";

test("plain user text triggers", () => {
  assert.equal(shouldTrigger({ source: "user", text: "fix the login bug" }), true);
});

test("undefined source defaults to triggering", () => {
  assert.equal(shouldTrigger({ text: "hello" }), true);
});

test("extension source never triggers (avoid recursion)", () => {
  assert.equal(shouldTrigger({ source: "extension", text: "anything" }), false);
});

test("empty text never triggers", () => {
  assert.equal(shouldTrigger({ text: "" }), false);
  assert.equal(shouldTrigger({ text: "   " }), false);
  assert.equal(shouldTrigger({ text: "\n\t  " }), false);
});

test("undefined text never triggers", () => {
  assert.equal(shouldTrigger({}), false);
  assert.equal(shouldTrigger({ source: "user" }), false);
});

test("slash-prefixed text never triggers (built-in / registered commands)", () => {
  assert.equal(shouldTrigger({ text: "/tree" }), false);
  assert.equal(shouldTrigger({ text: "/reload" }), false);
  assert.equal(shouldTrigger({ text: "/todo" }), false);
});

test("bash-escape prefix never triggers", () => {
  assert.equal(shouldTrigger({ text: "!ls -la" }), false);
  assert.equal(shouldTrigger({ text: "!git status" }), false);
});

test("question-mark prefix never triggers (pi's ?quick/?plan conventions)", () => {
  assert.equal(shouldTrigger({ text: "?quick summarize X" }), false);
  assert.equal(shouldTrigger({ text: "?plan do Z" }), false);
});

test("leading whitespace before slash is still a command — skipping", () => {
  // Trim first, so the user can't bypass the filter with a leading space.
  assert.equal(shouldTrigger({ text: "  /tree" }), false);
});

test("leading whitespace before plain text still triggers after trim", () => {
  assert.equal(shouldTrigger({ text: "  hello  " }), true);
});
