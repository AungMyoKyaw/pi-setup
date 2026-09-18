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

Three profiles. Pick the one that matches how much you want:

| Component                             | minimal | recommended | full |
| ------------------------------------- | :-----: | :---------: | :--: |
| `settings.json` (deep-merged)         |    ✓    |      ✓      |  ✓   |
| Prompt templates (`/commands`)        |    ✓    |      ✓      |  ✓   |
| Agent instructions + memory scaffold  |         |      ✓      |  ✓   |
| Core extensions (3)                   |         |      ✓      |  ✓   |
| Core skills (workflow, docs)          |         |      ✓      |  ✓   |
| `SOUL.md` identity file (opinionated) |         |             |  ✓   |
| All extensions (incl. brain capture)  |         |             |  ✓   |
| All skills (email, playwright, pdf…)  |         |             |  ✓   |
| Parallel RPC model routes             |         |             |  ✓   |

`recommended` is the sensible default. `full` adds an opinionated identity
file (`SOUL.md`) and every available skill — pick it if you want the whole
catalogue.

## Why not a script

A shell script executes blindly. It assumes your OS, clobbers your existing
`settings.json`, and fails opaquely. An agent does what a careful human
would: it deep-merges your settings instead of overwriting them, skips
identity files you already have, backs up before every write, works from a
URL or a local clone, and reports exactly what it did.

Markdown and YAML are easier to review, fork, and diff than any install
script.

## Your stuff stays yours

- **Never read, written, or uploaded:** `auth.json`, sessions, model caches,
  trust state, your `memory/journal/`. Anything not in the manifest is
  invisible to the installer.
- **Every overwrite is backed up first** to `~/.pi-setup-backups/<timestamp>/`
  with the original path preserved. If anything surprises you, the previous
  version is one diff away.
- **Identity files are skip-if-exists.** If you already have an `AGENTS.md`
  or `SOUL.md`, the agent never touches them.
- **You authenticate your own provider** after setup (`/login` inside pi).
  No keys ship in this repo.

## Updating

Re-run the same prompt anytime. The procedure is idempotent: settings
re-merge, identity files skip, extensions and skills refresh with backups.

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

## Layout

- **`SETUP.md`** — the procedure your agent executes. The contract.
- **`setup.yaml`** — the manifest: components, targets, merge strategies,
  profiles.
- **`VERIFY.md`** — post-setup checks the agent runs and reports.
- **`files/`** — the actual configuration content that gets installed.
- **`scripts/audit.sh`** — sensitive-data scanner. Runs before every push.
- **`.audit-deny`** — your private name patterns (gitignored).

## License

Licensed under the [GNU Affero General Public License v3.0 or later](LICENSE).
