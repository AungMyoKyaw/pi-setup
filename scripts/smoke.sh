#!/usr/bin/env bash
# Development-only manifest smoke harness, not a user installation script.
# Usage: ./scripts/smoke.sh [disposable-home] [minimal|recommended|full]
set -euo pipefail
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
exec bun "$REPO_ROOT/scripts/smoke.ts" "$@"
