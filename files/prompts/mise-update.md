---
description: Update every mise-managed tool and mise itself
---

Update my complete mise setup now. Execute commands; do not merely describe them or ask for confirmation for normal upgrades.

1. Update every current and installed-but-inactive mise tool to the newest available release:
   ```sh
   mise upgrade --bump --inactive
   ```
2. Update mise itself. If Homebrew manages it, run `brew upgrade mise`; otherwise run `mise self-update`. If another package manager manages it, use that manager only when unambiguous; otherwise report the exact blocker.
3. Verify:
   ```sh
   mise --version
   mise outdated --bump --inactive
   ```
4. Report concisely: mise version change, each tool version change, skipped/held tools and the reason, config or lockfile changes, and any errors.

Respect configured release-age policies, but explicitly mention versions held by them. Do not modify unrelated project files or settings.
