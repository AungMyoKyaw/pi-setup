/**
 * Request Done Notifier
 *
 * Sends a desktop/terminal notification whenever pi finishes a request and
 * is waiting for input again. Hooks `agent_settled`, which only fires once
 * Pi is fully idle (no retries, auto-compaction retries, or queued
 * follow-ups left), so we don't ping you mid-stream.
 *
 * Supported backends, picked automatically:
 *   - macOS:           `osascript` -> Notification Center, plus `afplay`
 *                      Glass.aiff so you hear the alert even with the display
 *                      off. Note: `osascript` shows up as "Script Editor" in
 *                      System Settings -> Notifications; if its alert style is
 *                      "None" you'll only see entries in Notification Center,
 *                      not banners. Set it to "Banners" or "Alerts" to fix.
 *                      Also blocked by Sleep Focus unless Script Editor is
 *                      allowed in that Focus profile.
 *   - OSC 777:         Ghostty, iTerm2, WezTerm, rxvt-unicode
 *   - OSC 99:          Kitty
 *   - Windows toast:   Windows Terminal / WSL
 *   - Webhook:         POST JSON to $PI_NOTIFIER_WEBHOOK (Telegram, Pushover,
 *                      ntfy.sh, Discord, etc.). Recommended for Sleep Focus
 *                      because push services can be allow-listed and will
 *                      actually break through. Examples in README below.
 *
 * Also rings the terminal bell as a redundant fallback for any environment
 * where none of the above produce a visible or audible notification.
 *
 * Webhook usage (pick one):
 *   ntfy.sh:     export PI_NOTIFIER_WEBHOOK="https://ntfy.sh/your-topic-here"
 *   Telegram:    set PI_NOTIFIER_WEBHOOK to your bot's sendMessage URL
 *                (https://api.telegram.org/bot<TOKEN>/sendMessage) and
 *                PI_NOTIFIER_WEBHOOK_BODY to a JSON template, e.g.
 *                '{"chat_id":"<ID>","text":"$body"}'  ($title and $body
 *                are interpolated)
 *   Pushover:    see https://pushover.net/API
 *   Discord:     use a webhook URL; body becomes {"content":"$body"}
 *
 * For Sleep Focus, allow the corresponding app (ntfy, Telegram, etc.) in
 * System Settings -> Focus -> Sleep -> Allowed Notifications.
 *
 * Commands:
 *   /testnotify  - Fire a test notification right now
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const execFileP = promisify(execFile);

// ---- Backends --------------------------------------------------------------

// Stdout can be a half-closed PTY pipe (e.g. parent shell exited, app getting
// killed mid-notification). A bare `process.stdout.write(...)` then raises
// EPIPE, Node's default handler converts that into an `uncaughtException`, and
// pi crashes with the cryptic `write EPIPE` trace you saw at exit. Register a
// single swallowing error listener on both streams so the notification path
// can never take down the agent. Errors are still observable via the handler
// arguments if a future caller wants to log them.
function installStdoutGuard(): void {
  for (const stream of [process.stdout, process.stderr] as const) {
    if (
      (stream as NodeJS.WriteStream & { __piNotifierErrorGuard?: boolean })
        .__piNotifierErrorGuard
    )
      continue;
    (
      stream as NodeJS.WriteStream & { __piNotifierErrorGuard?: boolean }
    ).__piNotifierErrorGuard = true;
    stream.on("error", () => {
      // Intentionally empty: EPIPE on a closing PTY is expected during
      // shutdown and must not propagate as an uncaughtException.
    });
  }
}

function ringBell(): void {
  // Terminal bell. Cheap, works everywhere, ignored if the user disabled it.
  installStdoutGuard();
  try {
    process.stdout.write("\x07");
  } catch {
    // Belt-and-suspenders: if the guard ever fails to install (e.g. stream
    // already destroyed), swallow the synchronous throw too.
  }
}

async function notifyMacOS(title: string, body: string): Promise<boolean> {
  if (process.platform !== "darwin") return false;
  // AppleScript-safe escaping: backslash-escape both backslashes and double quotes.
  const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  const script = `display notification "${esc(body)}" with title "${esc(title)}"`;
  try {
    await execFileP("osascript", ["-e", script]);
  } catch {
    // Fall through to sound; the visual notification may still land in NC.
  }
  // macOS suppresses notification banners while the display is sleeping, but
  // audio still plays. afplay a system sound so the user hears something even
  // with the lid closed / screen off. Fire-and-forget; never block on audio.
  execFile("afplay", ["/System/Library/Sounds/Glass.aiff"], () => {});
  return true;
}

function safeWriteStdout(payload: string): void {
  installStdoutGuard();
  try {
    process.stdout.write(payload);
  } catch {
    // See ringBell().
  }
}

function notifyOSC777(title: string, body: string): void {
  // Format: ESC ] 777 ; notify ; <title> ; <body> BEL
  safeWriteStdout(`\x1b]777;notify;${title};${body}\x07`);
}

function notifyOSC99(title: string, body: string): void {
  // Kitty notification protocol: a "not done yet" frame, then the body frame.
  safeWriteStdout(`\x1b]99;i=1:d=0;${title}\x1b\\`);
  safeWriteStdout(`\x1b]99;i=1:p=body;${body}\x1b\\`);
}

function notifyWindows(title: string, body: string): void {
  const type = "Windows.UI.Notifications";
  const template = `[${type}.ToastTemplateType]::ToastText01`;
  const script = [
    `[${type}.ToastNotificationManager, ${type}, ContentType = WindowsRuntime] > $null`,
    `$xml = [${type}.ToastNotificationManager]::GetTemplateContent(${template})`,
    `$xml.GetElementsByTagName('text')[0].AppendChild($xml.CreateTextNode('${body}')) > $null`,
    `[${type}.ToastNotificationManager]::CreateToastNotifier('${title}').Show(` +
      `[${type}.ToastNotification]::new($xml))`,
  ].join("; ");
  // Fire-and-forget; we don't care about the exit code.
  execFile("powershell.exe", ["-NoProfile", "-Command", script], () => {});
}

async function notifyWebhook(title: string, body: string): Promise<boolean> {
  const url = process.env.PI_NOTIFIER_WEBHOOK;
  if (!url) return false;
  try {
    // Default body works for ntfy.sh, Discord webhooks, and any service
    // that accepts {"title","body"} or {"content","title"}. For services
    // that need a different schema (Telegram, Pushover), set
    // PI_NOTIFIER_WEBHOOK_BODY to a JSON template with $title/$body
    // placeholders, e.g. '{"chat_id":"123","text":"$title: $body"}'.
    const template =
      process.env.PI_NOTIFIER_WEBHOOK_BODY ??
      '{"title":"$title","body":"$body","message":"$title: $body"}';
    const payload = template
      .replace(/\$title/g, title)
      .replace(/\$body/g, body);
    await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: payload,
    });
    return true;
  } catch {
    return false;
  }
}

async function notify(title: string, body: string): Promise<void> {
  // Webhook (if configured) fires regardless of platform - useful for
  // Sleep Focus, phone delivery, or any backend the user has wired up.
  if (process.env.PI_NOTIFIER_WEBHOOK) {
    await notifyWebhook(title, body);
  }
  if (process.env.WT_SESSION) {
    notifyWindows(title, body);
  } else if (process.env.KITTY_WINDOW_ID) {
    notifyOSC99(title, body);
  } else if (process.platform === "darwin") {
    const ok = await notifyMacOS(title, body);
    if (!ok) notifyOSC777(title, body);
  } else {
    notifyOSC777(title, body);
  }
  // Always ring the bell too, in case the notification backend is muted or
  // the user is on Terminal.app / a tmux pane that drops OSC escapes.
  ringBell();
}

// ---- Helpers ---------------------------------------------------------------

/**
 * Pull the most recent user message from the active session branch so the
 * notification tells you what was just finished, not just "Pi is done".
 * Uses `getBranch()` so we don't surface prompts from abandoned `/tree`
 * branches the user navigated away from.
 */
