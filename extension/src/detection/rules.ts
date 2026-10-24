import type { ScamCategory } from "./types.ts";

export const SCORING = { high: 60, medium: 30, maximum: 100 } as const;
export const WEIGHTS = {
  credentialRequest: 45,
  pinToReceive: 45,
  accountThreat: 25,
  verificationRequest: 15,
  urlPattern: 25,
  bankClaim: 10,
  guaranteedReturns: 35,
  riskFreeInvestment: 25,
  loanUpfrontFee: 35,
  guaranteedLoan: 20,
  refundAdvance: 40,
  qrToReceive: 35,
  collectToReceive: 35,
  insuranceReleaseFee: 35,
  policyThreat: 25,
  renewalPressure: 20,
  urgency: 10,
} as const;

export interface TextRule {
  id: string;
  label: string;
  explanation: string;
  weight: number;
  category: ScamCategory;
  /** Overlapping ways of describing the same action count only once. */
  group: string;
  matches: (context: RuleContext) => boolean;
}

export interface RuleContext {
  text: string;
  sentences: string[];
}

export function normalizeText(text: string): string {
  return text
    .normalize("NFKC")
    .replace(/[’‘]/g, "'")
    .toLowerCase()
    .replace(/[\t\r ]+/g, " ")
    .trim();
}

export const FINANCIAL_CONTEXT =
  /\b(?:bank(?:ing)?|accounts?|kyc|otp|upi|pins?|passwords?|cards?|loans?|insurance|policy|refunds?|invest(?:ment)?|returns?|payments?|money|funds?)\b/i;
export const PRESSURE =
  /\b(?:immediately|urgent(?:ly)?|act now|right now|within \d+ (?:minutes?|hours?)|limited (?:time|seats|slots)|last chance|today only)\b/i;
const SECRET =
  "(?:otp|one[ -]?time (?:password|code)|six[ -]digit code|verification code|upi pin|pin|password|passcode|cvv|card (?:number|details|pin)|banking credentials)";

/** Negation is checked at each action, not globally across the entire message. */
export function hasRequest(
  text: string,
  actions: string,
  target: string,
): boolean {
  const pattern = new RegExp(
    `\\b(?:${actions})\\b.{0,85}?\\b(?:${target})\\b`,
    "gi",
  );
  for (const match of text.matchAll(pattern)) {
    const prefix =
      text
        .slice(0, match.index)
        .split(/[,.!?;\n]/)
        .at(-1) ?? "";
    if (
      /(?:\bdo not|\bdon't|\bwill not|\bwon't|\bdoes not|\bdoesn't|\bnever|\bavoid|\bmust not|\bshould not|\bnot to|\brefuse to)\s+(?:[a-z]+[ -]+){0,5}$/i.test(
        prefix,
      )
    )
      continue;
    if (/\b(?:no (?:bank|one)|nobody)\b.{0,65}$/i.test(prefix)) continue;
    return true;
  }
  return false;
}

