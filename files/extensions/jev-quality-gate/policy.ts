import type { ClassifierResult } from "@earendil-works/pi-ai";

export type Verdict = "pass" | "revise" | "uncertain" | "unavailable";
export interface Assessment {
  verdict: Verdict;
  issue: string;
  confidence?: number;
  coverage?: number;
  evidenceProbability?: number;
  message: string;
}

const actions: Record<string, string> = {
  coverage:
    "Compare the original request with PLAN/TODO; address each missing requirement explicitly.",
  validation:
    "Add and run appropriate tests/typechecks/behavior checks. Report actual commands, outcomes, and limitations.",
  contradiction:
    "Reconcile the request, file changes, tool results, and final claims. Correct inconsistent behavior or claims.",
  insufficient:
    "Gather the missing plan, implementation, or verification evidence; do not claim unobserved checks passed.",
};

export function assess(result: ClassifierResult, threshold = 0.8): Assessment {
  if (result.stopReason !== "stop")
    return {
      verdict: "unavailable",
      issue: "api",
      message: "Jev unavailable; continue using normal verification. This is not a pass.",
    };
  const issue = result.answers?.issue;
  const coverage = result.answers?.coverage;
  const evidence = result.answers?.evidenceSufficient;
  if (
    issue?.type !== "choice" ||
    coverage?.type !== "score" ||
    evidence?.type !== "bool" ||
    !["ready", ...Object.keys(actions)].includes(issue.choice) ||
    !Number.isFinite(issue.confidence) ||
    issue.confidence < 0 ||
    issue.confidence > 1 ||
    !Number.isFinite(issue.probabilities?.[issue.choice]) ||
    issue.probabilities[issue.choice] < 0 ||
    issue.probabilities[issue.choice] > 1 ||
    !Number.isFinite(coverage.score) ||
    coverage.score < 0 ||
    coverage.score > 2 ||
    !Number.isFinite(coverage.confidence) ||
    coverage.confidence < 0 ||
    coverage.confidence > 1 ||
    !Number.isFinite(evidence.probability) ||
    evidence.probability < 0 ||
    evidence.probability > 1
  ) {
    return {
      verdict: "uncertain",
      issue: "malformed",
      message:
        "Jev returned incomplete/invalid answers. Inspect evidence normally; no verified pass.",
    };
  }
  const confidence = Math.min(
    issue.confidence,
    issue.probabilities[issue.choice],
    coverage.confidence,
  );
  const info = {
    issue: issue.choice,
    confidence,
    coverage: coverage.score,
    evidenceProbability: evidence.probability,
  };
  if (confidence < threshold || issue.choice === "insufficient")
    return { ...info, verdict: "uncertain", message: actions.insufficient };
  if (issue.choice === "ready" && coverage.score >= 1.8 && evidence.probability >= threshold)
    return {
      ...info,
      verdict: "pass",
      message:
        "Jev found no visible gap in supplied evidence. This does not prove code correctness.",
    };
  return {
    ...info,
    verdict: "revise",
    message: actions[issue.choice] ?? actions.insufficient,
  };
}

export function shouldPreflight(prompt: string, source?: string): boolean {
  const text = prompt.trim();
  return (
    !!text &&
    source !== "extension" &&
    !/^[/!?]/.test(text) &&
    !/^(hi|hello|hey|thanks|thank you|ok|okay)[.! ]*$/i.test(text)
  );
}

export function packet(phase: string, value: Assessment): string {
  return `[jev-quality-gate] ${phase}: ${value.verdict}; issue=${value.issue}; confidence=${value.confidence?.toFixed(2) ?? "n/a"}; coverage=${value.coverage?.toFixed(2) ?? "n/a"}\n${value.message}`;
}
