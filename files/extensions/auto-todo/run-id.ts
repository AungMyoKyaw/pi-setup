/**
 * Run id, slug, and path helpers.
 *
 * Each user prompt that passes the trigger filter gets its own run folder:
 *
 *   ${PI_AUTO_TODO_DIR | ~/.agents/runs}/<YYYY-MM-DD>/<run-id>/
 *
 * The run id is a deterministic 8-char hex prefix of sha256(timestamp || counter || text).
 * The counter disambiguates rapid same-millisecond re-submissions within a session.
 * Determinism lets us reproduce the path on resume; idempotency (extension checks
 * for existing files before writing) keeps re-submission safe.
 */

import { createHash } from "node:crypto";
import { homedir } from "node:os";
import { join } from "node:path";

/** Default base directory: ~/.agents/runs. Overridable via PI_AUTO_TODO_DIR. */
const DEFAULT_BASE_DIR = join(homedir(), ".agents", "runs");

/**
 * Return the configured base directory for run folders.
 * Reads PI_AUTO_TODO_DIR each call so a /reload picks up changes.
 */
export function getBaseDir(): string {
  return process.env.PI_AUTO_TODO_DIR ?? DEFAULT_BASE_DIR;
}

/**
 * Format a Date as `YYYY-MM-DD` in local time. Local because the runs
 * folder groups by the user's day, not by UTC day — a request at 23:55
 * should sit next to one at 00:05 the next morning if the user thinks of
 * them as the same night.
 */
export function todayFolder(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * 8-char hex prefix of sha256(ts || text). Deterministic over (text, ts),
 * so the run path can be re-derived later (debugging, replay). True
 * same-millisecond-same-text collisions are extraordinarily rare in
 * human-typed input; the extension's idempotent `existsSync` check makes
 * them harmless anyway (we just reuse the existing folder).
 */
export function makeRunId(text: string, ts: number = Date.now()): string {
  const h = createHash("sha256");
  h.update(String(ts));
  h.update("\0");
  h.update(text);
  return h.digest("hex").slice(0, 8);
}

/**
 * Sanitize text into a filesystem-friendly slug: lowercase, ASCII
 * alphanumerics + dashes, max 32 chars, leading/trailing dashes stripped.
 * Empty result falls back to "untitled" so we never produce an empty path
 * segment.
 */
export function makeSlug(text: string, maxLen: number = 32): string {
  const words = text.trim().split(/\s+/).slice(0, 6);
  const joined = words.join(" ").toLowerCase();
  let slug = joined
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, maxLen)
    .replace(/-+$/, "");
  return slug || "untitled";
}

/**
 * Absolute path to the run folder for a given prompt + timestamp.
 * `${baseDir}/${YYYY-MM-DD}/${runId}/`
 */
export function runDir(text: string, ts: number = Date.now()): string {
  return join(getBaseDir(), todayFolder(new Date(ts)), makeRunId(text, ts));
}

/**
 * The header line stamped into TODO.md, PLAN.md, and outcome.md so a
 * reader can identify the run from inside the file without consulting the
 * path. Format:
 *
 *   > slug: <slug> · run: <runId> · <iso-ts>
 */
export function displayHeader(text: string, ts: number = Date.now()): string {
  const slug = makeSlug(text);
  const id = makeRunId(text, ts);
  const iso = new Date(ts).toISOString();
  return `> slug: ${slug} · run: ${id} · ${iso}`;
}

/**
 * Reset module-level state. Currently a no-op (kept for backwards
 * compatibility with tests that called it when run-id had a counter).
 * Test-only — production callers should never invoke it.
 */
export function _resetStateForTests(): void {
  // No module-level mutable state remains after the counter removal.
}
