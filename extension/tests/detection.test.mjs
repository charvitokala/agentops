import assert from "node:assert/strict";
import { test } from "node:test";
import {
  analyzeMessage,
  classifyRisk,
} from "../src/detection/analyze-message.ts";
import { isPreliminaryAssessment } from "../src/detection/types.ts";

const time = "2026-10-24T14:00:00.000Z";
const assess = (text, urls = []) =>
  analyzeMessage({ id: "fictional-message", text, urls }, time);

const cases = [
  {
    name: "urgent bank KYC phishing",
    text: "Dear customer, your bank account will be blocked within 30 minutes. Complete KYC immediately at https://secure-kyc-update.example or lose access.",
    risk: "high",
    score: 65,
    category: "kyc",
    signal: "kyc-request",
    action: /banking app/,
  },
  {
    name: "explicit OTP sharing request",
    text: "Send me your OTP.",
    risk: "medium",
    score: 45,
    category: "credentials",
    signal: "credential-request",
    action: /Do not share your OTP/,
  },
  {
    name: "protective OTP warning",
    text: "Never share your OTP with anyone.",
    risk: "low",
    score: 0,
    category: "unknown",
    absent: "credential-request",
    action: /Keep your OTP/,
  },
  {
    name: "suspicious UPI PIN request",
    text: "Enter your UPI PIN to receive money.",
    risk: "medium",
    score: 45,
    category: "upi",
    signal: "upi-pin-receive",
    action: /Do not enter your UPI PIN to receive money/,
  },
  {
    name: "guaranteed investment returns",
    text: "Join our investment group and earn guaranteed 15% returns every month. Limited seats available.",
    risk: "medium",
    score: 45,
    category: "investment",
    signal: "guaranteed-returns",
    action: /Do not send money based on guaranteed returns/,
  },
  {
    name: "upfront loan fee",
    text: "Pay a processing fee before we release your loan.",
    risk: "medium",
    score: 35,
    category: "loan",
    signal: "loan-upfront-fee",
    action: /upfront fees.*checked the lender/,
  },
  {
    name: "refund requiring advance payment",
    text: "Pay an advance fee first to receive your refund.",
    risk: "medium",
    score: 40,
    category: "upi",
    signal: "refund-advance",
    action: /Do not pay fees to receive a refund/,
  },
  {
    name: "legitimate account statement notification",
    text: "Your monthly account statement is available in your banking app. Please sign in through your usual banking channel to view it.",
    risk: "low",
    score: 0,
    category: "banking",
    noSignals: true,
    summary: /does not mean.*verified safe/,
  },
  {
    name: "generic banking message",
    text: "There is a message about your bank.",
    risk: "insufficient_evidence",
    score: 0,
    category: "unknown",
    noSignals: true,
    summary: /Not enough information/,
  },
  {
    name: "shortened URL without proof of fraud",
    text: "Read this https://bit.ly/fictional",
    risk: "low",
    score: 25,
    category: "unknown",
    signal: "url-pattern",
    action: /Do not open the link/,
  },
  {
    name: "financial lookalike domain",
    text: "Bank notice at https://paypa1.example/login",
    risk: "low",
    score: 25,
    category: "unknown",
    signal: "url-pattern",
    summary: /do not prove.*fraudulent/,
  },
  {
    name: "empty message",
    text: "",
    risk: "insufficient_evidence",
    score: 0,
    category: "unknown",
    noSignals: true,
    summary: /Not enough information/,
  },
  {
    name: "very short ambiguous message",
    text: "OTP",
    risk: "insufficient_evidence",
    score: 0,
    category: "unknown",
    noSignals: true,
  },
  {
    name: "multiline message",
    text: "Your bank security team needs your OTP.\nReply with the six-digit code immediately.",
    risk: "high",
    score: 65,
    category: "credentials",
    signal: "credential-request",
    summary: /pressures you/,
  },
  {
    name: "mixed-case message",
    text: "SEND Me YOUR oTp IMMEDIATELY.",
    risk: "medium",
    score: 55,
    category: "credentials",
    signal: "credential-request",
  },
  {
    name: "overlapping credential requests count once",
    text: "Send your OTP, share your OTP, give your PIN and send your password.",
    risk: "medium",
    score: 45,
    category: "credentials",
    signal: "credential-request",
  },
  {
    name: "QR scan presented as receiving money",
    text: "Scan this QR code to receive your refund.",
    risk: "medium",
    score: 35,
    category: "upi",
    signal: "upi-qr-receive",
    action: /Do not scan a QR code/,
  },
  {
    name: "collect approval presented as receiving money",
    text: "Approve this UPI collect request to receive money.",
    risk: "medium",
    score: 35,
    category: "upi",
    signal: "upi-collect-receive",
    action: /Do not approve a collect request/,
  },
  {
    name: "insurance benefit release fee",
    text: "Pay a release fee to claim your insurance benefit.",
    risk: "medium",
    score: 35,
    category: "insurance",
    signal: "insurance-release-fee",
    action: /Do not pay a fee.*insurance benefits/,
  },
  {
    name: "immediate insurance cancellation",
    text: "Your insurance policy will be cancelled immediately unless you pay the premium.",
    risk: "low",
    score: 25,
    category: "insurance",
    signal: "policy-cancellation",
    action: /Contact your insurer/,
  },
  {
    name: "pressured policy renewal",
    text: "Renew your insurance policy immediately and pay the renewal premium.",
    risk: "low",
    score: 20,
    category: "insurance",
    signal: "policy-renewal-demand",
    action: /Contact your insurer/,
  },
  {
    name: "guaranteed loan approval",
    text: "We offer guaranteed loan approval without checks.",
    risk: "low",
    score: 20,
    category: "loan",
    signal: "guaranteed-loan",
    action: /Check the lender/,
  },
];

