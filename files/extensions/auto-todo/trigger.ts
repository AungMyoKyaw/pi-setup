/**
 * Trigger filter: should this `input` event create a new run folder?
 *
 * Skip conditions:
 *   - source === "extension": extension-injected messages must not recurse.
 *     Otherwise any tool that calls pi.sendMessage would spawn a fresh run
 *     for every reply.
 *   - empty / whitespace-only text: nothing to plan against.
 *   - text starts with "/": that's a slash command (built-in or registered).
 *     Commands have their own semantics; we don't want a TODO.md for "/tree".
 *   - text starts with "!": pi's bash-escape prefix. Same reasoning.
 *   - text starts with "?": pi's own quick-prefix conventions (e.g. ?quick,
 *     ?plan). Treated as command-like.
 */

export interface InputLike {
  source?: string;
  text?: string;
}

export function shouldTrigger(event: InputLike): boolean {
  if (event.source === "extension") return false;
  const text = event.text?.trim() ?? "";
  if (!text) return false;
  if (text.startsWith("/")) return false;
  if (text.startsWith("!")) return false;
  if (text.startsWith("?")) return false;
  return true;
}
