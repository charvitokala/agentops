import type { AnalyzableMessage, DetectedSignal } from "./types.ts";
import { hasPressure, SCORING } from "./rules.ts";

/** Combination floors, not keyword multipliers. Only the strongest floor is applied. */
export function applyContextScore(
  message: AnalyzableMessage,
  signals: DetectedSignal[],
): number {
  const base = signals.reduce((sum, signal) => sum + signal.weight, 0);
  const ids = new Set(signals.map((signal) => signal.id));
  const candidates = [
    ...message.urls,
    ...(message.text.match(/(?:https?:\/\/|www\.)[^\s<>"']+/gi) ?? []),
  ];
  const hasLink = candidates.some((value) => {
    try {
      return ["http:", "https:"].includes(
        new URL(/^www\./i.test(value) ? `https://${value}` : value).protocol,
      );
    } catch {
      return false;
    }
  });
  const credentialAndBank =
    ids.has("credential-request") && ids.has("bank-claim");
  const urgentVerification =
    ids.has("account-threat") &&
    (ids.has("kyc-request") || ids.has("account-verification")) &&
    hasLink &&
    hasPressure(message.text.toLowerCase());
  const rewardPayment =
    ids.has("reward-promise") &&
    ["reward-payment", "account-unlock-fee", "refund-advance"].some((id) =>
      ids.has(id),
    ) &&
    hasPressure(message.text.toLowerCase());
  if (
    base < SCORING.high &&
    (credentialAndBank || urgentVerification || rewardPayment)
  ) {
    signals.push({
      id: "critical-combination",
      label: credentialAndBank
        ? "Bank claim combined with credential theft"
        : urgentVerification
          ? "Account threat combined with urgent verification"
          : "Urgent reward combined with payment demand",
      explanation: credentialAndBank
        ? "A claim to represent a bank is combined with a request for private banking credentials. Together these reach the high-risk threshold."
        : urgentVerification
          ? "An account-blocking threat is combined with urgent verification through a link. Together these reach the high-risk threshold."
          : "An urgent reward promise is combined with a payment demand. Together these reach the high-risk threshold.",
      weight: SCORING.high - base,
    });
    return SCORING.high;
  }
  return Math.min(SCORING.maximum, base);
}
