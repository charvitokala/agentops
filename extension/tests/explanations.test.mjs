import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { URL } from "node:url";
import { JSDOM } from "jsdom";
import { analyzeMessage } from "../src/detection/analyze-message.ts";
import { explainAssessment } from "../src/detection/explanations.ts";
import { AssessmentPipeline } from "../src/content/assessment-pipeline.ts";
import { renderMessages } from "../src/ui/view.ts";

const time = "2026-10-24T14:00:00.000Z";
const suspicious =
  "Your bank account will be blocked in 10 minutes. Verify your KYC at this link immediately.";
const protective =
  "Reminder: Never share your OTP, PIN, password or card details.";
const short = "Account Balance Update.";
const message = (text, id = "selected", urls = []) => ({
  id,
  text,
  urls,
  direction: "incoming",
  observedAt: time,
});
function explain(text, urls = []) {
  const input = message(text, "selected", urls);
  const assessment = analyzeMessage(input, time);
  return { assessment, details: explainAssessment(input, assessment) };
}
const labels = (details) => details.items.map((item) => item.label);
const snapshot = (messages) => ({
  enabled: true,
  status: "ready",
  conversation: { id: "chat-one", label: "Fictional test" },
  messages,
  assessments: messages.map((item) => analyzeMessage(item, time)),
});

test("suspicious banking explanation contains only the actual matched warning signs", () => {
  const { assessment, details } = explain(suspicious);
  assert.equal(assessment.riskLevel, "medium");
  assert.equal(assessment.riskScore, 40);
  assert.equal(details.flagged, true);
  assert.equal(details.heading, "Why VerdictAI Flagged This");
  assert.deepEqual(
    details.items,
    assessment.signals.map(({ label, explanation }) => ({
      label,
      explanation,
    })),
  );
  assert.match(
    details.items.map((item) => item.explanation).join(" "),
    /threatens account blocking/,
  );
  assert.ok(labels(details).includes("KYC update requested"));
  // Mentioning a bank is not a matched identity claim; a link is not a parsed URL.
  assert.ok(!labels(details).includes("Bank identity claim"));
  assert.ok(!labels(details).includes("Link features need checking"));
});

test("high-risk identity and URL explanations retain matched contextual details", () => {
  const { assessment, details } = explain(
    "Your bank security team needs your OTP immediately. Complete KYC at https://bit.ly/fictional.",
  );
  assert.equal(assessment.riskLevel, "high");
  assert.equal(details.heading, "Why VerdictAI Flagged This");
  assert.ok(labels(details).includes("Bank identity claim"));
  assert.match(
    details.items.find((item) => item.label === "Link features need checking")
      .explanation,
    /shortened link hides/,
  );
  assert.match(
    assessment.recommendedActions.join(" "),
    /Do not share your OTP/,
  );
});

test("protective reminder explains negated requests, absent urgency and absent verification", () => {
  const { assessment, details } = explain(protective);
  assert.equal(assessment.riskLevel, "low");
  assert.equal(assessment.riskScore, 0);
  assert.equal(details.flagged, false);
  assert.equal(details.heading, "Why VerdictAI Did NOT Flag This");
  assert.deepEqual(labels(details), [
    "No credential theft request detected",
    "No artificial urgency detected",
    "No suspicious verification request detected",
  ]);
  assert.match(details.items[0].explanation, /advises against sharing/);
  assert.match(
    assessment.recommendedActions.join(" "),
    /Keep your OTP and PIN private/,
  );
});

test("low-indicator URL warning is preserved rather than described as safe", () => {
  const { assessment, details } = explain("Read this https://bit.ly/fictional");
  assert.equal(assessment.riskLevel, "low");
  assert.equal(assessment.riskScore, 25);
  assert.equal(details.heading, "Why VerdictAI Did NOT Flag This");
  assert.match(details.items[0].explanation, /still need checking/);
  assert.match(details.items[1].explanation, /shortened link/);
  assert.equal(details.items.length, 2);
});

test("negative checks never contradict low-scoring verification or urgency matches", () => {
  const { details } = explain("Verify your KYC immediately.");
  assert.ok(labels(details).includes("KYC update requested"));
  assert.ok(
    !labels(details).includes("No suspicious verification request detected"),
  );
  assert.ok(!labels(details).includes("No artificial urgency detected"));
  const policy = explain(
    "Your insurance policy will be cancelled immediately unless you pay.",
  );
  assert.ok(!labels(policy.details).includes("No artificial urgency detected"));
});

test("routine statement explanation describes recognized wording without verifying the sender", () => {
  const { assessment, details } = explain(
    "Your monthly account statement is available in your usual banking app.",
  );
  assert.equal(assessment.riskScore, 0);
  assert.equal(details.heading, "Why VerdictAI Did NOT Flag This");
  assert.match(details.items.at(-1).explanation, /sender is still unverified/);
});

