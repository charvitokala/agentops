import type {
  AgentFinding,
  DetectedSignal,
  RiskLevel,
  SafetyAction,
  ScamCase,
  SignalKind,
} from "./contracts.ts";

export const MAX_MESSAGE_LENGTH = 10000;
export const LIMITATIONS =
  "Local text patterns only. Sender identity, links, and claims have not been verified. A low-indicator result does not establish that a message is safe.";

export const COURTROOM_AGENTS: AgentFinding[] = [
  {
    id: "agent-investigator",
    role: "investigator",
    status: "not_available",
    description:
      "Will collect relevant evidence and examine sender details, links, and message context. Evidence collection is not connected in this phase.",
  },
  {
    id: "agent-prosecutor",
    role: "prosecutor",
    status: "not_available",
    description:
      "Will present arguments for potential fraud, grounded in collected evidence and recognizable scam patterns.",
  },
  {
    id: "agent-defender",
    role: "defender",
    status: "not_available",
    description:
      "Will consider legitimate explanations, missing context, and counterarguments to reduce unsupported conclusions.",
  },
  {
    id: "agent-judge",
    role: "judge",
    status: "not_available",
    description:
      "Will weigh both sides and provide an evidence-based assessment that makes uncertainty explicit. No AI verdict is produced in this phase.",
  },
];

interface Rule {
  kind: SignalKind;
  title: string;
  explanation: string;
  severity: RiskLevel;
  pattern: RegExp;
  condition?: (text: string) => boolean;
}

const rules: Rule[] = [
  {
    kind: "otp_request",
    title: "OTP disclosure request",
    severity: "high",
    pattern:
      /\b(?:otp|one[ -]time (?:password|code)|six[ -]digit code|verification code)\b/i,
    condition: (text) =>
      /\b(?:reply|send|share|tell|provide|disclose|needs?|give|forward)\b/i.test(
        text,
      ) &&
      !/\b(?:do not|don't|never)\s+(?:\w+\s+){0,3}(?:share|send|give|disclose|provide|forward|tell)\b/i.test(
        text,
      ),
    explanation:
      "The message pairs a one-time code with a request to disclose it. Sharing an OTP can authorize access or a transaction. This pattern does not verify the sender.",
  },
  {
    kind: "urgency",
    title: "Urgency or account-blocking threat",
    severity: "medium",
    pattern:
      /\b(?:immediately|urgent(?:ly)?|within \d+ minutes?|blocked|suspended|lose access|act now)\b/i,
    explanation:
      "Time pressure and threats of losing account access can discourage independent checks. The wording is a signal, not proof of fraud.",
  },
  {
    kind: "kyc",
    title: "KYC verification request",
    severity: "medium",
    pattern: /\b(?:kyc|know your customer|verify your identity)\b/i,
    explanation:
      "KYC may be part of legitimate banking. An unsolicited request should be checked through your bank's usual app or independently obtained contact details.",
  },
  {
    kind: "external_link",
    title: "Unverified external domain",
    severity: "medium",
    pattern:
      /(?:https?:\/\/|www\.)[^\s<>]+|\b[a-z0-9-]+\.(?:com|net|org|in|co|io|example)\b(?:\/[^\s<>]*)?/i,
    explanation:
      "The message contains a web address. This app has not visited the address, checked its reputation, or established that it belongs to a bank. Open your usual banking channel independently.",
  },
  {
    kind: "authority",
    title: "Bank authority claim",
    severity: "low",
    pattern:
      /\b(?:bank security|security team|bank representative|bank officer|fraud department)\b/i,
    explanation:
      "The sender claims a position of authority. That claim is unverified; the text alone cannot establish identity.",
  },
  {
    kind: "returns",
    title: "Unrealistic guaranteed returns",
    severity: "medium",
    pattern:
      /\bguaranteed\b.{0,45}\b(?:returns?|profits?|\d+%)|\b\d+%\s*(?:returns?\s*)?(?:every|per|a)\s*month/i,
    explanation:
      "Guaranteed profits or large recurring returns warrant scrutiny. This rule flags the wording and does not evaluate an investment or verify a provider.",
  },
  {
    kind: "investment",
    title: "Investment solicitation",
    severity: "low",
    pattern:
      /\b(?:investment group|invest(?:ment)? (?:with us|opportunity|scheme)|trading group|earn guaranteed)\b/i,
    explanation:
      "The message promotes an investment opportunity. Independently check the provider and offering before deciding whether to engage.",
  },
  {
    kind: "scarcity",
    title: "Scarcity tactic",
    severity: "low",
    pattern:
      /\b(?:limited (?:seats|spots|time)|last chance|only \d+ (?:seats|spots))\b/i,
    explanation:
      "Claims of limited availability can pressure recipients to act before checking an offer.",
  },
  {
    kind: "credentials",
    title: "Sensitive information request",
    severity: "high",
    pattern: /\b(?:password|card pin|cvv|banking pin|login credentials)\b/i,
    condition: (text) =>
      /\b(?:send|share|provide|enter|tell|give|reply)\b/i.test(text) &&
      !/\b(?:never|do not|don't)\s+(?:\w+\s+){0,3}(?:share|send|give|provide|enter|tell)\b/i.test(
        text,
      ),
    explanation:
      "The message appears to request sensitive banking information. Avoid entering credentials into a destination supplied in an unsolicited message.",
  },
];

