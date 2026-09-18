---
name: tauri-app
description: Scaffold a cross-platform desktop app using the latest stable Tauri 2.x + Svelte 5 + Tailwind CSS 4 stack with SQLite persistence via tauri-plugin-sql. Package manager defaults to Bun. Applies the Software Delivery Loop (intake → projection → execute → validate → outcome). Trigger on "tauri app", "tauri desktop", "tauri + svelte", "tauri sqlite", or any request for a Rust-backed desktop app with a Svelte UI and local persistence.
---

# Tauri App Stack (Tauri 2 + Svelte 5 + Tailwind 4 + SQLite)

## When to fire

Use this skill when the user asks to build, scaffold, or extend a cross-platform desktop application and the requirements match any of:

- "Tauri app" / "tauri desktop" / "rust + webview desktop app"
- Svelte frontend with a native shell
- Local-first persistence (offline, no server)
- Bundle output for macOS / Windows / Linux (and optionally iOS / Android via Tauri 2 mobile)

Bypass for: pure web apps, Electron-only projects, mobile-only (no desktop), or when the user explicitly chooses a different framework.

## Versions (verified at skill authoring)

These are the latest **stable** releases as of skill creation. Always re-verify before scaffolding — run `npm view <pkg> version` and `cargo search <crate> --limit 1`.

| Package                         | Version | Notes                                                                                               |
| ------------------------------- | ------- | --------------------------------------------------------------------------------------------------- |
| `create-tauri-app`              | 4.7.x   | Project scaffolder                                                                                  |
| `@tauri-apps/cli`               | 2.11.x  | `tauri` CLI                                                                                         |
| `@tauri-apps/api`               | 2.11.x  | Frontend JS bindings                                                                                |
| `@tauri-apps/plugin-sql`        | 2.4.x   | SQLite / MySQL / Postgres plugin (JS side)                                                          |
| `tauri` (Rust crate)            | 2.x     | 3.0.0-alpha exists — **do not use**                                                                 |
| `tauri-plugin-sql` (Rust crate) | 2.x     | Same                                                                                                |
| `svelte`                        | 5.x     | Svelte 5 with runes (`$state`, `$derived`, `$effect`)                                               |
| `@sveltejs/vite-plugin-svelte`  | 7.x     |                                                                                                     |
| `vite`                          | 8.x     |                                                                                                     |
| `tailwindcss`                   | 4.x     | CSS-first, no `tailwind.config.js` required                                                         |
| `@tailwindcss/vite`             | 4.x     | Tailwind 4 Vite plugin                                                                              |
| `@types/node`                   | 22.x    |                                                                                                     |
| `bun`                           | 1.4.x   | **Default package manager + script runner.** Drop-in for npm, faster installs, native TS execution. |

Tauri 3 is in alpha on crates.io as of writing. Pin to Tauri 2 unless the user explicitly asks for the alpha.

## Why Bun (default package manager + script runner)

Bun is the **default** for every step in this skill. Switch to pnpm/npm/yarn only if the user explicitly asks.

What Bun gives us:

- **Speed** — installs and `bun run` scripts are dramatically faster.
- **No transpile step** — Bun executes `.ts`, `.tsx`, `.js` directly. No need for `ts-node`, `tsx`, or build-time TS for scripts.
- **Built-in test runner** — `bun test` runs Vitest-style tests natively, no Jest/Vitest required for unit tests.
- **Node-compatible API** — Bun runs the same `node_modules`, supports the same `@tauri-apps/api` and `@tauri-apps/plugin-sql` packages.
- **Single binary** — replaces `node` + `npm` + `npx` + `tsc`.

When **not** to swap:

- If the user already has a `package-lock.json` and prefers npm/pnpm — respect existing lockfile.
- If a dependency has native bindings compiled only for Node (e.g., `node-gyp` binaries) and Bun compatibility breaks — fall back to Node. None of the Tauri + Svelte + Tailwind stack has this issue.

**Keep Vite as the bundler.** Do not replace Vite with Bun's bundler — Tauri 2 expects a specific dev-server behavior (HMR, port, host whitelist). Vite is invoked by `tauri dev`, not by Bun directly.

## Bun notes

| npm / npx                     | Bun equivalent                                    |
| ----------------------------- | ------------------------------------------------- |
| `npm install`                 | `bun install`                                     |
| `npm install -D <pkg>`        | `bun add -d <pkg>`                                |
| `npm install <pkg>`           | `bun add <pkg>`                                   |
| `npx create-tauri-app@latest` | `bun create tauri-app` or `bunx create-tauri-app` |
| `npm run <script>`            | `bun run <script>`                                |
| `npm exec <bin>`              | `bunx <bin>`                                      |
| `npx tauri dev`               | `bunx tauri dev`                                  |
| `node ./script.ts`            | `bun ./script.ts`                                 |

`bun create tauri-app` runs the same interactive scaffolder as `npm create tauri-app@latest` — pick **Bun** when prompted for the package manager so the scaffold writes `bun.lock` and adds Bun scripts.

