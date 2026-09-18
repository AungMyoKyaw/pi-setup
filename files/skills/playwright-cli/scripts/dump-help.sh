#!/usr/bin/env bash
set -euo pipefail

out=${1:-"$HOME/.agents/skills/playwright-cli/references/cli-help.md"}
mkdir -p "$(dirname "$out")"
tmp=$(mktemp -d "${TMPDIR:-/tmp}/playwright-cli-help.XXXXXX")
trap 'rm -rf "$tmp"' EXIT

version=$(playwright-cli --version 2>&1 || true)
root=$(playwright-cli --help 2>&1 || true)

# Parse every command listed in the root help. Two layouts:
#   "  open [url]                  open the browser"      -> first field
#   "  attach [name]               attach to a running ..." -> first field
# Skip blank lines and section headers.
commands=$(printf '%s\n' "$root" | awk '
  /^  [a-zA-Z][a-zA-Z0-9_-]*[[:space:]]/ { print $1 }
')

{
  printf '# playwright-cli help dump\n\n'
  printf '%s\n' "- Generated: $(date -u '+%Y-%m-%dT%H:%M:%SZ')"
  printf '%s\n' "- Binary: $(command -v playwright-cli)"
  printf '%s\n\n' "- Version: $version"

  printf '## playwright-cli --help\n\n```\n%s\n```\n' "$root"

  while IFS= read -r command; do
    [ -n "$command" ] || continue
    printf '\n### `%s`\n\n```\n' "$command"
    playwright-cli --help "$command" 2>&1
    printf '\n```\n'
  done <<< "$commands"
} > "$tmp/cli.md"

mv "$tmp/cli.md" "$out"
printf '%s\n' "$out"