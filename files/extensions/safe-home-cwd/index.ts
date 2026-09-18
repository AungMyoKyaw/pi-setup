import { createLocalBashOperations, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { homedir } from "node:os";
import { ensureSafeHomeCwd, isHomeCwd, isProtectedCwd, redirectToolInput } from "./logic.ts";

const REDIRECTED_TOOLS = new Set(["read", "write", "edit", "grep", "find", "ls", "bash"]);

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export default function (pi: ExtensionAPI) {
  pi.registerFlag("unsafe-home", {
    description: "Disable Pi home/root-directory safety redirection for this run",
    type: "boolean",
    default: false,
  });

  const startupCwd = process.cwd();
  const home = homedir();
  if (!isProtectedCwd(startupCwd, home)) return;

  const protectedLocation = isHomeCwd(startupCwd, home)
    ? `home directory (${home})`
    : "filesystem root (/)";

  let mode: "pending" | "active" | "unsafe" | "failed" = "pending";
  let safeCwd: string | undefined;
  let setupError: string | undefined;

  pi.on("tool_call", async (event, ctx) => {
    if (!REDIRECTED_TOOLS.has(event.toolName)) return;

    if (mode === "pending" || mode === "unsafe") return;

    if (mode === "failed" || !safeCwd) {
      if (ctx.hasUI) {
        ctx.ui.notify(`Pi ${protectedLocation} safety is unavailable; tool blocked`, "error");
      }
      return {
        block: true,
        reason: `${protectedLocation} safety failed to initialize${setupError ? `: ${setupError}` : ""}`,
      };
    }

    redirectToolInput(event.toolName, event.input, safeCwd);
  });

  const localBash = createLocalBashOperations();
  pi.on("user_bash", () => {
    if (mode === "pending" || mode === "unsafe") return;
    if (mode === "failed" || !safeCwd) {
      return {
        result: {
          output: `Pi ${protectedLocation} safety failed to initialize${setupError ? `: ${setupError}` : ""}`,
          exitCode: 1,
          cancelled: false,
          truncated: false,
        },
      };
    }

    return {
      operations: {
        exec(command, _cwd, options) {
          return localBash.exec(command, safeCwd!, options);
        },
      },
    };
  });

  pi.on("before_agent_start", (event) => {
    if (mode !== "active" || !safeCwd) return;

    return {
      systemPrompt: `${event.systemPrompt}\n\nPROTECTED-DIRECTORY SAFETY MODE: Pi started from ${protectedLocation}. Relative built-in file and shell operations are redirected to ${safeCwd}. Treat that directory as the effective working directory. Explicit absolute paths, tilde paths, and shell commands that explicitly target another directory are not rewritten.`,
    };
  });

  pi.on("session_start", (_event, ctx) => {
    if (pi.getFlag("unsafe-home") === true) {
      mode = "unsafe";
      ctx.ui.notify(`Pi ${protectedLocation} safety redirection disabled`, "warning");
      return;
    }

    try {
      safeCwd = ensureSafeHomeCwd();
      mode = "active";
      ctx.ui.notify(`Pi ${protectedLocation} safety active: ${safeCwd}`, "info");
    } catch (error) {
      setupError = describeError(error);
      mode = "failed";
      console.error(`Pi ${protectedLocation} safety could not initialize: ${setupError}`);
      ctx.ui.notify(
        `Pi ${protectedLocation} safety failed; built-in tools will be blocked`,
        "error",
      );
    }
  });
}
