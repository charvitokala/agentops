import assert from "node:assert/strict";
import { test } from "node:test";
import { JSDOM } from "jsdom";
import { renderMessages } from "../src/ui/view.ts";
import { MessageNavigation } from "../src/ui/message-navigation.ts";
import { messagePreview, summarizeMessage } from "../src/ui/message-summary.ts";
import { analyzeMessage } from "../src/detection/analyze-message.ts";
import { cardInsights, investigationSummary } from "../src/ui/card-insights.ts";

const message = (id, text, email) => ({
  id,
  text,
  email,
  urls: [],
  direction: "incoming",
  observedAt: "2026-10-24T10:00:00.000Z",
});
const snapshot = (messages) => ({
  enabled: true,
  status: "ready",
  conversation: { id: "test", label: "Fixture" },
  messages,
  assessments: messages.map((item) =>
    analyzeMessage(item, "2026-10-24T10:00:00.000Z"),
  ),
});

test("local summaries describe content, use cautious excerpts and generate actual ten-word previews", () => {
  assert.equal(
    summarizeMessage(
      message(
        "delivery",
        "Your credit card has been delivered. Never share your OTP.",
      ),
    ),
    "This message says a credit card has been delivered. It also advises keeping banking details private.",
  );
  assert.match(
    summarizeMessage(
      message(
        "kyc",
        "Your bank account will be blocked in 10 minutes. Verify your KYC immediately.",
      ),
    ),
    /warns.*account.*KYC verification/,
  );
  assert.match(
    summarizeMessage(message("negative", "No credit card has been delivered.")),
    /^Message excerpt:/,
  );
  assert.match(
    summarizeMessage(message("unknown", "Account Balance Update.")),
    /^Message excerpt:/,
  );
  assert.match(
    summarizeMessage(
      message("mixed", "Never share your OTP. Send me your PIN."),
    ),
    /^Message excerpt:.*Send me your PIN/,
  );
  const email = message(
    "email",
    "Subject: Account notice\n\nOne two three four five six seven eight nine ten eleven twelve",
    { sender: "Example", subject: "Account notice" },
  );
  assert.equal(
    messagePreview(email),
    "One two three four five six seven eight nine ten…",
  );
  assert.ok(!summarizeMessage(email).includes("Subject:"));
  assert.match(summarizeMessage(message("none", "")), /No readable/);
});

test("dashboard retains all messages, technical details and unchanged DOM across snapshots", () => {
  const dom = new JSDOM("<main></main>");
  try {
    const container = dom.window.document.querySelector("main");
    const data = snapshot([
      message("one", "Never share your OTP."),
      message("two", "Send your OTP immediately."),
    ]);
    renderMessages(container, data);
    const first = container.children[0];
    const second = container.children[1];
    const stableId = first.id;
    first.querySelector("details").open = true;
    const assessmentBefore = globalThis.structuredClone(data.assessments);
    renderMessages(container, { ...data, updatedAt: "later" });
    assert.equal(container.children[0], first);
    assert.equal(container.children[1], second);
    assert.equal(first.querySelector("details").open, true);
    for (const section of container.children) {
      assert.equal(section.querySelectorAll(".dashboard-card").length, 7);
      assert.match(
        section.querySelector("details").textContent,
        /Observed.*Preliminary rule-based assessment.*local_rules.*No AI agents/,
      );
      assert.match(
        section.querySelector("details > summary").textContent,
        /Technical Details/,
      );
    }
    assert.match(
      first.querySelector(".risk-status-card").textContent,
      /Final JudgmentLow indicators/,
    );
    assert.doesNotMatch(
      first.querySelector(".risk-status-card").textContent,
      /Verified safe|^Safe$/,
    );
    assert.deepEqual(data.assessments, assessmentBefore);
    const updated = snapshot([
      message("one", "Never share your PIN."),
      data.messages[1],
      data.messages[1],
    ]);
    renderMessages(container, updated);
    assert.equal(container.children.length, 2);
    assert.equal(container.children[0].id, stableId);
    assert.equal(container.children[0].querySelector("details").open, true);
    assert.equal(container.children[1], second);
    renderMessages(container, {
      ...data,
      enabled: false,
      messages: [],
      assessments: [],
    });
    assert.equal(container.children.length, 0);
  } finally {
    dom.window.close();
  }
});

