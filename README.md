# pi-setup

Agent-native setup for the [pi](https://github.com/earendil-works/pi) coding
agent. No install script — your agent reads this repo and configures itself.

[![Site](docs/badges/license.svg)](LICENSE)
[![Install](docs/badges/install.svg)](https://aungmyokyaw.github.io/pi-setup/#install)
[![Mode](docs/badges/mode.svg)](#updating)
[![Profiles](docs/badges/profiles.svg)](#what-you-get)

30 seconds. Idempotent. Your files are never clobbered.

---

## Install

Before you start: install [pi](https://github.com/earendil-works/pi), and make
sure `git` is on your `PATH`. `bun` is only needed if you want extensions —
the agent will tell you if something is gated.

Paste this into your pi agent:

```text
Read https://raw.githubusercontent.com/AungMyoKyaw/pi-setup/master/SETUP.md and follow it to set up my pi coding agent. Profile: recommended. Proceed.
```

That's the whole installer. Your agent inspects your machine, shows you a
plan (or applies it directly, because the prompt says _Proceed_), backs up
anything it overwrites, and verifies the result.

Prefer to read before running? Clone the repo and drop _Proceed_:

```sh
git clone https://github.com/AungMyoKyaw/pi-setup.git && cd pi-setup
```

```text
Read SETUP.md in this repo and follow it to set up my pi coding agent.
```

## What you get

- A `settings.json` that **deep-merges** into yours instead of clobbering it —
  your existing keys survive, defaults fill in around them
- Prompt templates invocable as `/commands` inside pi
- A workflow skill that makes the agent plan, execute, validate, and report
  on every non-trivial task
- Identity files (memory, agent instructions) only if you don't already
  have them

Three profiles, defined in [`setup.yaml`](setup.yaml):

| Component                                                      | minimal | recommended | full |
| -------------------------------------------------------------- | :-----: | :---------: | :--: |
| Settings (deep-merged) + `/commands` prompts                   |    ✓    |      ✓      |  ✓   |
| Agent instructions + memory scaffold (preserve existing files) |    —    |      ✓      |  ✓   |
| Core extensions (3)                                            |    —    |      ✓      |  ✓   |
| Core skills (5)                                                |    —    |      ✓      |  ✓   |
| Subagent definitions + system-prompt appendix                  |    —    |      ✓      |  ✓   |
| Opinionated `SOUL.md` (skip if present)                        |    —    |      —      |  ✓   |
| All extensions (8)                                             |    —    |      —      |  ✓   |
| All skills (14)                                                |    —    |      —      |  ✓   |

- **Minimal**: merged settings and six prompt templates.
- **Recommended**: minimal, global agent instructions/memory, three small
  extensions, five workflow/documentation skills, four subagent definitions,
  and a system-prompt appendix.
- **Full**: recommended, plus opt-in `SOUL.md`, five additional extensions,
  and nine additional skills.

The three core extensions protect work started from the home/root directory,
show usage in the footer, and notify when a request finishes. Full adds coding
plan quota display, image optimization, Second Brain retrieval, per-request
plan/TODO artifacts, and Jev quality checkpoints. Jev needs Pi 1.0.4+;
classifier credentials are optional. Unavailable Jev checks are reported as
unavailable, not passed. Native same-turn tool concurrency needs no extra
configuration. Subagent definitions are files only; templates that invoke a
`subagent` tool need a compatible separately installed extension.

Recommended skills are `software-delivery-loop`, `grilling`, `grill-me`,
`loop-me`, and `find-docs`. Full adds `exa-search`, `gws-email`,
`image-metadata-sanitizer`, `playwright-cli`, `scribd-to-pdf`,
`design-md`, `tauri-app`, `caveman`, and `impeccable`. Optional
prerequisites include `EXA_API_KEY`, an authenticated `gws` CLI,
`playwright-cli` on `PATH`, and Python 3 with Pillow (plus `requests` for
Scribd). These gate individual skills only.

## Why not a script

A shell script executes blindly. It assumes your OS, clobbers your existing
`settings.json`, and fails opaquely. An agent does what a careful human
would: it deep-merges your settings instead of overwriting them, skips
identity files you already have, backs up before every write, works from a
URL or a local clone, and reports exactly what it did.

Markdown and YAML are easier to review, fork, and diff than any install
script.

## Your stuff stays yours

- **Never inspect, print, copy, or upload:** provider credentials
  (`auth.json`), model caches, trust/spend/run state, sessions, or
  `memory/journal/`. The installer follows the manifest; unrelated files stay
  untouched.
- **Every overwrite is backed up first** to `~/.pi-setup-backups/<timestamp>/`
  with the original path preserved. If anything surprises you, the previous
  version is one diff away.
- **Identity files are skip-if-exists.** If you already have an `AGENTS.md`
  or `SOUL.md`, the agent never touches them.
- **You authenticate your own provider** after setup (`/login` inside pi).
  No keys ship in this repo.

## Updating

Re-run the same prompt anytime. The procedure is idempotent: settings
re-merge, identity files skip, and extensions/skills refresh with backups. Setup
checks for pi, git, Bun, and Python; missing optional tools are reported and
only gate the components that need them. After installation, authenticate a
provider with `/login` in pi and restart pi to load extensions and skills.

Last week I added a skill to this repo, re-ran the prompt, and only the new
skill landed — nothing else moved.

## Customize

This repo is also my personal pi configuration, published so you can run it
as-is or fork it into your own bootstrap.

1. Fork, then replace everything under `files/` with your own config.
2. Edit `setup.yaml` to match.
3. Run the audit before every push:

   ```sh
   ./scripts/audit.sh
   ```

   It fails the build on leaked secrets, absolute home paths, and private
   machine files. Add name patterns you never want public (your private
   repos, machines, domains) to `.audit-deny` — one per line, gitignored —
   and the audit enforces them too.

4. Run the full local gate (`make verify`) to run `prettier --check`,
   the audit, package-bearing extension typechecks, every extension's offline
   tests in an isolated HOME, and manifest/smoke regression tests:

   ```sh
   make verify
   ```

The same gate runs in CI on every push and PR (`.github/workflows/audit.yml`).
Run `./scripts/smoke.sh` for a full-profile install into a disposable HOME,
including dependency installation. Use `./scripts/smoke.sh /tmp/pi-setup-smoke recommended`
to check another profile. Never point the smoke harness at your real HOME.

## Layout

- **`SETUP.md`** — the procedure your agent executes. The contract.
- **`setup.yaml`** — the manifest: components, targets, merge strategies,
  profiles.
- **`VERIFY.md`** — post-setup checks the agent runs and reports.
- **`files/`** — the actual configuration content that gets installed.
- **`scripts/audit.sh`** — sensitive-data scanner. Runs before every push.
- **`.audit-deny`** — your private name patterns (gitignored).
- **`.github/workflows/audit.yml`** — CI: audit + format check + extension
  install + type-check + tests, on every push and PR.
- **`docs/`** — the [public landing page](https://aungmyokyaw.github.io/pi-setup/)
  for non-agent readers; `docs/DESIGN.md` records its visual system.

## License

Licensed under the [GNU Affero General Public License v3.0 or later](LICENSE).
