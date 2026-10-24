import type { ExtractedMessage } from "../shared/contracts.ts";
import type {
  PreliminaryAssessment,
  DetectedSignal,
} from "../detection/types.ts";
import { explainAssessment } from "../detection/explanations.ts";
import { summarizeMessage } from "./message-summary.ts";

const shortSignals: Record<string, string> = {
  "credential-request": "Asks for private codes or banking details.",
  "upi-pin-receive": "Asks for a PIN to receive money.",
  "account-threat": "Threatens to block or suspend your account.",
  "kyc-request": "Asks you to update KYC details.",
  "account-verification": "Asks you to verify banking details.",
  "bank-claim": "Claims to represent a bank.",
  "guaranteed-returns": "Promises guaranteed or unusually high returns.",
  "risk-free-investment": "Promises a risk-free investment.",
  "loan-upfront-fee": "Asks for an upfront loan fee.",
  "guaranteed-loan": "Promises guaranteed loan approval.",
  "refund-advance": "Requires payment before a refund.",
  "upi-qr-receive": "Asks for a QR scan to receive money.",
  "upi-collect-receive": "Asks for payment approval to receive money.",
  "insurance-release-fee": "Requires a fee to release insurance benefits.",
  "policy-cancellation": "Threatens immediate loss of insurance cover.",
  "policy-renewal-demand": "Pressures you to pay for policy renewal.",
  urgency: "Pressures you to act quickly.",
};

function shortSignal(signal: DetectedSignal): string {
  if (signal.id !== "url-pattern")
    return shortSignals[signal.id] ?? signal.label;
  if (/shortened link/i.test(signal.explanation))
    return "Shortened link hides its destination.";
  if (/lookalike/i.test(signal.explanation))
    return "Link contains a financial-name lookalike.";
  if (/numeric network/i.test(signal.explanation))
    return "Link uses a numeric address.";
  if (/unencrypted HTTP/i.test(signal.explanation))
    return "Financial link uses unencrypted HTTP.";
  return "Link features need checking.";
}

/** Concise presentation of existing results; neither scores nor rule outcomes change. */
export function cardInsights(
  message: ExtractedMessage,
  assessment?: PreliminaryAssessment,
) {
  if (!assessment)
    return {
      defender: ["Assessment unavailable."],
      prosecutor: ["No assessment available yet."],
      actions: [] as string[],
    };
  const explanation = explainAssessment(message, assessment);
  const defender: string[] = [];
  for (const finding of explanation.items) {
    if (finding.label === "No credential theft request detected")
      defender.push(
        /advises against sharing/.test(finding.explanation)
          ? "Advises protecting banking codes and details."
          : "No request for private banking codes detected.",
      );
    if (finding.label === "No artificial urgency detected")
      defender.push("No urgent action requested.");
    if (finding.label === "No suspicious verification request detected")
      defender.push("No KYC or account verification request detected.");
    if (finding.label === "Routine banking-notice wording detected")
      defender.push("Points to your usual banking channel.");
  }
  if (!defender.length)
    defender.push(
      assessment.riskLevel === "insufficient_evidence"
        ? "Too little context to support a lower risk."
        : assessment.riskLevel === "low"
          ? "Indicators remain below the warning threshold."
          : "No lower-risk reasons in this assessment.",
    );
  const prosecutor = [...assessment.signals]
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 3)
    .map(shortSignal);
  if (!prosecutor.length)
    prosecutor.push(
      assessment.riskLevel === "insufficient_evidence"
        ? "No matched warning signs; context is missing."
        : "No warning signs matched.",
    );
  const compactActions = assessment.recommendedActions.map((action) =>
    action
      .replace(
        "Do not share your OTP, UPI PIN, password or card details.",
        "Keep codes, passwords and card details private.",
      )
      .replace(
        "using its official app or a phone number you already know",
        "through its official app or known number",
      )
      .replace(
        "Use your usual banking app or a known phone number to check unexpected requests.",
        "Check unexpected requests through your usual banking app.",
      )
      .replace(
        "Do not open the link until you have checked the sender independently.",
        "Avoid the link until you independently check the sender.",
      )
      .replace(
        "Open your usual banking app to check any KYC request.",
        "Check KYC requests in your usual banking app.",
      ),
  );
  return {
    defender: defender.slice(0, 3),
    prosecutor,
    actions: [...new Set(compactActions)].slice(0, 2),
  };
}

export function investigationSummary(message: ExtractedMessage): string {
  const summary = summarizeMessage(message);
  if (!summary.startsWith("Message excerpt:")) return summary;
  const content = summary.slice("Message excerpt: “".length, -1);
  const sentences = content
    .split(/(?<=[.!?])\s+/)
    .slice(0, 2)
    .join(" ");
  const words = sentences.split(/\s+/);
  return `Message excerpt: “${words.slice(0, 28).join(" ")}${words.length > 28 || sentences.length < content.length ? "…" : ""}”`;
}