test("sidebar scrolls to exact stable message IDs, tracks visibility and reconciles new/removed nodes", () => {
  const dom = new JSDOM(
    '<aside class="message-navigation"><nav></nav></aside><main></main>',
  );
  const observed = new Set();
  let callback;
  let disconnected = false;
  dom.window.IntersectionObserver = class {
    constructor(handler) {
      callback = handler;
    }
    observe(target) {
      observed.add(target);
    }
    unobserve(target) {
      observed.delete(target);
    }
    disconnect() {
      disconnected = true;
      observed.clear();
    }
  };
  try {
    const container = dom.window.document.querySelector("main");
    const nav = dom.window.document.querySelector("nav");
    const navigation = new MessageNavigation(nav, container);
    let data = snapshot([
      message("first:+91/<>", "Never share your OTP."),
      message(
        "other id",
        "Your monthly statement is available in your usual banking app.",
      ),
    ]);
    renderMessages(container, data);
    navigation.update(data.messages);
    assert.equal(nav.children.length, 2);
    assert.equal(nav.children[0].getAttribute("aria-current"), "true");
    const target = container.children[1];
    let scroll;
    target.scrollIntoView = (options) => {
      scroll = options;
    };
    nav.children[1].click();
    assert.deepEqual(scroll, { behavior: "smooth", block: "start" });
    assert.equal(nav.children[1].getAttribute("aria-controls"), target.id);
    assert.equal(nav.children[1].getAttribute("aria-current"), "true");
    assert.equal(container.children.length, 2); // Navigation never hides other messages.
    callback([
      {
        target: container.children[0],
        isIntersecting: true,
        boundingClientRect: { top: 50 },
      },
    ]);
    assert.equal(nav.children[0].getAttribute("aria-current"), "true");
    data = snapshot([
      data.messages[1],
      message("new", "Account Balance Update."),
    ]);
    renderMessages(container, data);
    navigation.update(data.messages);
    assert.equal(container.children[0], target);
    assert.equal(nav.children[0].textContent, messagePreview(data.messages[0]));
    assert.equal(observed.size, 2);
    navigation.clear();
    assert.equal(nav.children.length, 0);
    assert.equal(dom.window.document.querySelector("aside").hidden, true);
    assert.equal(disconnected, true);
  } finally {
    dom.window.close();
  }
});

test("low scores with cautionary URL signals and insufficient evidence are not labelled safe", () => {
  const dom = new JSDOM("<main></main>");
  try {
    const container = dom.window.document.querySelector("main");
    renderMessages(
      container,
      snapshot([
        message("url", "See https://bit.ly/fictional"),
        message("unclear", "Account Balance Update."),
      ]),
    );
    assert.match(
      container.children[0].querySelector(".risk-status-value").textContent,
      /Low indicators/,
    );
    assert.doesNotMatch(
      container.children[0].querySelector(".risk-status-card").textContent,
      /No flags detected/,
    );
    assert.match(
      container.children[0].querySelector(".explanation-card").textContent,
      /shortened link/i,
    );
    assert.equal(
      container.children[1].querySelector(".risk-status-value").textContent,
      "Insufficient evidence",
    );
  } finally {
    dom.window.close();
  }
});

test("concise role cards contain actual SVG icons, supported findings and bounded advice", () => {
  const dom = new JSDOM("<main></main>");
  try {
    const container = dom.window.document.querySelector("main");
    const data = snapshot([
      message(
        "protective",
        "Reminder: Never share your OTP, PIN, password or card details.",
      ),
      message(
        "threat",
        "Your bank security team needs your OTP immediately. Complete KYC at https://bit.ly/fictional. Guaranteed 20% investment returns per month.",
      ),
      message("short", "Account Balance Update."),
    ]);
    const before = globalThis.structuredClone(data.assessments);
    renderMessages(container, data);
    for (const section of container.children) {
      assert.equal(section.querySelectorAll("svg.card-icon").length, 5);
      for (const icon of section.querySelectorAll("svg.card-icon")) {
        assert.equal(icon.namespaceURI, "http://www.w3.org/2000/svg");
        assert.ok(icon.querySelector("path"));
        assert.equal(icon.getAttribute("aria-hidden"), "true");
      }
      assert.equal(
        section.querySelector(".defender-card h3").textContent,
        "Defender",
      );
      assert.equal(
        section.querySelector(".prosecutor-card h3").textContent,
        "Prosecuter",
      );
      assert.equal(
        section.querySelector(".message-summary-card h3").textContent,
        "Investigation",
      );
      assert.ok(section.querySelectorAll(".defender-card li").length <= 3);
      assert.ok(section.querySelectorAll(".prosecutor-card li").length <= 3);
      assert.ok(section.querySelectorAll(".actions-card li").length <= 2);
      assert.match(
        section.querySelector(".risk-caution").textContent,
        /Local rules.*no agents run/,
      );
    }
    assert.match(
      container.children[0].querySelector(".defender-card").textContent,
      /Advises protecting.*No urgent action/,
    );
    assert.match(
      container.children[0].querySelector(".prosecutor-card").textContent,
      /No warning signs matched/,
    );
    assert.match(
      container.children[1].querySelector(".prosecutor-card").textContent,
      /private codes.*guaranteed.*Shortened link/,
    );
    assert.equal(
      container.children[1].querySelector(".message-text").textContent,
      data.messages[1].text,
    );
    assert.equal(
      container.children[1].querySelector(".fraud-risk-score-value")
        .textContent,
      `${data.assessments[1].riskScore}%`,
    );
    assert.match(
      container.children[2].querySelector(".defender-card").textContent,
      /Too little context/,
    );
    assert.deepEqual(data.assessments, before);
    const insights = cardInsights(data.messages[1], data.assessments[1]);
    assert.equal(insights.prosecutor.length, 3);
    const excerpt = investigationSummary(
      message(
        "long",
        "First sentence. Second sentence. Third sentence. More context.",
      ),
    );
    assert.match(excerpt, /^Message excerpt:/);
    assert.doesNotMatch(excerpt, /Third sentence/);
  } finally {
    dom.window.close();
  }
});
