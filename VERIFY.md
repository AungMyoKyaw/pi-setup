# VERIFY.md — post-setup checks

Run after applying the plan. Report each as pass / fail / skipped.

1. **Settings parse**

   ```sh
   python3 -m json.tool ~/.pi/agent/settings.json > /dev/null && echo OK
   ```

2. **Prompts present** (if profile included `prompts`)

   ```sh
   ls ~/.pi/agent/prompts/*.md
   ```

3. **Extensions well-formed** (if profile included extensions)

   ```sh
   for d in ~/.pi/agent/extensions/*/; do
     [ -f "$d/index.ts" ] || [ -f "$d/config.json" ] || echo "MISSING entry: $d"
   done; echo DONE
   ```

   `_shared` has no entry file by design; ignore it if flagged.

4. **Skills well-formed** (if profile included skills)

   ```sh
   for d in ~/.agents/skills/*/; do
     [ -f "$d/SKILL.md" ] || echo "MISSING SKILL.md: $d"
   done; echo DONE
   ```

5. **Identity files** (if profile included `agents-base` / `soul`)

   ```sh
   ls ~/.agents/AGENTS.md ~/.agents/MEMORY.md 2>/dev/null; echo DONE
   ```

6. **AGENTS.md linked into pi** (if profile included `agents-base`) — pi
   loads context files from `~/.pi/agent/AGENTS.md`, not `~/.agents/AGENTS.md`,
   so the installer must wire the two together. The two files must resolve
   to the same content (symlink or identical copy).

   ```sh
   if [ -e ~/.pi/agent/AGENTS.md ] && [ -e ~/.agents/AGENTS.md ]; then
     diff -q ~/.pi/agent/AGENTS.md ~/.agents/AGENTS.md >/dev/null \
       && echo OK || echo FAIL
   else
     echo SKIP
   fi
   ```

7. **pi launches**

   ```sh
   pi --version
   ```

8. **End-to-end smoke** — only if a provider is already authenticated
   (check: `pi auth status` exits 0, or ask the user). Otherwise skip.

   ```sh
   pi --no-session -p "Reply with exactly: ok" </dev/null
   ```

Any fail → fix the cause if it's within the approved plan; otherwise report
it verbatim in the final summary.
