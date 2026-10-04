#!/usr/bin/env bash
# smoke.sh — exercise setup.yaml full profile against a scratch HOME.
# Mirrors SETUP.md procedure 4 (Apply). Run from repo root.
#
# Usage: ./scripts/smoke.sh [/path/to/scratch-home]
# Default scratch: /tmp/pi-setup-smoke-<utc-ts>
#
# Exits 0 if the install reproduces the expected layout (extensions,
# skills, prompts, settings merge, AGENTS.md symlink, bun-installed
# extension deps). Prints a final report.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SCRATCH="${1:-/tmp/pi-setup-smoke-$(date -u +%Y%m%dT%H%M%SZ)}"
TS="$(date -u +%Y%m%dT%H%M%SZ)"
BACKUP="$SCRATCH/.pi-setup-backups/$TS"
mkdir -p "$SCRATCH" "$BACKUP"
export HOME="$SCRATCH"

# Pretend pi has already initialized its dirs (it creates them on first
# run). The install step needs these parents to exist.
mkdir -p "$HOME/.pi/agent" "$HOME/.agents"

echo ">>> HOME=$SCRATCH  REPO=$REPO_ROOT  BACKUP=$BACKUP"

# --- 1. settings (deep-merge) ---
SRC="$REPO_ROOT/files/settings.json"
DST="$HOME/.pi/agent/settings.json"
[ -f "$DST" ] && mkdir -p "$BACKUP/.pi/agent" && cp "$DST" "$BACKUP/.pi/agent/settings.json"
python3 - "$SRC" "$DST" <<'PY'
import json, os, sys
src_path, dst_path = sys.argv[1], sys.argv[2]
src = json.load(open(src_path))
tgt = json.load(open(dst_path)) if os.path.exists(dst_path) else {}
def merge(t, s):
    for k, v in s.items():
        if k in t and isinstance(t[k], dict) and isinstance(v, dict):
            t[k] = merge(t[k], v)
        else:
            t[k] = v
    return t
out = merge(tgt, src)
os.makedirs(os.path.dirname(dst_path), exist_ok=True)
json.dump(out, open(dst_path, 'w'), indent=2)
PY

# --- 2. parallel-tools (copy) ---
cp "$REPO_ROOT/files/parallel-tools.json" "$HOME/.pi/agent/parallel-tools.json"

# --- 3. prompts (copy) ---
mkdir -p "$HOME/.pi/agent/prompts"
for f in "$REPO_ROOT"/files/prompts/*.md; do
  cp "$f" "$HOME/.pi/agent/prompts/$(basename "$f")"
done

# --- 4. agents-base (skip-if-exists + symlink) ---
mkdir -p "$HOME/.agents/memory"
for pair in \
  "AGENTS.md:AGENTS.md" \
  "MEMORY.md:MEMORY.md" \
  "memory/coding-style.md:memory/coding-style.md" \
  "memory/parallel-tasks.md:memory/parallel-tasks.md" \
  "memory/people.md:memory/people.md" \
  "memory/tools.md:memory/tools.md"; do
  sub="${pair%%:*}"; tgt="${pair##*:}"
  src="$REPO_ROOT/files/agents/$sub"
  dst="$HOME/.agents/$tgt"
  mkdir -p "$(dirname "$dst")"
  [ ! -e "$dst" ] && cp "$src" "$dst"
done
[ ! -e "$HOME/.pi/agent/AGENTS.md" ] && ln -s "$HOME/.agents/AGENTS.md" "$HOME/.pi/agent/AGENTS.md"

# --- 5. soul (skip-if-exists) ---
[ ! -e "$HOME/.agents/SOUL.md" ] && cp "$REPO_ROOT/files/agents/SOUL.md" "$HOME/.agents/SOUL.md"

# --- 6. extensions-all (copy + bun install per dir with package.json) ---
mkdir -p "$HOME/.pi/agent/extensions"
[ -d "$REPO_ROOT/files/extensions/_shared" ] && cp -R "$REPO_ROOT/files/extensions/_shared" "$HOME/.pi/agent/extensions/_shared"
for ext in safe-home-cwd telemetry-footer request-done-notifier coding-plan-quota auto-optimize-images slim-second-brain; do
  src="$REPO_ROOT/files/extensions/$ext"
  dst="$HOME/.pi/agent/extensions/$ext"
  rm -rf "$dst" && mkdir -p "$dst" && cp -R "$src/." "$dst/"
  if [ -f "$dst/package.json" ]; then
    (cd "$dst" && bun install --silent >/dev/null 2>&1)
  fi
done

# --- 7. skills-all (copy) ---
mkdir -p "$HOME/.agents/skills"
for sk in software-delivery-loop grilling grill-me loop-me find-docs exa-search gws-email image-metadata-sanitizer playwright-cli scribd-to-pdf design-md design-principles tauri-app caveman impeccable; do
  src="$REPO_ROOT/files/skills/$sk"
  dst="$HOME/.agents/skills/$sk"
  rm -rf "$dst" && mkdir -p "$dst" && cp -R "$src/." "$dst/"
done

# --- Verify ---
fail=0
check() { # label, expected_count, actual
  if [ "$2" = "$3" ]; then echo "  ✓ $1: $3"
  else echo "  ✗ $1: expected $2 got $3"; fail=$((fail + 1)); fi
}

ext_n=$(ls "$HOME/.pi/agent/extensions" | wc -l | tr -d ' ')
sk_n=$(ls "$HOME/.agents/skills" | wc -l | tr -d ' ')
pr_n=$(ls "$HOME/.pi/agent/prompts" | wc -l | tr -d ' ')
keys_n=$(python3 -c 'import json,sys;print(len(json.load(open(sys.argv[1]))))' "$HOME/.pi/agent/settings.json")
sym_ok=$([ -L "$HOME/.pi/agent/AGENTS.md" ] && echo 1 || echo 0)
pi_dep=$([ -d "$HOME/.pi/agent/extensions/safe-home-cwd/node_modules/@earendil-works/pi-coding-agent" ] && echo 1 || echo 0)

echo ""
echo ">>> RESULT"
check "extensions (incl. _shared)" 7 "$ext_n"
check "skills"                       15 "$sk_n"
check "prompts"                      6  "$pr_n"
check "settings.json top-level keys" 11 "$keys_n"
check "AGENTS.md symlink present"    1  "$sym_ok"
check "pi-coding-agent installed"    1  "$pi_dep"

if [ "$fail" -eq 0 ]; then
  echo ""
  echo ">>> SMOKE PASS — scratch at $SCRATCH"
  exit 0
else
  echo ""
  echo ">>> SMOKE FAIL ($fail checks) — scratch at $SCRATCH"
  exit 1
fi