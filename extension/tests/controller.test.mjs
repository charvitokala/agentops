import assert from "node:assert/strict";
import { test } from "node:test";
import { startContentController } from "../src/content/controller.ts";
import {
  isSnapshot,
  MONITORING_KEY,
  PORT_NAME,
} from "../src/shared/contracts.ts";
import { setMonitoringPreference } from "../src/ui/client.ts";
import { renderMessages } from "../src/ui/view.ts";
import { fixture, message, waitFor } from "./helpers.mjs";
import { AssessmentPipeline } from "../src/content/assessment-pipeline.ts";

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

function fakeChrome(getSettings = async () => ({})) {
  const writes = [];
  const api = {
    runtime: {
      id: "fictional-extension",
      getURL: (path) => `chrome-extension://fictional-extension/${path}`,
      onConnect: event(),
    },
    storage: {
      local: {
        get: getSettings,
        set: async (value) => {
          writes.push(value);
        },
      },
      onChanged: event(),
    },
  };
  const previous = Object.getOwnPropertyDescriptor(globalThis, "chrome");
  Object.defineProperty(globalThis, "chrome", {
    configurable: true,
    value: api,
  });
  return {
    api,
    writes,
    restore: () => {
      if (previous) Object.defineProperty(globalThis, "chrome", previous);
      else Reflect.deleteProperty(globalThis, "chrome");
    },
  };
}

function connect(
  api,
  sender = {
    id: "fictional-extension",
    url: "chrome-extension://fictional-extension/popup.html",
  },
) {
  const received = [];
  const port = {
    name: PORT_NAME,
    sender,
    postMessage: (value) => received.push(value),
    onDisconnect: event(),
    disconnect() {
      this.onDisconnect.emit();
    },
  };
  api.runtime.onConnect.emit(port);
  return { port, received };
}

test("Chrome controller defaults off, accepts only extension-page ports, and cleans up listeners", async () => {
  const dom = fixture();
  const fake = fakeChrome();
  const cleanup = startContentController(dom.window.document);
  try {
    const authorized = connect(fake.api);
    assert.equal(authorized.received.at(-1).enabled, false);
    assert.equal(authorized.received.at(-1).messages.length, 0);
    assert.equal(
      connect(fake.api, {
        id: "another-extension",
        url: "https://web.whatsapp.com/",
      }).received.length,
      0,
    );
    fake.api.storage.onChanged.emit(
      { [MONITORING_KEY]: { newValue: true } },
      "local",
    );
    await waitFor(() => authorized.received.at(-1).messages.length === 1);
    assert.equal(
      authorized.received.at(-1).assessments[0].messageId,
      authorized.received.at(-1).messages[0].id,
    );
    fake.api.storage.onChanged.emit(
      { [MONITORING_KEY]: { newValue: false } },
      "local",
    );
    assert.equal(authorized.received.at(-1).enabled, false);
    assert.equal(authorized.received.at(-1).messages.length, 0);
    assert.equal(authorized.received.at(-1).conversation, null);
    assert.deepEqual(authorized.received.at(-1).assessments, []);
    assert.deepEqual(fake.writes, []);
    cleanup();
    assert.equal(fake.api.runtime.onConnect.size(), 0);
    assert.equal(fake.api.storage.onChanged.size(), 0);
  } finally {
    cleanup();
    fake.restore();
    dom.window.close();
  }
});

test("a late initial preference read cannot overwrite a newer enable event", async () => {
  const dom = fixture();
  let resolveSettings;
  const fake = fakeChrome(
    () =>
      new Promise((resolve) => {
        resolveSettings = resolve;
      }),
  );
  const cleanup = startContentController(dom.window.document);
  try {
    const client = connect(fake.api);
    fake.api.storage.onChanged.emit(
      { [MONITORING_KEY]: { newValue: true } },
      "local",
    );
    resolveSettings({ [MONITORING_KEY]: false });
    await Promise.resolve();
    assert.equal(client.received.at(-1).enabled, true);
    assert.equal(client.received.at(-1).messages.length, 1);
  } finally {
    cleanup();
    fake.restore();
    dom.window.close();
  }
});