function credentialRequest({ sentences }: RuleContext): boolean {
  return sentences.some(
    (sentence) =>
      hasRequest(
        sentence,
        "send|share|give|provide|tell|reply|forward|disclose|reveal",
        SECRET,
      ) ||
      hasRequest(sentence, "(?:i|we) (?:need|require)", SECRET) ||
      (hasRequest(
        sentence,
        "enter|type",
        "(?:your )?(?:password|passcode|cvv|card (?:number|details|pin))",
      ) &&
        /https?:\/\/|www\.|\b(?:link|form|website|page)\b/.test(sentence)) ||
      (/\b(?:bank|security|support) team (?:needs?|requires?)\b/.test(
        sentence,
      ) &&
        new RegExp(`\\b${SECRET}\\b`).test(sentence) &&
        !/\b(?:never|do not|don't)\b/.test(sentence)),
  );
}

function receiveContext(text: string): boolean {
  return /\b(?:receive|receiving|claim|get|accept)\b.{0,55}\b(?:money|refund|payment|funds|cash|credit)\b|\b(?:money|refund|payment|funds)\b.{0,35}\b(?:receive|receiving)\b/.test(
    text,
  );
}

function upfrontFee(sentence: string): boolean {
  return (
    hasRequest(
      sentence,
      "pay|send|transfer|deposit|remit",
      "(?:upfront |advance |processing |release |registration )?(?:fees?|charges?|payment|deposit|money|amount|rupees|rs)|[1-9]\\d*(?:[.,]\\d+)*",
    ) ||
    (/\b(?:upfront|advance|processing|release) (?:fees?|payment|charges?)\b.{0,35}\b(?:required|must|first|before)\b/.test(
      sentence,
    ) &&
      !/\b(?:no|never|do not|don't)\b/.test(sentence))
  );
}

export const TEXT_RULES: readonly TextRule[] = [
  {
    id: "upi-pin-receive",
    label: "PIN requested to receive money",
    explanation:
      "The message asks for a UPI PIN as part of receiving money. Check this payment instruction before doing anything.",
    weight: WEIGHTS.pinToReceive,
    category: "upi",
    group: "sensitive_request",
    matches: ({ sentences }) =>
      sentences.some(
        (sentence) =>
          receiveContext(sentence) &&
          hasRequest(
            sentence,
            "enter|type|share|send|provide",
            "(?:your )?(?:upi )?pin",
          ),
      ),
  },
  {
    id: "credential-request",
    label: "Private code or details requested",
    explanation:
      "The message asks you to disclose a code, password, PIN or card details. Mentioning an OTP alone does not trigger this rule.",
    weight: WEIGHTS.credentialRequest,
    category: "credentials",
    group: "sensitive_request",
    matches: credentialRequest,
  },
  {
    id: "refund-advance",
    label: "Payment required for a refund",
    explanation:
      "The message links receiving a refund to making a payment or paying a fee first.",
    weight: WEIGHTS.refundAdvance,
    category: "upi",
    group: "advance_payment",
    matches: ({ sentences }) =>
      sentences.some(
        (sentence) =>
          /\brefund\b/.test(sentence) &&
          upfrontFee(sentence) &&
          /\b(?:before|first|release|receive|receiving|claim|to get|in order to)\b/.test(
            sentence,
          ),
      ),
  },
  {
    id: "loan-upfront-fee",
    label: "Upfront loan fee",
    explanation:
      "The message asks for an advance or processing payment before a loan is approved or released.",
    weight: WEIGHTS.loanUpfrontFee,
    category: "loan",
    group: "advance_payment",
    matches: ({ sentences }) =>
      sentences.some(
        (sentence) =>
          /\bloan\b/.test(sentence) &&
          upfrontFee(sentence) &&
          /\b(?:upfront|advance|processing|before|first|release|disburs\w*)\b/.test(
            sentence,
          ),
      ),
  },
  {
    id: "insurance-release-fee",
    label: "Fee to release insurance benefits",
    explanation:
      "The message asks for a payment to release an insurance claim or benefit.",
    weight: WEIGHTS.insuranceReleaseFee,
    category: "insurance",
    group: "advance_payment",
    matches: ({ sentences }) =>
      sentences.some(
        (sentence) =>
          /\b(?:insurance|policy|insurer)\b/.test(sentence) &&
          upfrontFee(sentence) &&
          /\b(?:release|claim|benefit|payout)\b/.test(sentence),
      ),
  },
  {
    id: "upi-qr-receive",
    label: "QR scan presented as receiving money",
    explanation:
      "The message asks you to scan a QR code to receive money. A QR code can initiate a payment instead.",
    weight: WEIGHTS.qrToReceive,
    category: "upi",
    group: "receive_payment",
    matches: ({ sentences }) =>
      sentences.some(
        (sentence) =>
          receiveContext(sentence) &&
          hasRequest(sentence, "scan|use", "qr(?:[ -]code)?"),
      ),
  },
  {
    id: "upi-collect-receive",
    label: "Collect approval presented as receiving money",
    explanation:
      "The message links accepting a collect request or payment approval to receiving money.",
    weight: WEIGHTS.collectToReceive,
    category: "upi",
    group: "receive_payment",
    matches: ({ sentences }) =>
      sentences.some(
        (sentence) =>
          receiveContext(sentence) &&
          hasRequest(
            sentence,
            "approve|accept|confirm",
            "(?:upi )?(?:collect|payment) (?:request|instruction)",
          ),
      ),
  },
  {
    id: "account-threat",
    label: "Urgent account-blocking threat",
    explanation:
      "The message threatens account blocking or suspension unless you act. Time pressure can discourage independent checks.",
    weight: WEIGHTS.accountThreat,
    category: "banking",
    group: "pressure",
    matches: ({ sentences }) =>
      sentences.some(
        (sentence) =>
          /\baccount\b/.test(sentence) &&
          /\b(?:will be|being|is|gets?|may be)\b.{0,30}\b(?:blocked|suspended|closed|deactivated)\b/.test(
            sentence,
          ) &&
          (PRESSURE.test(sentence) ||
            /\b(?:unless|within|now|blocked|suspended)\b/.test(sentence)) &&
          !/\b(?:will not|not be|never|won't)\b/.test(sentence),
      ),
  },
  {
    id: "kyc-request",
    label: "KYC update requested",
    explanation:
      "The message asks you to update or verify KYC details. Check the request in your usual banking channel.",
    weight: WEIGHTS.verificationRequest,
    category: "kyc",
    group: "verification",
    matches: ({ sentences }) =>
      sentences.some(
        (sentence) =>
          hasRequest(
            sentence,
            "complete|update|verify|submit|confirm|renew",
            "(?:your )?kyc|know your customer",
          ) ||
          /\bkyc\b.{0,25}\b(?:update|verification) (?:required|needed|due)\b/.test(
            sentence,
          ),
      ),
  },
  {
    id: "account-verification",
    label: "Bank account verification requested",
    explanation:
      "The message directs you to verify banking or account details. The sender has not been verified.",
    weight: WEIGHTS.verificationRequest,
    category: "banking",
    group: "verification",
    matches: ({ sentences }) =>
      sentences.some((sentence) =>
        hasRequest(
          sentence,
          "verify|confirm|update",
          "(?:your )?(?:bank |banking )?(?:account|banking details)",
        ),
      ),
  },
  {
    id: "bank-claim",
    label: "Bank identity claim",
    explanation:
      "The sender claims to be a bank representative or security team. The claim has not been checked.",
    weight: WEIGHTS.bankClaim,
    category: "banking",
    group: "bank_identity",
    matches: ({ text }) =>
      /\b(?:your |our |the )?bank(?:'s)? (?:security|support|fraud|verification) team\b|\b(?:i am|we are|calling|writing) (?:from |a |your )?(?:the )?bank(?: representative| officer| support)?\b/.test(
        text,
      ) && !/\b(?:no bank|never from|not from)\b/.test(text),
  },
  {
    id: "guaranteed-returns",
    label: "Guaranteed or unusually high returns",
    explanation:
      "The message promises investment profits or unusually high recurring returns. These claims need independent checking.",
    weight: WEIGHTS.guaranteedReturns,
    category: "investment",
    group: "investment_promise",
    matches: ({ text }) =>
      /\b(?:invest\w*|trading|returns?|profits?)\b/.test(text) &&
      (/\bguaranteed\b.{0,55}\b(?:returns?|profits?|\d+\s*%)\b|\b(?:returns?|profits?)\b.{0,25}\bguaranteed\b/.test(
        text,
      ) ||
        [
          ...text.matchAll(
            /\b(\d+(?:\.\d+)?)\s*%\s*(?:returns?\s*)?(?:every|per|a)\s*(day|week|month)\b/g,
          ),
        ].some(
          (match) =>
            Number(match[1]) >= ({ day: 1, week: 3, month: 5 }[match[2]] ?? 5),
        )) &&
      !/\b(?:not guaranteed|no guaranteed|never guaranteed)\b/.test(text),
  },
  {
    id: "risk-free-investment",
    label: "Risk-free investment promise",
    explanation:
      "The message presents an investment as risk-free or without losses. Treat this as a claim, not a verified fact.",
    weight: WEIGHTS.riskFreeInvestment,
    category: "investment",
    group: "investment_promise",
    matches: ({ sentences }) =>
      sentences.some(
        (sentence) =>
          /\b(?:invest\w*|trading|returns?|profits?)\b/.test(sentence) &&
          /\b(?:risk[ -]free|zero risk|no (?:risk|losses)|without risk)\b/.test(
            sentence,
          ) &&
          !/\b(?:not risk[ -]free|never risk[ -]free|no investment is risk[ -]free)\b/.test(
            sentence,
          ),
      ),
  },
  {
    id: "guaranteed-loan",
    label: "Guaranteed loan approval",
    explanation:
      "The message promises loan approval without normal checks. Verify the lender and offer independently.",
    weight: WEIGHTS.guaranteedLoan,
    category: "loan",
    group: "loan_promise",
    matches: ({ text }) =>
      /\bguaranteed\b.{0,25}\bloan (?:approval|disburs\w*)\b|\bloan (?:approval|disburs\w*)\b.{0,25}\bguaranteed\b/.test(
        text,
      ) && !/\b(?:not guaranteed|no guaranteed)\b/.test(text),
  },
  {
    id: "policy-cancellation",
    label: "Immediate policy cancellation threat",
    explanation:
      "The message threatens immediate loss of insurance cover unless you respond or pay.",
    weight: WEIGHTS.policyThreat,
    category: "insurance",
    group: "policy_pressure",
    matches: ({ sentences }) =>
      sentences.some(
        (sentence) =>
          /\b(?:insurance|policy)\b/.test(sentence) &&
          /\b(?:cancel\w*|lapse\w*|terminat\w*)\b/.test(sentence) &&
          (PRESSURE.test(sentence) ||
            /\b(?:immediate|unless|within|now)\b/.test(sentence)) &&
          !/\b(?:will not|not be|never|won't)\b/.test(sentence),
      ),
  },
  {
    id: "policy-renewal-demand",
    label: "Pressured policy renewal demand",
    explanation:
      "The message demands urgent renewal payment for an insurance policy. Check with your insurer directly.",
    weight: WEIGHTS.renewalPressure,
    category: "insurance",
    group: "policy_pressure",
    matches: ({ sentences }) =>
      sentences.some(
        (sentence) =>
          /\b(?:insurance|policy)\b/.test(sentence) &&
          /\brenew\w*\b/.test(sentence) &&
          PRESSURE.test(sentence) &&
          hasRequest(
            sentence,
            "pay|send|transfer",
            "(?:renewal )?(?:premium|money|payment|fee|amount)",
          ),
      ),
  },
];

export function isRoutineNotification(text: string): boolean {
  return (
    /\b(?:statement|transaction receipt|monthly summary)\b/.test(text) &&
    /\b(?:available|ready|view)\b/.test(text) &&
    /\b(?:banking app|usual banking channel|usual app)\b/.test(text)
  );
}

export function isProtectiveAdvice(text: string): boolean {
  return (
    /\b(?:otp|pin|password|code)\b/.test(text) &&
    /\b(?:never|do not|don't|must not|should not)\b.{0,35}\b(?:share|send|give|disclose|reveal)\b/.test(
      text,
    )
  );
}
