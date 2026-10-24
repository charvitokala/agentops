import type {
  AnalyzableMessage,
  DetectedSignal,
  PreliminaryAssessment,
  RiskLevel,
  ScamCategory,
} from "./types.ts";
import {
  isProtectiveAdvice,
  isRoutineNotification,
  normalizeText,
  PRESSURE,
  SCORING,
  TEXT_RULES,
  WEIGHTS,
} from "./rules.ts";
import { analyzeUrls } from "./url-analysis.ts";
import { recommendActions } from "./recommendations.ts";

export function classifyRisk(
  score: number,
  recognizedLowIndicatorContext = false,
): RiskLevel {
  if (score >= SCORING.high) return "high";
  if (score >= SCORING.medium) return "medium";
  return score > 0 || recognizedLowIndicatorContext
    ? "low"
    : "insufficient_evidence";
}

function summarize(
  signals: readonly DetectedSignal[],
  risk: RiskLevel,
  protective: boolean,
): string {
  const ids = new Set(signals.map((signal) => signal.id));
  if (ids.has("upi-pin-receive"))
    return "This message asks for a UPI PIN to receive money. Pause before following these payment instructions.";
  if (ids.has("credential-request"))
    return `This message asks you to share a private banking code or password. ${ids.has("urgency") || ids.has("account-threat") ? "It also pressures you to act quickly." : "Check the request with your bank before replying."}`;
  if (ids.has("refund-advance"))
    return "This message asks you to pay before receiving a refund. Check the request before sending money.";
  if (ids.has("loan-upfront-fee"))
    return "This message asks for an upfront loan fee. Check the lender independently before paying.";
  if (ids.has("insurance-release-fee"))
    return "This message asks for payment to release insurance benefits. Check with your insurer directly.";
  if (ids.has("guaranteed-returns"))
    return "This message promises guaranteed or unusually high investment returns. Be careful before sending money.";
  if (ids.has("risk-free-investment"))
    return "This message promises a risk-free investment. Check the risks independently before sending money.";
  if (ids.has("upi-qr-receive"))
    return "This message asks you to scan a QR code to receive money. Check the instruction in your payment app.";
  if (ids.has("upi-collect-receive"))
    return "This message links a payment approval to receiving money. Check before approving it.";
  if (ids.has("account-threat"))
    return "This message threatens to block your account and asks you to act. Check the request in your usual banking app.";
  if (ids.has("policy-cancellation") || ids.has("policy-renewal-demand"))
    return "This message pressures you about your insurance policy. Check with your insurer before paying.";
  if (ids.has("url-pattern"))
    return "This link has features that need checking. These features do not prove it is fraudulent.";
  if (risk === "insufficient_evidence")
    return "Not enough information to assess this message.";
  if (protective && signals.length === 0)
    return "This message tells you to keep your banking codes private. It is not verified safe.";
  if (risk === "low")
    return "No strong scam signs found. This does not mean the message is verified safe.";
  return "Some wording needs checking. Verify the request independently before taking action.";
}

/** Pure scoring: no Chrome, DOM, storage, network, or mutable module state. */
export function analyzeMessage(
  message: AnalyzableMessage,
  analyzedAt = new Date().toISOString(),
): PreliminaryAssessment {
  const text = normalizeText(message.text);
  const context = {
    text,
    sentences: text.split(/(?<=[.!?;])\s+|\n+/).filter(Boolean),
  };
  const grouped = new Map<string, (typeof TEXT_RULES)[number]>();
  for (const rule of TEXT_RULES) {
    if (!rule.matches(context)) continue;
    const previous = grouped.get(rule.group);
    if (!previous || rule.weight > previous.weight)
      grouped.set(rule.group, rule);
  }
  // PIN/QR/collect wording often describes one payment action, not separate risks.
  if (grouped.get("sensitive_request")?.id === "upi-pin-receive")
    grouped.delete("receive_payment");
  const chosen = [...grouped.values()];
  const signals: DetectedSignal[] = chosen.map(
    ({ id, label, explanation, weight }) => ({
      id,
      label,
      explanation,
      weight,
    }),
  );
  const urlSignal = analyzeUrls(message.text, message.urls);
  if (urlSignal) signals.push(urlSignal);
  if (
    signals.length &&
    !grouped.has("pressure") &&
    !grouped.has("policy_pressure") &&
    PRESSURE.test(text)
  )
    signals.push({
      id: "urgency",
      label: "Pressure to act quickly",
      explanation:
        "The message uses urgency or limited-time wording alongside another warning sign.",
      weight: WEIGHTS.urgency,
    });
  const riskScore = Math.min(
    SCORING.maximum,
    signals.reduce((sum, signal) => sum + signal.weight, 0),
  );
  const protective = isProtectiveAdvice(text);
  // Clear routine notices/advice can have zero indicators. This is never a safety verdict.
  const routine = isRoutineNotification(text);
  const riskLevel = classifyRisk(riskScore, routine || protective);
  const categoryWeights = new Map<ScamCategory, number>();
  for (const rule of chosen)
    categoryWeights.set(
      rule.category,
      (categoryWeights.get(rule.category) ?? 0) + rule.weight,
    );
  const ranked = [...categoryWeights.entries()].sort((a, b) => b[1] - a[1]);
  // Prefer a specific mechanism over generic banking wording.
  const category =
    ranked.find(([category]) => category !== "banking")?.[0] ??
    ranked[0]?.[0] ??
    (routine ? "banking" : "unknown");
  return {
    messageId: message.id,
    riskLevel,
    riskScore,
    category,
    signals,
    summary: summarize(signals, riskLevel, protective),
    recommendedActions: recommendActions(signals, riskLevel),
    analyzedAt,
    analysisMethod: "local_rules",
  };
}
