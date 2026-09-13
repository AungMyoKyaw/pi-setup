import { describe, expect, test } from "bun:test";

import { lastUserPrompt, snippet } from "./index.ts";

describe("snippet", () => {
  test("collapses whitespace before returning a prompt preview", () => {
    expect(snippet("  fix\n\tthis   bug  ")).toBe("fix this bug");
  });

  test("truncates long previews with an ellipsis", () => {
    expect(snippet("123456789", 5)).toBe("1234…");
  });
});

describe("lastUserPrompt", () => {
  test("returns the latest user prompt from the active branch", () => {
    const ctx = {
      sessionManager: {
        getBranch: () => [
          { type: "message", message: { role: "user", content: "old" } },
          {
            type: "message",
            message: { role: "assistant", content: "answer" },
          },
          { type: "message", message: { role: "user", content: "latest" } },
        ],
      },
    };

    expect(lastUserPrompt(ctx)).toBe("latest");
  });

  test("joins text parts from a structured user message", () => {
    const ctx = {
      sessionManager: {
        getBranch: () => [
          {
            type: "message",
            message: {
              role: "user",
              content: [
                { type: "text", text: "first" },
                { type: "image", url: "ignored" },
                { type: "text", text: "second" },
              ],
            },
          },
        ],
      },
    };

    expect(lastUserPrompt(ctx)).toBe("first\nsecond");
  });
});