test("short informational heading remains insufficient evidence", () => {
  const { assessment, details } = explain(short);
  assert.equal(assessment.riskLevel, "insufficient_evidence");
  assert.equal(assessment.riskScore, 0);
  assert.equal(details.heading, "Why VerdictAI Could Not Determine the Risk");
  assert.match(
    details.items[0].explanation,
    /short message.*no link.*not give enough context/,
  );
  assert.match(assessment.recommendedActions.join(" "), /Ask for more context/);
});

test("empty, ambiguous, and unrecognized longer messages have distinct inconclusive reasons", () => {
  assert.match(
    explain("").details.items[0].explanation,
    /no readable message text or link/,
  );
  assert.match(explain("OTP").details.items[0].explanation, /only a few words/);
  assert.match(
    explain("There is a message about your bank that you might want to read.")
      .details.items[0].explanation,
    /not recognized as a routine banking notice/,
  );
  const linked = explain("Account Balance Update.", [
    "https://fictional.example/notice",
  ]);
  assert.equal(linked.assessment.riskLevel, "insufficient_evidence");
  assert.match(
    linked.details.items[0].explanation,
    /link without a matched warning is not verified safe/,
  );
  assert.doesNotMatch(linked.details.items[0].explanation, /no link/);
});

test("mixed-case multiline advice does not hide an actual request in another clause", () => {
  const { assessment, details } = explain(
    "NEVER share your OTP.\nSend me your UPI PIN immediately.",
  );
  assert.equal(assessment.riskScore, 55);
  assert.equal(details.flagged, true);
  assert.ok(!labels(details).includes("No credential theft request detected"));
});

test("explanations do not mutate inputs, scores, signals, actions or timestamps", () => {
  for (const text of [
    suspicious,
    protective,
    short,
    "Complete KYC immediately.",
  ]) {
    const input = message(text);
    const assessment = analyzeMessage(input, time);
    const before = globalThis.structuredClone({ input, assessment });
    assert.deepEqual(
      explainAssessment(input, assessment),
      explainAssessment(input, assessment),
    );
    assert.deepEqual({ input, assessment }, before);
  }
});

test("existing cards render independent explanations associated by message ID", () => {
  const dom = new JSDOM("<main id='messages'></main>");
  const previous = Object.getOwnPropertyDescriptor(globalThis, "document");
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: dom.window.document,
  });
  try {
    const container = dom.window.document.querySelector("main");
    const data = snapshot([
      message(suspicious, "one"),
      message(protective, "two"),
      message(short, "three"),
    ]);
    data.assessments.reverse();
    renderMessages(container, data);
    const cards = [...container.querySelectorAll("article.card.message-card")];
    assert.equal(cards.length, 3);
    assert.match(cards[0].textContent, /Why VerdictAI Flagged This/);
    assert.match(cards[1].textContent, /Why VerdictAI Did NOT Flag This/);
    assert.match(
      cards[2].textContent,
      /Why VerdictAI Could Not Determine the Risk/,
    );
    assert.doesNotMatch(cards[1].textContent, /Urgent account-blocking threat/);
    for (const card of cards) {
      assert.ok(card.querySelector(".preliminary-assessment"));
      assert.match(
        card.textContent,
        /Fraud Risk Score.*Rule-based risk score, not a fraud probability/,
      );
      assert.match(card.textContent, /What to do next/);
      assert.match(card.textContent, /Extracted URLs/);
      assert.match(card.textContent, /No AI agents have run/);
    }
  } finally {
    if (previous) Object.defineProperty(globalThis, "document", previous);
    else Reflect.deleteProperty(globalThis, "document");
    dom.window.close();
  }
});

test("monitoring disabled still clears analysis and rendered cards", () => {
  const dom = new JSDOM("<main></main>");
  const previous = Object.getOwnPropertyDescriptor(globalThis, "document");
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: dom.window.document,
  });
  try {
    const pipeline = new AssessmentPipeline();
    const container = dom.window.document.querySelector("main");
    const active = snapshot([message(suspicious)]);
    renderMessages(container, pipeline.reconcile(active));
    assert.match(container.textContent, /Why VerdictAI Flagged This/);
    const disabled = pipeline.reconcile({
      ...active,
      enabled: false,
      status: "disabled",
      conversation: null,
      messages: [],
    });
    assert.deepEqual(disabled.assessments, []);
    renderMessages(container, disabled);
    assert.equal(container.children.length, 0);
  } finally {
    if (previous) Object.defineProperty(globalThis, "document", previous);
    else Reflect.deleteProperty(globalThis, "document");
    dom.window.close();
  }
});

