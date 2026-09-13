# SETUP.md — agent execution procedure

You are a coding agent with file and shell tools. The user has asked you to
configure their [pi](https://github.com/earendil-works/pi) coding agent using
this repository. This document is your operating procedure. Follow it
precisely; exercise judgment only where it says to.

The user is not necessarily the repo author. Protect the user's machine.

## Inputs

Derive these from the user's prompt:

- **REPO** — a GitHub URL of this repo, a raw URL of this file, or a local
  filesystem path to a clone.
- **PROFILE** — `minimal`, `recommended`, or `full`. If unspecified, ask the
  user once, recommending `recommended`.
- **Pre-authorization** — if the prompt says proceed / go ahead / just do it /
  yes (or similar), treat the plan as pre-approved. Otherwise present the plan
  once and wait for a single confirmation. Never ask more than one round of
  questions.

## Resolving the repo base

- Local path → read files directly from disk.
- Remote (`https://github.com/<owner>/<repo>[...]` or a raw URL) → prefer a
  shallow clone to a temp dir, then treat the clone as a local base:
  `git clone --depth 1 https://github.com/<owner>/<repo>.git /tmp/pi-setup-<utc-ts>`
  A clone enumerates directories deterministically; raw URLs cannot. Only if
  git is unavailable, fall back to fetching individual files with
  `curl -fsSL https://raw.githubusercontent.com/<owner>/<repo>/<branch>/<path>`
  (try branch `master`, then `main`).

Verify access by reading `setup.yaml` first.

## Hard rules

1. Every target path is `$HOME`-relative. Resolve `~` via `$HOME`. Never write
   outside `$HOME/.pi` and `$HOME/.agents`.
2. **Never read, print, copy, or upload**: `auth.json`, `models.json`,
   `models-store.json`, `trust.json`, `spend-state.json`, `run-history.jsonl`,
   `sessions/`, `memory/journal/`, any `*.pem`/`*.key`. If a plan step would
   touch one, skip it and note it.
3. Before overwriting anything, back it up:
   `~/.pi-setup-backups/<UTC-timestamp>/<original-path-relative-to-HOME>`.
4. Never initialize git repos, commit, or push anywhere.
5. If a step fails, record it, continue with the rest, report it at the end.
   Never silently skip.
6. Do not print file contents that could contain user data. Report paths and
   actions, not contents.

## Procedure

### 1. Preflight

- Check `pi --version`. If missing: tell the user to install pi first
  (see the pi repo README) and stop.
- Check `git --version`, `bun --version`, `python3 --version` — note which
  are missing; they only gate optional components (see `requires:` in the
  manifest). Do not install system tools without the user asking.
- Note the OS (`uname -s`).
- Note whether `~/.pi` and `~/.agents` already exist (fresh vs. adoption).

### 2. Load the manifest

Read `setup.yaml`. Resolve PROFILE to a component list. Read each source file
you will need (from disk or raw base).

### 3. Plan

Produce a concise table: one row per target path with its action —
`create`, `merge`, `copy`, `skip (exists)`, or `skip (missing dep)`.
Show it unless pre-authorized.

### 4. Apply

In this order: `settings` → `parallel-tools` → `prompts` → `agents-base` →
`soul` → extensions → skills.

- **deep-merge** (settings): parse target JSON (or `{}` if absent) and source
  JSON. Merge recursively: objects merge key-by-key; scalars and arrays from
  the source replace the target; keys present only in the target survive.
  Back up the original, then write pretty-printed (2-space indent).
- **copy** (prompts, parallel-tools): back up existing targets, then copy.
- **skip-if-exists** (agents-base, soul): copy only if the target does not
  exist. Existing identity/memory files belong to the user — never overwrite.
- **extension**: copy `files/extensions/_shared` (if listed) and each listed
  extension into `~/.pi/agent/extensions/`, backing up existing dirs. Then,
  in each installed extension dir that contains a `package.json`, run
  `bun install`. pi auto-discovers extensions in this directory at startup.
  If a copied `tsconfig.json` contains `~/.bun/...` type paths, optionally
  rewrite them to the machine's real global pi install path (`bun root -g`).
- **skill**: copy each listed skill dir into `~/.agents/skills/`, backing up
  existing dirs. pi auto-discovers skills here.

### 5. Verify

Follow `VERIFY.md`. Run every check that applies; record results.

### 6. Report

Concise summary:

- Table: component → applied / merged / skipped (existed) / failed, with
  backup location for anything overwritten.
- Missing optional prerequisites and what they gate.
- Next steps for the user:
  - If no provider auth exists: run pi and use `/login` (or set an API-key
    env var), then review `defaultProvider`/`defaultModel` in
    `~/.pi/agent/settings.json`.
  - Restart pi for extensions and skills to load.
- Anything you skipped under hard rule 2.
