import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const SKILL_PATH = join(import.meta.dir, "..", "SKILL.md");

/**
 * Read the SKILL.md file once per test run. Imported by every test in this
 * suite. Returns the raw file contents.
 */
function readSkill(): string {
  return readFileSync(SKILL_PATH, "utf-8");
}

/**
 * Extract the YAML frontmatter block from a SKILL.md file and parse it.
 * Throws if the frontmatter is missing or malformed.
 */
function getFrontmatter(content: string): Record<string, unknown> {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) {
    throw new Error("SKILL.md is missing YAML frontmatter (--- fences)");
  }
  return Bun.YAML.parse(match[1]) as Record<string, unknown>;
}

/**
 * Return all `## <heading>` lines from a SKILL.md body, in document order.
 * Used by the body-section tests in T3.
 */
function getBodyHeadings(content: string): string[] {
  return content
    .split("\n")
    .filter((line) => /^##\s+/.test(line))
    .map((line) => line.replace(/^##\s+/, "").trim());
}

/**
 * Return the raw description field from the frontmatter. Used by the
 * trigger-surface tests in T2.
 */
function getDescription(content: string): string {
  const fm = getFrontmatter(content);
  const desc = fm.description;
  if (typeof desc !== "string" || desc.length === 0) {
    throw new Error("SKILL.md frontmatter is missing a non-empty description field");
  }
  return desc;
}

export { readSkill, getFrontmatter, getBodyHeadings, getDescription };

describe("validator: description trigger coverage (T2)", () => {
  const REQUIRED_PHRASES = [
    "DESIGN.md", // the format itself
    "design system", // topic phrase
  ];

  const ACTION_VERBS = ["build", "generate", "author", "draft", "restyle"];

  const CLI_VERBS = ["lint", "diff", "export"];

  test("description names the DESIGN.md format", () => {
    const desc = getDescription(readSkill());
    for (const phrase of REQUIRED_PHRASES) {
      expect(desc.toLowerCase()).toContain(phrase.toLowerCase());
    }
  });

  test("description mentions at least one UI-generation action verb", () => {
    const desc = getDescription(readSkill()).toLowerCase();
    const hit = ACTION_VERBS.some((verb) => desc.includes(verb));
    expect(hit).toBe(true);
  });

  test("description mentions at least one CLI verb (lint/diff/export)", () => {
    const desc = getDescription(readSkill()).toLowerCase();
    const hit = CLI_VERBS.some((verb) => desc.includes(verb));
    expect(hit).toBe(true);
  });
});

describe("validator: required body sections (T3)", () => {
  const REQUIRED_HEADINGS = [
    "The thesis", // prose-first thesis statement
    "Mode 1 — CONSUME", // build-UI mode
    "Mode 2 — AUTHOR", // draft-DESIGN.md mode
    "Mode 3 — AUDIT", // lint/diff/drift mode
    "Prose checklist", // before-writing-prose checklist
  ];

  for (const heading of REQUIRED_HEADINGS) {
    test(`body contains "${heading}" as a section heading`, () => {
      const headings = getBodyHeadings(readSkill());
      expect(headings.some((h) => h.includes(heading))).toBe(true);
    });
  }
});

describe("validator: SKILL.md frontmatter (T1)", () => {
  test("SKILL.md exists at the canonical path and is non-empty", () => {
    const content = readSkill();
    expect(content.length).toBeGreaterThan(0);
  });

  test("frontmatter parses as YAML", () => {
    const content = readSkill();
    // Must not throw — getFrontmatter throws on malformed frontmatter.
    const fm = getFrontmatter(content);
    expect(typeof fm).toBe("object");
    expect(fm).not.toBeNull();
  });

  test("frontmatter declares name: design-md", () => {
    const content = readSkill();
    const fm = getFrontmatter(content);
    expect(fm.name).toBe("design-md");
  });
});