test("popup changes its displayed label while keeping existing button attributes", () => {
  const dom = new JSDOM(
    readFileSync(new URL("../public/popup.html", import.meta.url), "utf8"),
  );
  try {
    const button = dom.window.document.querySelector("#open-debug");
    assert.equal(button.textContent.trim(), "Click for More Info");
    assert.equal(button.className, "primary");
    assert.equal(button.type, "button");
    assert.equal(button.disabled, true);
  } finally {
    dom.window.close();
  }
});

test("Message Verdict title and brand remove only the requested subtitle", () => {
  const dom = new JSDOM(
    readFileSync(new URL("../public/debug.html", import.meta.url), "utf8"),
  );
  try {
    const document = dom.window.document;
    assert.equal(document.title, "Message Verdict · VerdictAI Guardian");
    assert.equal(
      document.querySelector("main > h1").textContent,
      "Message Verdict",
    );
    assert.equal(document.querySelector(".brand div").textContent, "VerdictAI");
    assert.ok(document.querySelector(".brand svg"));
    assert.equal(document.querySelector(".brand span"), null);
    assert.ok(document.querySelector("#monitoring[role='switch']"));
  } finally {
    dom.window.close();
  }
});

test("fraud risk scores retain existing values as text and handle unavailable values safely", () => {
  const dom = new JSDOM("<main></main>");
  const previous = Object.getOwnPropertyDescriptor(globalThis, "document");
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: dom.window.document,
  });
  try {
    const container = dom.window.document.querySelector("main");
    for (const [raw, expected] of [
      [0, 0],
      [29, 29],
      [30, 30],
      [35, 35],
      [59, 59],
      [60, 60],
      [85, 85],
      [100, 100],
      [-10, 0],
      [150, 100],
      [35.5, 35.5],
      [undefined, null],
      [null, null],
      [NaN, null],
      [Infinity, null],
      ["35", null],
    ]) {
      const data = snapshot([message(protective)]);
      // Exercise the presentation boundary without changing detector output.
      data.assessments[0].riskScore = raw;
      renderMessages(container, data);
      const score = container.querySelector(".fraud-risk-score");
      assert.equal(
        score.querySelector(".fraud-risk-score-value").textContent,
        expected === null ? "N/A" : `${expected}%`,
      );
      assert.equal(
        score.querySelector("svg, canvas, meter, progress, [role='meter']"),
        null,
      );
      assert.match(
        score.textContent,
        /Rule-based risk score, not a fraud probability/,
      );
      assert.doesNotMatch(score.textContent, /Fraud Probability:/);
    }
    const unavailable = snapshot([message(protective)]);
    unavailable.assessments = [];
    renderMessages(container, unavailable);
    assert.match(container.textContent, /Assessment unavailable/);
    assert.equal(
      container.querySelector(".fraud-risk-score-value").textContent,
      "N/A",
    );
  } finally {
    if (previous) Object.defineProperty(globalThis, "document", previous);
    else Reflect.deleteProperty(globalThis, "document");
    dom.window.close();
  }
});

test("dashboard explanation and action headings match while score typography is prominent", () => {
  const css = readFileSync(
    new URL("../src/ui/styles.css", import.meta.url),
    "utf8",
  );
  const dom = new JSDOM(`<style>${css}</style><main></main>`);
  const previous = Object.getOwnPropertyDescriptor(globalThis, "document");
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: dom.window.document,
  });
  try {
    const container = dom.window.document.querySelector("main");
    renderMessages(
      container,
      snapshot([
        message(suspicious, "one"),
        message(protective, "two"),
        message(short, "three"),
      ]),
    );
    const headings = container.querySelectorAll(
      ".assessment-explanation-heading",
    );
    assert.equal(headings.length, 9);
    for (const heading of headings) {
      assert.equal(dom.window.getComputedStyle(heading).fontSize, "23px");
      assert.equal(dom.window.getComputedStyle(heading).fontWeight, "600");
      const bullet = heading.parentElement.querySelector("li");
      assert.equal(dom.window.getComputedStyle(bullet).fontSize, "13px");
    }
    const scores = container.querySelectorAll(".fraud-risk-score-value");
    assert.deepEqual(
      [...scores].map((score) => score.textContent),
      ["40%", "0%", "0%"],
    );
    for (const score of scores) {
      assert.equal(
        dom.window.getComputedStyle(score).fontSize,
        "clamp(44px, 5vw, 64px)",
      );
      assert.equal(dom.window.getComputedStyle(score).fontWeight, "700");
    }
  } finally {
    if (previous) Object.defineProperty(globalThis, "document", previous);
    else Reflect.deleteProperty(globalThis, "document");
    dom.window.close();
  }
});
