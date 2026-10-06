export type Mode = "off" | "plan-only" | "full";
export interface Config {
  mode: Mode;
  provider?: string;
  modelId?: string;
  timeoutMs: number;
  threshold: number;
}

export function resolveConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const mode = env.PI_JEV_GATE_MODE;
  return {
    mode:
      env.PI_JEV_GATE === "0" || mode === "off"
        ? "off"
        : mode === "plan" || mode === "plan-only"
          ? "plan-only"
          : "full",
    provider: env.PI_JEV_GATE_PROVIDER,
    modelId: env.PI_JEV_GATE_MODEL_ID,
    timeoutMs: 15_000,
    threshold: 0.8,
  };
}

export const STATUS_KEY = "jev-quality-gate";
export const MAX_CHECKS = 2; // Initial checkpoint plus one recheck, per phase/request.