After scaffolding, regenerate `tsconfig.json` if needed (`bunx tsc --init`) and ensure scripts in `package.json` work via `bun run`. They should — Tauri's scripts are plain Node-compatible.

## Delivery workflow

For non-trivial Tauri work, apply
`~/.agents/skills/software-delivery-loop/SKILL.md` for intake, projection,
validation, and outcome reporting. This skill supplies the Tauri-specific
stack, scaffold, schema, and smoke-test checkpoints below.

Keep run artifacts at `~/.agents/runs/<date>/<run-id>/`, outside the project repo by default.

## Scaffold (latest stable stack)

### 1. Create the project

```bash
bun create tauri-app my-app
```

Interactive prompts:

- Project name: `my-app`
- Identifier: `com.example.myapp` (reverse-DNS, must be a valid bundle ID — used for code signing and OS app IDs)
- Frontend: **Svelte**
- Variant: **TypeScript** (preferred) or JavaScript
- Package manager: **Bun** (pick this — writes `bun.lock`)
- Rust template: **vanilla** (default)

Then:

```bash
cd my-app
bun install
```

### 2. Frontend dependencies

```bash
bun add -d tailwindcss @tailwindcss/vite
bun add @tauri-apps/api @tauri-apps/plugin-sql
```

### 3. Rust dependencies

Edit `src-tauri/Cargo.toml`:

```toml
[dependencies]
tauri = { version = "2", features = [] }
tauri-plugin-sql = { version = "2", features = ["sqlite"] }
serde = { version = "1", features = ["derive"] }
serde_json = "1"
```

Tauri 2 entry point lives in `src-tauri/src/lib.rs`. Register the SQL plugin:

```rust
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_sql::Builder::default().build())
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

### 4. Tailwind 4 wiring (CSS-first, no config file)

`src/app.css`:

```css
@import "tailwindcss";
```

`vite.config.ts`:

```ts
import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [svelte(), tailwindcss()],
});
```

Import `app.css` once at the top of `src/main.ts` (or `src/App.svelte`):

```ts
import "./app.css";
```

Tailwind 4 reads `@theme` blocks from your CSS for tokens. Do **not** create a `tailwind.config.js` unless you need legacy plugin compatibility.

### 5. Capabilities (Tauri 2 permission model)

Tauri 2 requires explicit capability grants per plugin/command. Edit `src-tauri/capabilities/default.json`:

```json
{
  "$schema": "../gen/schemas/desktop-schema.json",
  "identifier": "default",
  "description": "default capability",
  "windows": ["main"],
  "permissions": [
    "core:default",
    "sql:default",
    "sql:allow-load",
    "sql:allow-execute",
    "sql:allow-select",
    "sql:allow-close"
  ]
}
```

Tighten before shipping. Never grant `sql:allow-execute` against user-supplied SQL — always use parameterized queries (`SELECT … WHERE id = $1`).

### 6. SQLite from Svelte (Svelte 5 runes)

`src/lib/db.ts`:

```ts
import Database from "@tauri-apps/plugin-sql";

let dbPromise: Promise<Database> | null = null;

export function getDb(): Promise<Database> {
  if (!dbPromise) {
    dbPromise = Database.load("sqlite:app.db").then(async (db) => {
      await db.execute(`
        CREATE TABLE IF NOT EXISTS notes (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          body TEXT NOT NULL,
          created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
        );
      `);
      return db;
    });
  }
  return dbPromise;
}
```

`src/routes/+page.svelte` (or `src/App.svelte`):

```svelte
<script lang="ts">
  import { getDb } from "$lib/db";

  type Note = { id: number; body: string; created_at: number };

  let notes = $state<Note[]>([]);
  let draft = $state("");

  async function refresh() {
    notes = await getDb().then((d) =>
      d.select<Note[]>("SELECT * FROM notes ORDER BY id DESC")
    );
  }

  async function add() {
    if (!draft.trim()) return;
    const db = await getDb();
    await db.execute("INSERT INTO notes (body) VALUES ($1)", [draft]);
    draft = "";
    await refresh();
  }

  $effect(() => {
    refresh();
  });
</script>