for (const example of cases)
  test(example.name, () => {
    const result = assess(example.text);
    assert.equal(result.riskLevel, example.risk);
    assert.equal(result.riskScore, example.score);
    assert.equal(result.category, example.category);
    assert.equal(result.messageId, "fictional-message");
    assert.equal(result.analysisMethod, "local_rules");
    assert.equal(result.analyzedAt, time);
    assert.ok(isPreliminaryAssessment(result));
    assert.ok(result.summary.length <= 220);
    assert.ok(result.summary.split(/(?<=[.!?])\s+/).length <= 2);
    assert.ok(result.recommendedActions.length > 0);
    if (example.signal)
      assert.ok(result.signals.some((signal) => signal.id === example.signal));
    if (example.absent)
      assert.ok(!result.signals.some((signal) => signal.id === example.absent));
    if (example.noSignals) assert.deepEqual(result.signals, []);
    if (example.summary) assert.match(result.summary, example.summary);
    if (example.action)
      assert.ok(
        result.recommendedActions.some((action) => example.action.test(action)),
      );
  });

test("protective and reported bank advice is not a disclosure request", () => {
  for (const text of [
    "Do not send your PIN.",
    "Don't share your password.",
    "Your bank security team will never ask you to share your OTP.",
    "We will not ask you to send your OTP.",
    "No bank will ask you to provide your PIN.",
  ]) {
    const result = assess(text);
    assert.ok(
      !result.signals.some((signal) => signal.id === "credential-request"),
      text,
    );
  }
});

test("protective advice in one clause does not hide a later actual request", () => {
  const result = assess(
    "Never share your OTP. Send me your UPI PIN immediately.",
  );
  assert.equal(result.riskLevel, "medium");
  assert.ok(
    result.signals.some((signal) => signal.id === "credential-request"),
  );
});

test("ordinary mentions of bank, KYC, OTP and UPI never become high risk alone", () => {
  for (const text of [
    "Bank",
    "KYC",
    "Your OTP is 123456.",
    "UPI payment completed.",
    "Your account is active.",
    "There is no guaranteed return on this investment.",
  ])
    assert.notEqual(assess(text).riskLevel, "high");
});

test("repeated KYC, urgency and investment promises do not multiply weights", () => {
  const once = assess(
    "Complete KYC immediately. Your account will be blocked within 30 minutes. https://secure-kyc-update.example",
  );
  const repeated = assess(
    "Complete KYC immediately. Complete KYC immediately. Your account will be blocked within 30 minutes. Your account will be blocked within 30 minutes. https://secure-kyc-update.example",
  );
  assert.equal(once.riskScore, repeated.riskScore);
  assert.equal(once.riskScore, 65);
  assert.equal(
    once.signals.some((signal) => signal.id === "urgency"),
    false,
  );
  const investment = assess(
    "Guaranteed 15% returns per month. Risk-free investment with zero risk. Limited time, act now immediately.",
  );
  assert.equal(investment.riskScore, 45);
});

