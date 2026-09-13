# pi-setup

Agent-native setup for the [pi](https://github.com/earendil-works/pi) coding
agent. No install script — your agent reads this repo and configures itself.

This is my personal pi configuration, published so you can run it as-is or
fork it into your own.

Site: <https://aungmyokyaw.github.io/pi-setup/>

## The prompt

Paste this into your pi agent:

```text
Read https://raw.githubusercontent.com/AungMyoKyaw/pi-setup/master/SETUP.md
and follow it to set up my pi coding agent. Profile: recommended. Proceed.
```

That's the whole installer. Your agent will inspect your machine, show you a
plan (or apply it directly, since the prompt says *Proceed*), back up
anything it overwrites, and verify the result.

Prefer to inspect first? Clone the repo and drop *Proceed*:

```sh
git clone https://github.com/AungMyoKyaw/pi-setup.git && cd pi-setup
```

```text
Read SETUP.md in this repo and follow it to set up my pi coding agent.
```

## Why not a script

A shell script can't adapt. An agent can: it merges your existing
`settings.json` instead of clobbering it, skips identity files you already
have, backs up before overwriting, works from a URL or a local clone, and
tells you exactly what it did. The repo is the spec; the agent is the
installer.

## Profiles

| Component                              | minimal | recommended | full |
| -------------------------------------- | :-----: | :---------: | :--: |
| `settings.json` (deep-merged)          |    ✓    |      ✓      |  ✓   |
| Prompt templates (`/commands`)         |    ✓    |      ✓      |  ✓   |
| Agent instructions + memory scaffold   |         |      ✓      |  ✓   |
| Core extensions (3)                    |         |      ✓      |  ✓   |
| Core skills (workflow, docs)           |         |      ✓      |  ✓   |
| `SOUL.md` identity file (opinionated)  |         |             |  ✓   |
| All extensions (incl. subagent fleet)  |         |             |  ✓   |
| All skills (email, playwright, pdf…)   |         |             |  ✓   |
| Parallel RPC model routes              |         |             |  ✓   |

Identity and memory files are **skip-if-exists** — the agent will never
overwrite yours.

## What it never touches

Credentials (`auth.json`), sessions, model caches, trust state — anything not
in `setup.yaml`. Overwrites are backed up to `~/.pi-setup-backups/`. After
setup you authenticate your own provider (`/login` inside pi).

## Updating

Re-run the same prompt. The procedure is idempotent: settings re-merge,
identity files skip, extensions/skills refresh with backups.

## Fork it

1. Fork, then replace everything under `files/` with your own config.
2. Edit `setup.yaml` to match.
3. Run the audit before every push:

   ```sh
   ./scripts/audit.sh
   ```

   It fails the build on leaked secrets, absolute home paths, and private
   machine files. Keep it honest — you're publishing your setup. Add name
   patterns you never want public (your private repos, machines, domains)
   to `.audit-deny` — one per line, gitignored — and the audit enforces
   them too.

## Layout

- `SETUP.md` — the procedure your agent executes
- `setup.yaml` — the manifest: components, targets, merge strategies
- `VERIFY.md` — post-setup checks the agent runs
- `files/` — the actual configuration content
- `scripts/audit.sh` — sensitive-data scanner

## License

Licensed under the [GNU Affero General Public License v3.0 or later](LICENSE).
