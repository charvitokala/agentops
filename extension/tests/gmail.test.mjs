import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { URL } from "node:url";
import { JSDOM } from "jsdom";
import { GmailReader, locateGmailRoot } from "../src/content/gmail-reader.ts";
import { startContentController } from "../src/content/controller.ts";
import {
  GMAIL_MONITORING_KEY,
  MONITORING_KEY,
  isSnapshot,
} from "../src/shared/contracts.ts";
import { renderMessages } from "../src/ui/view.ts";
import { waitFor } from "./helpers.mjs";

function fixture() {
  return new JSDOM(
    `
    <aside>Inbox preview: Share your OTP.</aside>
    <main role="main"><h2 class="hP">Account notice</h2>
      <div class="adn" data-message-id="one">
        <span class="gD" email="fictional@example.test">Fictional Sender</span>
        <div class="a3s"><p>Your bank security team needs your OTP immediately.</p>
          <p>Verify at <a href="https://bit.ly/fictional">this link</a>.</p>
          <div hidden>Hidden text must not be read.</div>
          <a hidden href="https://hidden.example">hidden link</a>
        </div>
      </div>
      <div class="adn" style="display:none" data-message-id="hidden"><div class="a3s">Hidden email</div></div>
      <div contenteditable="true" role="textbox"><div class="a3s">Unsent draft</div></div>
    </main>`,
    {
      url: "https://mail.google.com/mail/u/0/#inbox/thread-one",
      pretendToBeVisual: true,
    },
  );
}

test("Gmail extracts only the open email sender, subject, visible body and URLs", () => {
  const dom = fixture();
  try {
    const reader = new GmailReader();
    const root = locateGmailRoot(dom.window.document);
    const result = reader.read(root, "2026-10-24T14:00:00.000Z");
    assert.equal(result.status, "ready");
    assert.equal(result.messages.length, 1);
    const message = result.messages[0];
    assert.deepEqual(message.email, {
      sender: "Fictional Sender <fictional@example.test>",
      subject: "Account notice",
    });
    assert.match(
      message.text,
      /Subject: Account notice\n\nYour bank security team/,
    );
    assert.doesNotMatch(message.text, /Inbox preview|Hidden|Unsent draft/);
    assert.deepEqual(message.urls, ["https://bit.ly/fictional"]);
    assert.equal(message.direction, "unknown");
    assert.equal(reader.read(root).messages[0].observedAt, message.observedAt);
    assert.equal(reader.read(root).messages[0].id, message.id);
  } finally {
    dom.window.close();
  }
});

test("Gmail reconciles the last expanded message, edits, multiline text and thread switching", () => {
  const dom = fixture();
  try {
    const reader = new GmailReader();
    const root = locateGmailRoot(dom.window.document);
    const first = reader.read(root).messages[0];
    const owner = dom.window.document.createElement("div");
    owner.className = "adn";
    owner.dataset.messageId = "two";
    owner.innerHTML =
      '<span class="gD" email="second@example.test">Second sender</span><div class="a3s">Never share your OTP.<br>Keep it private. ✓</div>';
    root.append(owner);
    const second = reader.read(root).messages[0];
    assert.notEqual(second.id, first.id);
    assert.match(second.text, /OTP\.\nKeep it private\. ✓/);
    assert.equal(reader.read(root).messages.length, 1);
    owner.querySelector(".a3s").textContent = "Updated body";
    assert.equal(reader.read(root).messages[0].id, second.id);
    assert.match(reader.read(root).messages[0].text, /Updated body/);
    dom.window.location.hash = "#inbox/thread-two";
    assert.notEqual(reader.read(root).messages[0].id, second.id);
    root.querySelector("h2").remove();
    assert.equal(reader.read(root).messages.length, 0);
    assert.equal(reader.read(null).status, "waiting_for_conversation");
  } finally {
    dom.window.close();
  }
});

function event() {
  const listeners = new Set();
  return {
    addListener: (listener) => listeners.add(listener),
    removeListener: (listener) => listeners.delete(listener),
    emit: (...args) => {
      for (const listener of listeners) listener(...args);
    },
    size: () => listeners.size,
  };
}