test("overlapping UPI PIN and QR instructions count the main action once", () => {
  const result = assess(
    "Scan the QR code and enter your UPI PIN to receive money.",
  );
  assert.equal(result.riskScore, 45);
  assert.equal(result.signals.length, 1);
});

test("URL feature types are checked without visiting them and capped to one URL weight", () => {
  const urls = [
    "http://192.0.2.1/bank",
    "https://[2001:db8::1]/verify",
    "https://xn--pple-43d.example/",
    "https://sbi.login.unrelated.example/",
    "https://a.b.c.d.example/",
    "https://paypa1.example/",
  ];
  for (const url of urls) {
    const result = assess("Bank verification notice.", [url]);
    assert.equal(
      result.signals.filter((signal) => signal.id === "url-pattern").length,
      1,
      url,
    );
    assert.equal(result.riskScore, 25, url);
    assert.match(result.signals[0].explanation, /not proof of fraud/);
  }
  assert.equal(assess("Bank verification notice.", urls).riskScore, 25);
});

test("unfamiliar domains alone are not declared suspicious or verified", () => {
  for (const url of [
    "https://fictional-business.example/notice",
    "https://paypal.com/",
    "https://www.sbi.co.in/",
    "not a valid URL",
    "javascript:alert(1)",
  ]) {
    const result = assess("A notice is available.", [url]);
    assert.equal(result.riskScore, 0, url);
    assert.equal(result.riskLevel, "insufficient_evidence");
  }
});

test("credentials entered into a linked form are flagged while ordinary app sign-in is not", () => {
  assert.equal(
    assess(
      "Enter your password on this bank verification page: https://secure-bank-login.example",
    ).riskLevel,
    "high",
  );
  assert.equal(
    assess("Enter your password in your usual banking app.").signals.some(
      (signal) => signal.id === "credential-request",
    ),
    false,
  );
});

test("HTTP is weighted in financial context, not every ordinary link", () => {
  assert.equal(
    assess("Bank notice.", ["http://business.example"]).riskScore,
    25,
  );
  assert.equal(
    assess("Read the weather.", ["http://business.example"]).riskScore,
    0,
  );
});

test("scoring thresholds are centralized and severity is capped at 100", () => {
  for (const [score, expected] of [
    [0, "insufficient_evidence"],
    [1, "low"],
    [29, "low"],
    [30, "medium"],
    [59, "medium"],
    [60, "high"],
    [100, "high"],
  ])
    assert.equal(classifyRisk(score), expected);
  const result = assess(
    "Your bank security team needs your OTP immediately. Complete KYC at http://secure-kyc-update.example. Guaranteed 20% investment returns per month.",
  );
  assert.equal(result.riskScore, 100);
  assert.equal(result.riskLevel, "high");
  assert.equal(
    new Set(result.recommendedActions).size,
    result.recommendedActions.length,
  );
});

test("identical input and explicit analysis time produce identical assessments", () => {
  const original = { id: "immutable", text: "Send your OTP.", urls: [] };
  const before = globalThis.structuredClone(original);
  assert.deepEqual(
    analyzeMessage(original, time),
    analyzeMessage(original, time),
  );
  assert.deepEqual(original, before);
});

test("direct first-person requests are distinguished from normal OTP-use instructions", () => {
  const requested = assess("We need your OTP to cancel a transfer.");
  assert.equal(requested.riskScore, 45);
  assert.equal(requested.category, "credentials");
  assert.equal(
    assess("You need your OTP to sign in to your usual banking app.").riskScore,
    0,
  );
  assert.equal(
    assess("We will not require you to share your OTP.").signals.some(
      (signal) => signal.id === "credential-request",
    ),
    false,
  );
});

test("numerical upfront-payment requests do not require the literal word fee", () => {
  const refund = assess("Pay ₹499 first to receive your refund.");
  assert.equal(refund.riskScore, 40);
  assert.ok(
    refund.recommendedActions.some((action) =>
      action.includes("Do not pay fees to receive a refund"),
    ),
  );
  const loan = assess("Pay ₹500 before loan disbursement.");
  assert.equal(loan.riskScore, 35);
  assert.equal(loan.category, "loan");
  assert.equal(
    assess("Do not pay ₹500 before loan disbursement.").riskScore,
    0,
  );
});
