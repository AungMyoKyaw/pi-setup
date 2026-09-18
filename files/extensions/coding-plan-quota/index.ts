import {
  CustomEditor,
  type ExtensionAPI,
  type KeybindingsManager,
  type Theme,
} from "@earendil-works/pi-coding-agent";
import type { EditorTheme, TUI } from "@earendil-works/pi-tui";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import {
  fetchCodexQuota,
  fetchCopilotQuota,
  fetchKimiQuota,
  fetchLlmQuota,
  formatQuotaBar,
  type QuotaSnapshotSet,
} from "./quota";

const REFRESH_MS = 30_000;
const MINIMUM_GAP = 3;

const emptyQuotas = (): QuotaSnapshotSet => ({
  llmapi: null,
  codex: null,
  kimi: null,
  copilot: null,
});

function fitBorder(
  left: string,
  right: string,
  width: number,
  border: (text: string) => string,
  fill: (text: string) => string = border,
): string {
  if (width <= 0) return "";
  if (width === 1) return border("─");

  let leftText = left;
  let rightText = right;
  while (
    2 + visibleWidth(leftText) + visibleWidth(rightText) + MINIMUM_GAP > width &&
    visibleWidth(rightText) > 0
  ) {
    rightText = truncateToWidth(rightText, Math.max(0, visibleWidth(rightText) - 1), "");
  }
  while (
    2 + visibleWidth(leftText) + visibleWidth(rightText) + MINIMUM_GAP > width &&
    visibleWidth(leftText) > 0
  ) {
    leftText = truncateToWidth(leftText, Math.max(0, visibleWidth(leftText) - 1), "");
  }

  const gap = Math.max(0, width - 2 - visibleWidth(leftText) - visibleWidth(rightText));
  return `${border("─")}${leftText}${fill("─".repeat(gap))}${rightText}${border("─")}`;
}

class QuotaPromptEditor extends CustomEditor {
  private readonly editorTheme: EditorTheme;
  private readonly uiTheme: Theme;
  private readonly tuiInstance: TUI;
  private quotas: QuotaSnapshotSet = emptyQuotas();

  constructor(tui: TUI, theme: EditorTheme, keybindings: KeybindingsManager, uiTheme: Theme) {
    super(tui, theme, keybindings);
    this.editorTheme = theme;
    this.uiTheme = uiTheme;
    this.tuiInstance = tui;
  }

  setQuotas(quotas: QuotaSnapshotSet): void {
    this.quotas = quotas;
    this.invalidate();
    this.tuiInstance.requestRender();
  }

  override render(width: number): string[] {
    const lines = super.render(width);
    const status = formatQuotaBar(this.quotas);
    if (lines.length === 0 || !status) return lines;

    const styledStatus = this.uiTheme.fg("accent", ` ${status} `);
    const border = (text: string) => this.editorTheme.borderColor(text);
    lines[0] = fitBorder("", styledStatus, width, border);
    return lines;
  }
}

export default function (pi: ExtensionAPI) {
  let editor: QuotaPromptEditor | undefined;
  let refreshTimer: ReturnType<typeof setInterval> | undefined;
  let refreshInFlight = false;
  let sessionGeneration = 0;

  const stopRefreshTimer = () => {
    if (refreshTimer) {
      clearInterval(refreshTimer);
      refreshTimer = undefined;
    }
  };

  pi.on("session_start", (_event, ctx) => {
    if (ctx.mode !== "tui") return;

    const generation = ++sessionGeneration;
    stopRefreshTimer();

    const refresh = async () => {
      if (!editor || refreshInFlight || generation !== sessionGeneration) return;
      refreshInFlight = true;
      try {
        const [llmapi, codex, kimi, copilot] = await Promise.all([
          fetchLlmQuota(),
          fetchCodexQuota(),
          fetchKimiQuota(),
          fetchCopilotQuota(),
        ]);
        if (generation === sessionGeneration) {
          editor?.setQuotas({ llmapi, codex, kimi, copilot });
        }
      } finally {
        refreshInFlight = false;
      }
    };

    ctx.ui.setEditorComponent((tui, theme, keybindings) => {
      const nextEditor = new QuotaPromptEditor(tui, theme, keybindings, ctx.ui.theme);
      editor = nextEditor;
      void refresh();
      return nextEditor;
    });

    refreshTimer = setInterval(() => void refresh(), REFRESH_MS);
  });

  pi.on("session_shutdown", () => {
    sessionGeneration++;
    stopRefreshTimer();
    editor = undefined;
    refreshInFlight = false;
  });
}