export function detectSignals(text: string): DetectedSignal[] {
  return rules.flatMap((rule) => {
    const match = text.match(rule.pattern);
    if (!match || (rule.condition && !rule.condition(text))) return [];
    return [
      {
        id: `signal-${rule.kind}`,
        kind: rule.kind,
        title: rule.title,
        explanation: rule.explanation,
        severity: rule.severity,
        matchedText: match[0],
      },
    ];
  });
}

function assessRisk(signals: DetectedSignal[]): RiskLevel {
  const kinds = new Set(signals.map((signal) => signal.kind));
  if (
    signals.some((signal) => signal.severity === "high") ||
    (kinds.has("kyc") && kinds.has("external_link") && kinds.has("urgency"))
  )
    return "high";
  return signals.length > 0 ? "medium" : "low";
}

function safetyActions(signals: DetectedSignal[]): SafetyAction[] {
  const sensitive = signals.some(
    (signal) => signal.kind === "otp_request" || signal.kind === "credentials",
  );
  return [
    ...(sensitive
      ? [
          {
            id: "protect-codes",
            title: "Keep codes and credentials private",
            description:
              "Do not reply with a one-time code, password, PIN, or card security code.",
          },
        ]
      : []),
    ...(signals.some((signal) => signal.kind === "external_link")
      ? [
          {
            id: "avoid-link",
            title: "Use your usual banking channel",
            description:
              "Open the banking app or type a known address yourself instead of following the message's link.",
          },
        ]
      : []),
    ...(signals.some(
      (signal) => signal.kind === "returns" || signal.kind === "investment",
    )
      ? [
          {
            id: "check-offer",
            title: "Check the provider independently",
            description:
              "Verify the provider and offering through independent official sources before investing or sending funds.",
          },
        ]
      : []),
    {
      id: "verify-sender",
      title: "Verify through an independent channel",
      description:
        "Use contact details from your banking app or the back of your card to check an unexpected request.",
    },
    {
      id: "pause",
      title: signals.length
        ? "Pause before taking action"
        : "Keep your usual precautions",
      description: signals.length
        ? "Avoid sending money or personal information until the request is independently confirmed."
        : "No strong patterns matched these rules. Stay cautious with unexpected requests; the sender and message remain unverified.",
    },
  ];
}

export function analyzeMessage(
  text: string,
  id: string,
  createdAt: string,
): ScamCase {
  const trimmed = text.trim();
  if (!trimmed || trimmed.length > MAX_MESSAGE_LENGTH)
    throw new Error(
      `Enter a message between 1 and ${MAX_MESSAGE_LENGTH.toLocaleString()} characters.`,
    );
  const signals = detectSignals(trimmed);
  const level = assessRisk(signals);
  const summary =
    level === "high"
      ? "Strong warning patterns detected. Pause and independently verify the request before taking action."
      : level === "medium"
        ? "Some wording warrants caution. Check the context and sender through an independent channel."
        : "No strong scam indicators detected by these rules. This does not establish that the message is safe.";
  const note = signals.length
    ? `The message matches ${signals.length} local text ${signals.length === 1 ? "pattern" : "patterns"}: ${signals.map((signal) => signal.title.toLowerCase()).join(", ")}. These matches are preliminary and do not establish fraud or verify any claim.`
    : "This message does not match the current set of scam-related text patterns. A lack of matches is not proof of safety. Identity, context, and any claims still need independent verification.";
  return {
    id,
    title: "Message assessment",
    createdAt,
    status: "preliminary",
    message: {
      id: `message-${id}`,
      text: trimmed,
      source: "manual",
      receivedAt: createdAt,
    },
    assessment: {
      level,
      method: "local_rules",
      summary,
      limitations: LIMITATIONS,
    },
    signals,
    note: { id: `note-${id}`, status: "rule_generated", text: note },
    actions: safetyActions(signals),
    agents: COURTROOM_AGENTS.map((agent) => ({ ...agent })),
    evidence: [
      {
        id: `evidence-${id}`,
        type: "message",
        status: "unverified",
        label: "User-provided message text",
      },
    ],
  };
}
