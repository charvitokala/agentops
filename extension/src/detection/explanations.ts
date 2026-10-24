import type { AnalyzableMessage, PreliminaryAssessment } from "./types.ts";
import {
  FINANCIAL_CONTEXT,
  isProtectiveAdvice,
  isRoutineNotification,
  normalizeText,
  PRESSURE,
  TEXT_RULES,
} from "./rules.ts";

interface ExplanationItem {
  label: string;
  explanation: string;
}

export interface AssessmentExplanation {
  flagged: boolean;
  heading: string;
  items: ExplanationItem[];
}

/** Debugging copy only: reuses rule predicates; never changes scoring or the assessment. */
export function explainAssessment(
  message: AnalyzableMessage,
  assessment: PreliminaryAssessment,
): AssessmentExplanation {
  const text = normalizeText(message.text);
  const context = {
    text,
    sentences: text.split(/(?<=[.!?;])\s+|\n+/).filter(Boolean),
  };
  const flagged = ["high", "medium"].includes(assessment.riskLevel);
  const items: ExplanationItem[] = assessment.signals.map(
    ({ label, explanation }) => ({ label, explanation }),
  );
  if (flagged) return { flagged, heading: "Why VerdictAI Flagged This", items };

  if (assessment.riskLevel === "insufficient_evidence") {
    const hasLink =
      message.urls.length > 0 || /(?:https?:\/\/|www\.)\S+/i.test(text);
    let explanation: string;
    if (!text) {
      explanation = hasLink
        ? "There is no readable message text. The available link did not match a checked URL warning pattern, but that does not establish its safety. More context is needed."
        : "There is no readable message text or link to assess. More context is needed before taking action.";
    } else if (hasLink) {
      explanation =
        "The available wording and links did not match the checked warning patterns, but there is not enough context to assess the request or sender. A link without a matched warning is not verified safe.";
    } else if (text.split(/\s+/).length <= 6) {
      explanation =
        "This short message provides only a few words, with no link or request that matched the local warning rules. It does not give enough context to determine the risk.";
    } else {
      explanation =
        "No warning rule matched, but the wording was not recognized as a routine banking notice or credential-protection advice either. More context about the request is needed; a lack of matches does not establish safety.";
    }
    return {
      flagged: false,
      heading: "Why VerdictAI Could Not Determine the Risk",
      items: [{ label: "More context is needed", explanation }],
    };
  }

  // Low indicators may still contain real warning signals. Keep those visible.
  if (items.length)
    items.unshift({
      label: "Indicators below the flagging threshold",
      explanation:
        "The matched patterns below did not reach the medium-risk threshold. They still need checking; this result does not verify the message or sender.",
    });

  const matches = (ids: readonly string[]) =>
    TEXT_RULES.some((rule) => ids.includes(rule.id) && rule.matches(context));
  const protective = isProtectiveAdvice(text);
  if (FINANCIAL_CONTEXT.test(text) || protective) {
    if (!matches(["credential-request", "upi-pin-receive"]))
      items.push({
        label: "No credential theft request detected",
        explanation: protective
          ? "The message advises against sharing sensitive banking information rather than asking you to disclose it. The credential-request rules did not match."
          : "The local rules did not find a request to disclose an OTP, PIN, password or card details, or to enter a UPI PIN to receive money.",
      });
    if (
      !PRESSURE.test(text) &&
      !matches(["account-threat", "policy-cancellation"])
    )
      items.push({
        label: "No artificial urgency detected",
        explanation:
          "The checked urgency wording and account-blocking or immediate policy-cancellation threat patterns did not match.",
      });
    if (!matches(["kyc-request", "account-verification"]))
      items.push({
        label: "No suspicious verification request detected",
        explanation:
          "The KYC-update and bank-account verification request rules did not match. This does not verify any links or the sender's identity.",
      });
    if (isRoutineNotification(text))
      items.push({
        label: "Routine banking-notice wording detected",
        explanation:
          "The message says a statement, receipt or summary is available through the usual banking app or channel. This wording is recognized by the rules; the sender is still unverified.",
      });
  }
  return { flagged: false, heading: "Why VerdictAI Did NOT Flag This", items };
}