test("Gmail opt-in flows through the unchanged popup, analysis pipeline and Message Verdict cards", async () => {
  const dom = fixture();
  const popup = new JSDOM(
    readFileSync(new URL("../public/popup.html", import.meta.url), "utf8"),
  );
  const debug = new JSDOM("<main></main>");
  const previous = new Map(
    ["chrome", "document", "window"].map((key) => [
      key,
      Object.getOwnPropertyDescriptor(globalThis, key),
    ]),
  );
  const values = { [MONITORING_KEY]: true };
  const writes = [];
  const received = [];
  const opened = [];
  let port;
  const api = {
    runtime: {
      id: "fixture",
      getURL: (path) => `chrome-extension://fixture/${path}`,
      onConnect: event(),
      onMessage: event(),
    },
    storage: {
      local: {
        get: async (key) => ({ [key]: values[key] }),
        set: async (items) => {
          writes.push(items);
          Object.assign(values, items);
          api.storage.onChanged.emit(
            Object.fromEntries(
              Object.entries(items).map(([key, newValue]) => [
                key,
                { newValue },
              ]),
            ),
            "local",
          );
        },
      },
      onChanged: event(),
    },
    tabs: {
      query: async () => [{ id: 51 }],
      create: async ({ url }) => {
        opened.push(url);
        return { id: 99 };
      },
      connect: (_id, { name }) => {
        port = {
          name,
          sender: {
            id: "fixture",
            url: "chrome-extension://fixture/popup.html",
          },
          onMessage: event(),
          onDisconnect: event(),
          postMessage: (snapshot) => {
            received.push(snapshot);
            globalThis.queueMicrotask(() => port.onMessage.emit(snapshot));
          },
          disconnect: () => port.onDisconnect.emit(),
        };
        api.runtime.onConnect.emit(port);
        return port;
      },
    },
  };
  for (const [key, value] of Object.entries({
    chrome: api,
    document: popup.window.document,
    window: popup.window,
  }))
    Object.defineProperty(globalThis, key, { configurable: true, value });
  popup.window.close = () => {};
  const cleanup = startContentController(dom.window.document, {
    source: "gmail",
  });
  try {
    await import("../src/ui/popup.ts");
    const toggle = popup.window.document.querySelector("#monitoring");
    await waitFor(() => !toggle.disabled);
    assert.equal(toggle.checked, false); // Existing WhatsApp opt-in does not enable Gmail.
    assert.equal(received.at(-1).source, "gmail");
    assert.deepEqual(received.at(-1).messages, []);
    toggle.checked = true;
    toggle.dispatchEvent(new popup.window.Event("change"));
    await waitFor(() => received.at(-1).assessments.length === 1);
    const assessed = received.at(-1);
    assert.ok(isSnapshot(assessed));
    assert.equal(assessed.assessments[0].messageId, assessed.messages[0].id);
    assert.equal(assessed.assessments[0].riskLevel, "high");
    const latestRisk = popup.window.document.querySelector("#latest-risk");
    assert.equal(latestRisk.hidden, false);
    assert.equal(
      latestRisk.querySelector("p").textContent,
      `High risk — ${assessed.assessments[0].riskScore}%`,
    );
    assert.deepEqual(writes, [{ [GMAIL_MONITORING_KEY]: true }]);
    popup.window.document.querySelector("#open-debug").click();
    await waitFor(() => opened.length === 1);
    assert.equal(opened[0], "chrome-extension://fixture/debug.html#tab=51");
    Object.defineProperty(globalThis, "document", {
      configurable: true,
      value: debug.window.document,
    });
    renderMessages(debug.window.document.querySelector("main"), assessed);
    assert.match(
      debug.window.document.body.textContent,
      /From: Fictional Sender <fictional@example.test>/,
    );
    assert.match(
      debug.window.document.body.textContent,
      /Subject: Account notice/,
    );
    assert.match(
      debug.window.document.body.textContent,
      /Why VerdictAI Flagged This/,
    );
    assert.match(debug.window.document.body.textContent, /Fraud Risk Score/);
    const invalid = globalThis.structuredClone(assessed);
    invalid.messages[0].email.sender = 123;
    assert.equal(isSnapshot(invalid), false);
    dom.window.document.querySelector(".a3s").textContent =
      "Never share your OTP.";
    await waitFor(() => received.at(-1).assessments[0]?.riskScore === 0);
    toggle.checked = false;
    toggle.dispatchEvent(new popup.window.Event("change"));
    await waitFor(() => !received.at(-1).enabled);
    assert.deepEqual(received.at(-1).messages, []);
    assert.deepEqual(received.at(-1).assessments, []);
    assert.equal(latestRisk.hidden, true);
    assert.equal(latestRisk.querySelector("p").textContent, "");
    assert.equal(values[MONITORING_KEY], true);
    cleanup();
    assert.equal(api.runtime.onConnect.size(), 0);
    assert.equal(api.storage.onChanged.size(), 0);
  } finally {
    cleanup();
    for (const [key, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
    dom.window.close();
    debug.window.close();
  }
});
