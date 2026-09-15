---
description: Safely scan and retry eligible stuck or failed Pi sessions in tmux
argument-hint: '[tmux-pane]'
---

Safely scan and retry eligible stuck or failed Pi sessions running in tmux.

Target pane: ${1:-all eligible panes}

Rules:

- This workflow is tmux-only. Do not attempt to control ordinary terminal TTYs,
  RPC sessions, or unrelated processes.
- Scan every tmux pane by default. If a pane was supplied, restrict the run to
  that pane.
- Exclude the controller/current Pi pane automatically. Never retry the session
  that is running this prompt.
- This request authorizes at most one retry per eligible pane per invocation.
  Each pane is retried at most once per invocation.
- Do not touch other sessions.
- Do not touch healthy panes or idle panes without current failure evidence.
- If one candidate fails, continue with the remaining candidates.
- Do not kill Pi, send signals to arbitrary process groups, edit session files,
  or change provider/retry settings.
- If one candidate fails validation or recovery, report it and continue with
  the remaining candidates.

Procedure:

1. Inventory every pane with:

   ```sh
   tmux list-panes -a -F '#{session_name}:#{window_index}.#{pane_index}\t#{pane_id}\t#{pane_pid}\t#{pane_current_command}\t#{pane_current_path}'
   ```

   Identify Pi panes using the process tree, Pi's visible status/footer, and
   the working directory. Do not treat ordinary shells or child tool panes as
   separate Pi sessions. Identify and exclude the pane running this prompt.

2. Classify each remaining Pi pane independently:
   - **Working-stuck candidate**: Pi is working, has exceeded 10 minutes, and
     its recent output shows no meaningful progress.
   - **Idle-failure candidate**: Pi is idle and its current visible turn shows
     failure evidence such as `Retry failed`, `Request timed out`, or
     `Connection error`. Include `aborted` only when it belongs to the latest
     failed turn, not an old historical message.
   - **Healthy/non-candidate**: Pi is idle without current failure evidence, or
     Pi is working and still making progress. Leave it alone.

   Capture each candidate before changing it:

   ```sh
   tmux capture-pane -p -t '<target>' -S -120
   ```

   If no candidates remain, report that clearly and stop.

3. For each candidate, recover the exact latest user prompt from that pane's
   Pi session history. Use the pane's working directory and the most recently
   relevant JSONL file under `~/.pi/agent/sessions/`, following the active
   branch. Treat prompt text as opaque. If the prompt cannot be recovered
   exactly, skip that pane, report why, and continue with the remaining
   candidates.

4. For a working-stuck candidate, abort only that pane by sending Pi's abort
   key, Escape:

   ```sh
   tmux send-keys -t '<target>' Escape
   ```

   Ctrl+C is not Pi's normal TUI abort action. Wait up to 10 seconds, polling
   the pane, for Pi to return to idle. If it does not become idle, skip it and
   continue; do not kill Pi.

   For an idle-failure candidate, do not send Escape; it is already idle.

5. Submit the recovered prompt literally and exactly once for this candidate.
   Use tmux literal input so prompt characters are not interpreted as shell
   keys, then submit it with Enter. Do not append instructions, alter wording,
   or submit a second copy. Record that pane as attempted so it cannot be
   retried again during this invocation.

6. Process all candidates independently. After submissions, monitor each
   attempted pane for up to 2 minutes or until it returns to idle. Never
   perform a second retry automatically, even if the retry fails.

7. Report a per-pane result: pane, classification, failure evidence, whether
   Escape was sent, whether the exact prompt was recovered, whether submission
   succeeded, and final visible status. Also report excluded, healthy, and
   skipped panes so no inactive Pi session is silently missed.