test("stored enable preference starts the reader and disconnected debug clients receive no further messages", async () => {
  const dom = fixture();
  const fake = fakeChrome(async () => ({ [MONITORING_KEY]: true }));
  const cleanup = startContentController(dom.window.document);
  try {
    const client = connect(fake.api);
    await waitFor(() => client.received.at(-1).enabled);
    client.port.disconnect();
    const count = client.received.length;
    fake.api.storage.onChanged.emit(
      { [MONITORING_KEY]: { newValue: false } },
      "local",
    );
    assert.equal(client.received.length, count);
  } finally {
    cleanup();
    fake.restore();
    dom.window.close();
  }
});

test("UI persistence writes only the monitoring boolean", async () => {
  const fake = fakeChrome();
  try {
    await setMonitoringPreference(true);
    await setMonitoringPreference(false);
    assert.deepEqual(fake.writes, [
      { monitoringEnabled: true },
      { monitoringEnabled: false },
    ]);
  } finally {
    fake.restore();
  }
});

test("debug rendering treats hostile-looking message and URL text as non-clickable plain text", () => {
  const dom = fixture();
  const previous = Object.getOwnPropertyDescriptor(globalThis, "document");
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: dom.window.document,
  });
  try {
    const container = dom.window.document.createElement("section");
    const text = '<img src=x onerror="alert(1)">\nFictional message';
    renderMessages(container, {
      enabled: true,
      status: "ready",
      conversation: null,
      updatedAt: null,
      messages: [
        {
          id: "test",
          text,
          urls: ["https://fictional.example/<script>"],
          direction: "unknown",
          observedAt: "2026-10-24T12:00:00.000Z",
        },
      ],
    });
    assert.equal(container.querySelector(".message-text").textContent, text);
    assert.equal(container.querySelector("img, script, a"), null);
    assert.ok(container.textContent.includes("Direction unknown"));
    renderMessages(container, {
      enabled: false,
      status: "disabled",
      conversation: null,
      updatedAt: null,
      messages: [],
    });
    assert.equal(container.childElementCount, 0);
  } finally {
    if (previous) Object.defineProperty(globalThis, "document", previous);
    else Reflect.deleteProperty(globalThis, "document");
    dom.window.close();
  }
});

test("snapshot validator rejects malformed data at the messaging boundary", () => {
  assert.equal(isSnapshot(null), false);
  assert.equal(
    isSnapshot({
      enabled: true,
      status: "ready",
      conversation: null,
      messages: [{ text: "missing fields" }],
      updatedAt: null,
    }),
    false,
  );
  assert.equal(
    isSnapshot({
      enabled: false,
      status: "disabled",
      conversation: null,
      messages: [],
      updatedAt: null,
    }),
    true,
  );
});

test("controller broadcasts newly rendered messages locally without storing content", async () => {
  const dom = fixture();
  const fake = fakeChrome(async () => ({ [MONITORING_KEY]: true }));
  const cleanup = startContentController(dom.window.document);
  try {
    const client = connect(fake.api);
    await waitFor(() => client.received.at(-1).messages.length === 1);
    dom.window.document
      .querySelector('[data-testid="conversation-panel-messages"]')
      .append(
        message(dom.window.document, {
          id: "broadcast",
          text: "New local fictional message",
        }),
      );
    await waitFor(() => client.received.at(-1).messages.length === 2);
    assert.equal(
      client.received.at(-1).messages[1].text,
      "New local fictional message",
    );
    assert.deepEqual(
      client.received.at(-1).assessments.map((item) => item.messageId),
      client.received.at(-1).messages.map((item) => item.id),
    );
    assert.deepEqual(fake.writes, []);
  } finally {
    cleanup();
    fake.restore();
    dom.window.close();
  }
});

