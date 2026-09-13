# Golden transcript: edge case — malformed DESIGN.md

Manual regression case for the design-md skill's behavior when a DESIGN.md
exists but cannot be parsed.

## Setup

Repo has a `DESIGN.md` at the root with a YAML syntax error in the
frontmatter. Example: an unclosed quoted string in the `name` field,
mismatched indentation in the `colors` map, or a missing closing `---`
fence. The body of the file is fine; only the frontmatter is broken.

## Prompt

> Build me a settings page. Follow our DESIGN.md.

## Expected behavior

The agent should:

1. **Locate the file.** Confirm `DESIGN.md` is at the repo root.
2. **Attempt to parse the frontmatter.** Catch the YAML error.
3. **Surface a clear error.** State the rule that failed, the line range
   where the failure occurred, and a one-line fix suggestion (e.g.
   "missing closing quote on line 3 of the frontmatter; YAML cannot
   parse past that point").
4. **Delegate to the lint CLI.** Suggest running
   `npx @google/design.md lint DESIGN.md` for the canonical error
   message.
5. **Refuse to consume.** Do not generate the settings page from a
   partial parse. Do not "work around" the broken YAML by hand-parsing.
6. **Recommend AUDIT mode.** Offer to enter AUDIT mode to triage and
   propose a fix.

## Pass criteria

- The agent surfaces a specific error message, not a generic "the file
  is broken" complaint.
- The agent identifies the region of the file (frontmatter, line range).
- The agent delegates to the npm CLI for the canonical error.
- The agent refuses to consume and explicitly says so.
- The agent recommends AUDIT mode.

## Fail signals

- The agent hand-parses around the broken YAML and proceeds to consume
  the file anyway.
- The agent generates UI without flagging the broken source.
- The agent reports the error generically ("could not read DESIGN.md")
  with no specific region or suggestion.

## Run command

Paste the prompt into a fresh session in a repo with a malformed
DESIGN.md. Observe. Tick each pass criterion. Note any fail signals
verbatim.
