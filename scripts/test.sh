#!/usr/bin/env bash
# Offline tests use repository assets in an isolated HOME, not a developer's setup.
set -euo pipefail
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SCRATCH="$(mktemp -d "${TMPDIR:-/tmp}/pi-setup-tests.XXXXXX")"
trap 'rm -rf "$SCRATCH"' EXIT
mkdir -p "$SCRATCH/.agents/skills/image-metadata-sanitizer/scripts"
cp "$REPO_ROOT/files/skills/image-metadata-sanitizer/scripts/sanitize_image.py" \
  "$SCRATCH/.agents/skills/image-metadata-sanitizer/scripts/"
cd "$REPO_ROOT"
HOME="$SCRATCH" bun test files/extensions scripts