test("real reader/controller flow updates assessments and debug risk after edits, chat switches and disable", async () => {
  const dom = fixture();
  const document = dom.window.document;
  const previousDocument = Object.getOwnPropertyDescriptor(
    globalThis,
    "document",
  );
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: document,
  });
  document.querySelector("#main .selectable-text").textContent =
    "Your bank security team needs your OTP immediately.";
  const fake = fakeChrome(async () => ({ [MONITORING_KEY]: true }));
  const cleanup = startContentController(document);
  try {
    const client = connect(fake.api);
    await waitFor(() => client.received.at(-1).assessments.length === 1);
    const first = client.received.at(-1);
    assert.equal(first.assessments[0].riskLevel, "high");
    assert.equal(first.assessments[0].messageId, first.messages[0].id);
    assert.equal(isSnapshot(first), true);
    const container = document.createElement("section");
    renderMessages(container, first);
    assert.ok(
      container.textContent.includes("Preliminary rule-based assessment"),
    );
    assert.ok(container.querySelector(".risk-high"));
    assert.ok(container.textContent.includes("Codes and credentials"));
    assert.ok(container.textContent.includes("Do not share your OTP"));
    assert.ok(container.textContent.includes("not a fraud probability"));
    document.querySelector("#main .selectable-text").textContent =
      "Never share your OTP with anyone.";
    await waitFor(() => client.received.at(-1).assessments[0]?.riskScore === 0);
    const edited = client.received.at(-1);
    assert.equal(
      edited.assessments[0].messageId,
      first.assessments[0].messageId,
    );
    assert.equal(edited.assessments[0].riskLevel, "low");
    renderMessages(container, edited);
    assert.equal(container.querySelector(".risk-high"), null);
    assert.ok(container.querySelector(".risk-low"));
    const root = document.querySelector("#main");
    root.setAttribute("data-chat-id", "fictional-refund-chat");
    root
      .querySelector("header span")
      .setAttribute("title", "Fictional refund conversation");
    root
      .querySelector('[data-testid="conversation-panel-messages"]')
      .replaceChildren(
        message(document, {
          id: "refund",
          text: "Pay an advance fee first to receive your refund.",
        }),
      );
    await waitFor(
      () => client.received.at(-1).assessments[0]?.category === "upi",
    );
    const switched = client.received.at(-1);
    assert.equal(switched.assessments.length, 1);
    assert.equal(switched.assessments[0].messageId, switched.messages[0].id);
    assert.notEqual(
      switched.assessments[0].messageId,
      first.assessments[0].messageId,
    );
    fake.api.storage.onChanged.emit(
      { [MONITORING_KEY]: { newValue: false } },
      "local",
    );
    assert.deepEqual(client.received.at(-1).assessments, []);
    renderMessages(container, client.received.at(-1));
    assert.equal(container.childElementCount, 0);
    assert.deepEqual(fake.writes, []);
  } finally {
    cleanup();
    fake.restore();
    if (previousDocument)
      Object.defineProperty(globalThis, "document", previousDocument);
    else Reflect.deleteProperty(globalThis, "document");
    dom.window.close();
  }
});

test("debug view matches assessments by original message ID, not array position", () => {
  const dom = fixture();
  const previous = Object.getOwnPropertyDescriptor(globalThis, "document");
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: dom.window.document,
  });
  try {
    const messages = [
      {
        id: "neutral",
        text: "Hello",
        urls: [],
        direction: "incoming",
        observedAt: "2026-10-24T14:00:00.000Z",
      },
      {
        id: "credential",
        text: "Send your OTP.",
        urls: [],
        direction: "incoming",
        observedAt: "2026-10-24T14:00:00.000Z",
      },
    ];
    const snapshot = new AssessmentPipeline().reconcile({
      enabled: true,
      status: "ready",
      conversation: {
        id: "a",
        label: "Fictional",
        identitySource: "header_label",
      },
      messages,
      updatedAt: null,
    });
    snapshot.assessments.reverse();
    const container = dom.window.document.createElement("section");
    renderMessages(container, snapshot);
    assert.ok(
      container.children[0].querySelector(".risk-insufficient_evidence"),
    );
    assert.ok(container.children[1].querySelector(".risk-medium"));
    assert.equal(container.querySelector("a"), null);
  } finally {
    if (previous) Object.defineProperty(globalThis, "document", previous);
    else Reflect.deleteProperty(globalThis, "document");
    dom.window.close();
  }
});