<main class="min-h-screen bg-gray-50 p-8 text-gray-900">
  <h1 class="text-2xl font-bold mb-4">Notes</h1>
  <div class="flex gap-2 mb-6">
    <input
      class="flex-1 rounded border border-gray-300 px-3 py-2"
      bind:value={draft}
      onkeydown={(e) => e.key === "Enter" && add()}
    />
    <button class="rounded bg-blue-600 px-4 py-2 text-white" onclick={add}>
      Add
    </button>
  </div>
  <ul class="space-y-2">
    {#each notes as n (n.id)}
      <li class="rounded border border-gray-200 bg-white p-3 shadow-sm">
        {n.body}
      </li>
    {/each}
  </ul>
</main>
```

The plugin stores `app.db` in the OS app-data directory automatically (resolved per platform). For tests, use `sqlite::memory:` or `sqlite:file::memory:?cache=shared`.

## Schema migrations

From day one, track a `schema_version` table and a `migrate()` function. Example:

```ts
const MIGRATIONS: Array<(db: Database) => Promise<void>> = [
  async (db) => {
    await db.execute(`
      CREATE TABLE IF NOT EXISTS notes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        body TEXT NOT NULL,
        created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
      );
    `);
  },
  // future: async (db) => { await db.execute("ALTER TABLE notes ADD COLUMN pinned INTEGER NOT NULL DEFAULT 0"); }
];

export async function migrate(db: Database) {
  await db.execute(`CREATE TABLE IF NOT EXISTS schema_version (version INTEGER PRIMARY KEY);`);
  const rows = await db.select<{ version: number }[]>(
    "SELECT version FROM schema_version ORDER BY version DESC LIMIT 1",
  );
  const current = rows[0]?.version ?? 0;
  for (let i = current; i < MIGRATIONS.length; i++) {
    await MIGRATIONS[i](db);
    await db.execute("INSERT INTO schema_version (version) VALUES ($1)", [i + 1]);
  }
}
```

Never edit a migration after it has shipped to a user. Add a new one.

## Validation

Run before claiming done:

```bash
bun run check       # svelte-check + tsc (type errors)
bun run lint        # if eslint/prettier configured
bun run build       # frontend bundle
bun run tauri build # full native bundle — slow, CI-only unless requested
bun run tauri dev   # dev run — must launch window without panic
```

Tauri resolves the `tauri` binary from `node_modules/.bin`. Bun's `node_modules/.bin` is on `$PATH` via `bun run`, so this works without extra config. If `tauri dev` fails to find the CLI, run `bun install` again or invoke directly via `bunx tauri dev`.

For unit tests (Svelte components, pure logic):

```bash
bun test
```

For automated smoke tests of the desktop app, spawn the binary headlessly or use `tauri-driver` / WebDriver.

### Smoke test (always include)

1. `bun run tauri dev` launches the window.
2. Frontend can write to SQLite (insert row).
3. Frontend can read back the inserted row.
4. Quit and relaunch — the row persists.

## Definition of done

- [ ] `projection.md` written and approved.
- [ ] `bun run build` exits 0.
- [ ] `bun run check` exits 0.
- [ ] `bun run tauri dev` launches the window without panic.
- [ ] SQLite read/write roundtrip works.
- [ ] Tailwind classes render correctly in the window (visual check).
- [ ] Smoke test passes (write → read → restart → read still works).
- [ ] `bun.lock` committed (never `package-lock.json`).
- [ ] `outcome.md` saved to `~/.agents/runs/<date>/<run-id>/`.
- [ ] Commit made **locally**. User has approved before any push, PR, release, or signing.

## Anti-patterns

- **Do not** use Tauri 3 alpha — pin `tauri = "2"` and `tauri-plugin-sql = "2"`.
- **Do not** grant every SQL permission in `capabilities/*.json` for production — narrow per command, audit before release.
- **Do not** interpolate user input into SQL strings — always parameterize with `$1`, `$2`, …
- **Do not** store secrets in SQLite plaintext — use `tauri-plugin-stronghold` or OS keychain.
- **Do not** write migrations that mutate shipped schema — append a new migration.
- **Do not** use Tailwind 3 syntax (`@tailwind base/components/utilities`) — Tailwind 4 uses `@import "tailwindcss"` and `@theme`.
- **Do not** mix Svelte 4 (`let` + `$:`) with Svelte 5 runes — pick one per project, default to runes for new code.
- **Do not** run `tauri build` on every iteration during development — use `tauri dev` for fast feedback; reserve `build` for CI / release.
- **Do not** skip capability review — Tauri 2's capability model is the security boundary; treat it like a firewall rule.
- **Do not** mix Bun and npm in the same project — pick one package manager per repo. If you started with `package-lock.json`, delete it and re-run `bun install` to produce `bun.lock`.
- **Do not** commit `bun.lock` then run `npm ci` in CI — pin CI to Bun (`oven-sh/setup-bun@v1` in GitHub Actions).
- **Do not** use Bun's bundler (`bun build`) for the frontend — keep Vite; Tauri 2's dev-server protocol assumes Vite-shaped HMR and port behavior.

## Common follow-ups

- **Distribution signing** — set up platform signing (Apple Developer ID, Windows Authenticode, Linux GPG) before first public release. Use `tauri-action` in CI.
- **Auto-updates** — add `tauri-plugin-updater` and a hosted manifest.
- **System tray / global shortcuts** — `tauri-plugin-global-shortcut`, tray APIs.
- **Native notifications** — `tauri-plugin-notification`.
- **File dialogs** — `tauri-plugin-dialog`.
- **State across windows** — use a store (Svelte 5 `$state` in a module, or `tauri-plugin-store` for persistence).
- **Testing** — Vitest for unit, Playwright + `tauri-driver` for E2E.

## References

- Tauri docs: https://tauri.app/
- Tauri 2 SQL plugin: https://v2.tauri.app/plugin/sql/
- Svelte 5 runes: https://svelte.dev/docs/svelte/$state
- Tailwind 4: https://tailwindcss.com/docs
- SDL: `~/.agents/skills/software-delivery-loop/SKILL.md`
