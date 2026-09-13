import { describe, expect, test } from "bun:test";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const FIXTURES_DIR = join(import.meta.dir, "fixtures");

/**
 * Canonical-good DESIGN.md fixture. Should parse cleanly, contain all
 * required sections (Overview, Colors, Typography, Layout, Components,
 * Do's and Don'ts), and reference a specific, concrete design reference
 * (per PHILOSOPHY.md).
 */
const CANONICAL_GOOD = join(FIXTURES_DIR, "canonical-good.md");

/**
 * Vague-prose DESIGN.md fixture. Should parse, but its Overview should
 * be adjective-soup with no concrete reference. Used to test that the
 * agent skill correctly pushes back on vague prose.
 */
const VAGUE_PROSE = join(FIXTURES_DIR, "vague-prose.md");

/**
 * Broken-frontmatter DESIGN.md fixture. Has an unclosed YAML string after
 * the `name:` field. Used to test that the agent skill surfaces a clear
 * error and refuses to consume, rather than parsing around the damage.
 *
 * This fixture is expected to fail YAML parsing — it is here so the
 * validator and the agent skill can be tested against a known-bad input.
 */
const BROKEN_FRONTMATTER = join(FIXTURES_DIR, "broken-frontmatter.md");

/**
 * Components-only DESIGN.md fixture. Has a rich `components:` block but
 * minimal prose in other sections. Used to test the component-builder
 * path of the agent skill.
 */
const COMPONENTS_ONLY = join(FIXTURES_DIR, "components-only.md");

/**
 * Extract frontmatter from a DESIGN.md. Returns null if frontmatter is
 * missing or malformed. Designed for fixture-shape tests; not used to
 * gate the agent's behavior on broken inputs (those tests assert the
 * fixture fails to parse).
 */
function tryGetFrontmatter(path: string): Record<string, unknown> | null {
  if (!existsSync(path)) return null;
  const content = readFileSync(path, "utf-8");
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return null;
  try {
    return Bun.YAML.parse(match[1]) as Record<string, unknown>;
  } catch {
    return null;
  }
}

describe("fixtures: existence and shape (T6)", () => {
  test("canonical-good.md exists and parses", () => {
    expect(existsSync(CANONICAL_GOOD)).toBe(true);
    const fm = tryGetFrontmatter(CANONICAL_GOOD);
    expect(fm).not.toBeNull();
    expect(fm!.name).toBeDefined();
  });

  test("vague-prose.md exists and parses", () => {
    expect(existsSync(VAGUE_PROSE)).toBe(true);
    const fm = tryGetFrontmatter(VAGUE_PROSE);
    expect(fm).not.toBeNull();
    expect(fm!.name).toBeDefined();
  });

  test("broken-frontmatter.md exists (and is intentionally unparseable)", () => {
    expect(existsSync(BROKEN_FRONTMATTER)).toBe(true);
    // The point of this fixture is that it fails to parse — that is its
    // shape. We assert that here as the contract.
    const fm = tryGetFrontmatter(BROKEN_FRONTMATTER);
    expect(fm).toBeNull();
  });

  test("components-only.md exists and parses with a rich components block", () => {
    expect(existsSync(COMPONENTS_ONLY)).toBe(true);
    const fm = tryGetFrontmatter(COMPONENTS_ONLY);
    expect(fm).not.toBeNull();
    expect(fm!.components).toBeDefined();
  });

  test("canonical-good.md Overview names a concrete reference", () => {
    const content = readFileSync(CANONICAL_GOOD, "utf-8");
    // The Overview must mention a concrete referent (a magazine, an era,
    // a genre, an object). "Modern, clean, premium" is the failure
    // shape — see vague-prose.md for the anti-example.
    const overview = content.match(/## Overview\n([\s\S]*?)(?=\n## |\n*$)/);
    expect(overview).not.toBeNull();
    const overviewText = overview![1].toLowerCase();
    // Heuristic: the overview must contain at least one hyphenated or
    // compound noun phrase that smells like a referent. A simple
    // presence check for the most common reference patterns.
    const referenceSignals = [
      /\b(19|20)\d{2}s\b/, // a decade (e.g. "1970s")
      /\b(magazine|handout|broadsheet|gallery|manuscript|lecture)\b/,
      /\b(newspaper|journal|poster|signage|packaging)\b/,
      /\b(modernist|art deco|brutalist|minimalist|classical)\b/,
    ];
    const hit = referenceSignals.some((re) => re.test(overviewText));
    expect(hit).toBe(true);
  });
});
