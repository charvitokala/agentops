import assert from "node:assert/strict";
import { test } from "node:test";
import { JSDOM } from "jsdom";
import { newestFirst } from "../src/ui/message-order.ts";
import { renderLatestRisk } from "../src/ui/latest-risk.ts";
import { renderMessages } from "../src/ui/view.ts";
import { MessageNavigation } from "../src/ui/message-navigation.ts";
import { analyzeMessage } from "../src/detection/analyze-message.ts";

const message = (id, text, observedAt) => ({
  id,
  text,
  observedAt,
  direction: "incoming",
  urls: [],
});
function snapshot(messages) {
  return {
    enabled: true,
    status: "ready",
    messages,
    conversation: { id: "test", label: "Fixture" },
    assessments: messages.map((item) =>
      analyzeMessage(item, "2026-10-24T10:00:00.000Z"),
    ),
  };
}
const older = message(
  "old-id",
  "Send me your OTP.",
  "2026-10-24T15:00:00.000Z",
);
const newer = message(
  "new-id",
  "Never share your OTP.",
  "2026-10-24T10:00:00.000Z",
);

test("newest first follows conversation DOM order, never observation timestamps, without mutating messages", () => {
  const original = [older, newer];
  assert.deepEqual(
    newestFirst(original).map((item) => item.id),
    ["new-id", "old-id"],
  );
  assert.deepEqual(original, [older, newer]);
  assert.deepEqual(newestFirst([]), []);
  assert.deepEqual(newestFirst([newer]), [newer]);
});

test("dashboard and sidebar share newest-first order and keep IDs, findings, scroll links and updates aligned", () => {
  const dom = new JSDOM(
    '<aside class="message-navigation"><nav></nav></aside><main></main>',
  );
  try {
    const container = dom.window.document.querySelector("main");
    const nav = dom.window.document.querySelector("nav");
    const navigation = new MessageNavigation(nav, container);
    const data = snapshot([older, newer]);
    data.assessments.reverse(); // Associations cannot depend on assessment array order.
    let ordered = newestFirst(data.messages);
    renderMessages(container, { ...data, messages: ordered });
    navigation.update(ordered);
    assert.deepEqual(
      [...container.children].map((node) => node.dataset.messageId),
      ["new-id", "old-id"],
    );
    assert.equal(
      container.children[0].querySelector(".fraud-risk-score-value")
        .textContent,
      "0%",
    );
    assert.equal(
      nav.children[0].getAttribute("aria-controls"),
      container.children[0].id,
    );
    assert.equal(nav.children[0].getAttribute("aria-current"), "true");
    const firstNode = container.children[0];
    let scrolled = false;
    container.children[1].scrollIntoView = (options) => {
      scrolled = options.behavior === "smooth";
    };
    nav.children[1].click();
    assert.ok(scrolled);
    const arriving = message(
      "arriving",
      "Your bank security team needs your OTP immediately.",
      "2026-10-24T09:00:00.000Z",
    );
    const updated = snapshot([...data.messages, arriving]);
    ordered = newestFirst(updated.messages);
    renderMessages(container, { ...updated, messages: ordered });
    navigation.update(ordered);
    assert.deepEqual(
      [...container.children].map((node) => node.dataset.messageId),
      ["arriving", "new-id", "old-id"],
    );
    assert.equal(container.children[1], firstNode);
    renderMessages(container, { ...updated, messages: ordered });
    navigation.update(ordered);
    assert.equal(container.children.length, 3);
    assert.equal(nav.children.length, 3);
    navigation.clear();
  } finally {
    dom.window.close();
  }
});

test("popup shows only the latest matching assessment and clears stale results", () => {
  const dom = new JSDOM(
    '<section><h2>Latest Message Risk</h2><p class="latest-risk-value"></p></section>',
  );
  try {
    const container = dom.window.document.querySelector("section");
    const value = container.querySelector("p");
    const data = snapshot([older, newer]);
    data.assessments.reverse();
    renderLatestRisk(container, data);
    assert.equal(container.hidden, false);
    assert.equal(value.textContent, "Low indicators — 0%");
    assert.equal(value.dataset.risk, "low");
    const high = message(
      "high",
      "Your bank security team needs your OTP immediately.",
      newer.observedAt,
    );
    renderLatestRisk(container, snapshot([older, newer, high]));
    assert.equal(value.textContent, "High risk — 65%");
    assert.equal(value.dataset.risk, "high");
    renderLatestRisk(container, snapshot([older]));
    assert.equal(value.textContent, "Medium risk — 45%");
    const missing = {
      ...data,
      assessments: data.assessments.filter(
        (item) => item.messageId !== newer.id,
      ),
    };
    renderLatestRisk(container, missing);
    assert.equal(value.textContent, "Assessment unavailable");
    assert.equal(value.hasAttribute("data-risk"), false);
    renderLatestRisk(
      container,
      snapshot([message("brief", "OTP", newer.observedAt)]),
    );
    assert.equal(value.textContent, "Insufficient evidence — 0%");
    assert.equal(value.dataset.risk, "insufficient_evidence");
    for (const empty of [
      undefined,
      { ...data, enabled: false },
      { ...data, status: "waiting_for_conversation" },
      snapshot([]),
    ]) {
      renderLatestRisk(container, empty);
      assert.equal(container.hidden, true);
      assert.equal(value.textContent, "");
      assert.equal(value.hasAttribute("data-risk"), false);
    }
  } finally {
    dom.window.close();
  }
});
