import type { DetectedSignal, RiskLevel } from "./types.ts";

const ACTIONS: Record<string, readonly string[]> = {
  "credential-request": [
    "Do not share your OTP, UPI PIN, password or card details.",
    "Contact your bank using its official app or a phone number you already know.",
  ],
  "upi-pin-receive": [
    "Do not enter your UPI PIN to receive money.",
    "Check the request in your usual payment app before doing anything.",
  ],
  "upi-qr-receive": [
    "Do not scan a QR code just to receive money.",
    "Check what a payment approval will do before accepting it.",
  ],
  "upi-collect-receive": [
    "Do not approve a collect request just to receive money.",
    "Check what a payment approval will do before accepting it.",
  ],
  "refund-advance": [
    "Do not pay fees to receive a refund.",
    "Contact the original provider through a channel you already know.",
  ],
  "loan-upfront-fee": [
    "Do not pay upfront fees until you have independently checked the lender.",
  ],
  "guaranteed-loan": [
    "Check the lender and loan terms independently before sharing documents or paying.",
  ],
  "insurance-release-fee": [
    "Do not pay a fee just to release insurance benefits.",
    "Contact your insurer using the number in your policy or its official app.",
  ],
  "policy-cancellation": [
    "Contact your insurer using the number in your policy or its official app.",
  ],
  "policy-renewal-demand": [
    "Contact your insurer using the number in your policy or its official app.",
  ],
  "guaranteed-returns": [
    "Do not send money based on guaranteed returns.",
    "Check the investment provider independently.",
  ],
  "risk-free-investment": [
    "Check the investment provider and risks independently before sending money.",
  ],
  "account-threat": [
    "Contact your bank using its official app or a phone number you already know.",
  ],
  "bank-claim": [
    "Contact your bank using its official app or a phone number you already know.",
  ],
  "kyc-request": ["Open your usual banking app to check any KYC request."],
  "account-verification": [
    "Open your usual banking app to check any verification request.",
  ],
  "url-pattern": [
    "Do not open the link until you have checked the sender independently.",
  ],
  urgency: ["Take time to check the request before acting."],
};

export function recommendActions(
  signals: readonly DetectedSignal[],
  risk: RiskLevel,
): string[] {
  const actions = [
    ...new Set(signals.flatMap((signal) => ACTIONS[signal.id] ?? [])),
  ];
  if (actions.length) return actions;
  if (risk === "insufficient_evidence")
    return [
      "Ask for more context before taking action.",
      "Do not share codes or send money based on an unclear message.",
    ];
  return [
    "Keep your OTP and PIN private.",
    "Use your usual banking app or a known phone number to check unexpected requests.",
  ];
}