export function lastUserPrompt(ctx: {
  sessionManager: {
    getBranch: () => Array<{
      type: string;
      message?: { role?: string; content?: unknown };
    }>;
  };
}): string {
  const entries = ctx.sessionManager.getBranch();
  for (let i = entries.length - 1; i >= 0; i--) {
    const entry = entries[i];
    if (entry?.type !== "message") continue;
    if (entry.message?.role !== "user") continue;

    const content = entry.message.content;
    if (typeof content === "string") return content;
    if (Array.isArray(content)) {
      const text = content
        .filter(
          (part): part is { type: string; text?: string } =>
            part && typeof part === "object",
        )
        .filter((part) => part.type === "text" && typeof part.text === "string")
        .map((part) => part.text as string)
        .join("\n")
        .trim();
      if (text) return text;
    }
    return "";
  }
  return "";
}

export function snippet(text: string, max = 80): string {
  const oneLine = text.replace(/\s+/g, " ").trim();
  if (oneLine.length <= max) return oneLine;
  return oneLine.slice(0, max - 1) + "\u2026";
}

// ---- Extension -------------------------------------------------------------

export default function (pi: ExtensionAPI) {
  // Notify when pi has fully settled and is waiting on you. `agent_end`
  // would fire too early (auto-retry / compaction / queued follow-ups may
  // still run); `agent_settled` is the correct "give me your attention"
  // signal.
  pi.on("agent_settled", async (_event, ctx) => {
    const prompt = lastUserPrompt(ctx);
    const body = prompt ? snippet(prompt) : "Ready for input";
    await notify("Pi", body);
  });

  // Slash command so you can verify it's wired up without finishing a task.
  pi.registerCommand("testnotify", {
    description: "Send a test notification to verify the notifier is working",
    handler: async (_args, ctx) => {
      await notify("Pi (test)", "Notifications are working.");
      ctx.ui.notify("Test notification sent.", "info");
    },
  });
}
