#!/usr/bin/env bash
# audit.sh — fail if the repo contains anything that must not be public.
# Run before every push. Exits non-zero on any finding.
set -u
cd "$(dirname "$0")/.."

fail=0
hits() { # label, then grep results on stdin
  if [ -n "$1" ]; then
    echo "FAIL: $2"
    printf '%s\n' "$1"
    fail=1
  fi
}

echo "== scanning for secret patterns =="
out=$(grep -rInE --exclude-dir=.git \
  'sk-[A-Za-z0-9_-]{15,}|ghp_[A-Za-z0-9]{15,}|github_pat_[A-Za-z0-9_]{15,}|glpat-[A-Za-z0-9_-]{15,}|xox[baprs]-[A-Za-z0-9-]{10,}|AKIA[0-9A-Z]{16}|AIza[0-9A-Za-z_-]{20,}|BEGIN [A-Z ]*PRIVATE KEY|Bearer [A-Za-z0-9._~-]{20,}|eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}' \
  . || true)
hits "$out" "secret-like tokens found"

echo "== scanning for forbidden machine files =="
out=$(find . -path ./.git -prune -o -type f \( \
  -name 'auth.json' -o -name 'models.json' -o -name 'models-store.json' -o \
  -name 'trust.json' -o -name 'spend-state.json' -o -name 'run-history.jsonl' -o \
  -name '.skill-lock.json' -o -name '*.pem' -o -name '*.key' -o -name '.env' \
  \) -print || true)
hits "$out" "forbidden files present"

out=$(find . -path ./.git -prune -o -type d \( -name 'sessions' -o -name 'journal' -o -name 'node_modules' -o -name '__pycache__' \) -print || true)
hits "$out" "forbidden directories present"

echo "== scanning for absolute user paths =="
out=$(grep -rIn --exclude-dir=.git --exclude=audit.sh -E '/Users/[A-Za-z0-9._-]+|/home/[A-Za-z0-9._-]+' . \
  | grep -v '/Users/tester' || true)  # /Users/tester = fake fixture in extension tests
hits "$out" "absolute home paths found"

echo "== scanning for non-example emails =="
out=$(grep -rInEh --exclude-dir=.git -E '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}' . \
  | grep -vE '@(example\.com|example\.org|example\.net|localhost)' \
  | sort -u || true)
hits "$out" "real-looking email addresses found"

echo "== scanning for private/local-only references =="
# Name patterns you never want public live in .audit-deny (gitignored, one
# pattern per line). Keep yours locally; fork users add their own.
deny=.audit-deny
if [ -f "$deny" ]; then
  out=$(grep -rIn --exclude-dir=.git --exclude=audit.sh --exclude=.audit-deny -f "$deny" . || true)
  hits "$out" "private references found (patterns from $deny)"
else
  echo "  (no .audit-deny — skipping private-name scan)"
fi

if [ "$fail" -eq 0 ]; then
  echo "AUDIT CLEAN"
else
  echo "AUDIT FAILED — resolve findings above before pushing" >&2
  exit 1
fi
