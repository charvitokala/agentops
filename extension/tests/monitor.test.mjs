import assert from "node:assert/strict";
import { test } from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { ConversationMonitor } from "../src/content/monitor.ts";
import { fixture, message, waitFor } from "./helpers.mjs";

test("monitoring defaults to disabled and extracts nothing until explicitly enabled", () => {
  const dom = fixture();
  const monitor = new ConversationMonitor({
    document: dom.window.document,
    onChange: () => {},
  });
  try {
    assert.equal(monitor.getSnapshot().enabled, false);
    assert.deepEqual(monitor.getSnapshot().messages, []);
    monitor.setEnabled(true);
    assert.equal(monitor.getSnapshot().messages.length, 1);
    monitor.setEnabled(false);
    assert.deepEqual(monitor.getSnapshot(), {
      enabled: false,
      status: "disabled",
      conversation: null,
      messages: [],
      updatedAt: null,
    });
  } finally {
    monitor.dispose();
    dom.window.close();
  }
});

test("observes new messages and text edits without accumulating duplicate entries", async () => {
  const dom = fixture();
  const document = dom.window.document;
  const monitor = new ConversationMonitor({
    document,
    debounceMs: 5,
    onChange: () => {},
  });
  try {
    monitor.setEnabled(true);
    const container = document.querySelector(
      '[data-testid="conversation-panel-messages"]',
    );
    const added = message(document, {
      id: "new-1",
      text: "New fictional message",
    });
    container.append(added);
    await waitFor(() => monitor.getSnapshot().messages.length === 2);
    added.querySelector(".selectable-text").firstChild.textContent =
      "Edited fictional message";
    await waitFor(
      () =>
        monitor.getSnapshot().messages[1]?.text === "Edited fictional message",
    );
    container.append(added.cloneNode(true));
    await delay(30);
    assert.equal(monitor.getSnapshot().messages.length, 2);
    added.remove();
    container.lastElementChild.remove();
    await waitFor(() => monitor.getSnapshot().messages.length === 1);
  } finally {
    monitor.dispose();
    dom.window.close();
  }
});

test("conversation switching replaces the old conversation and message snapshot", async () => {
  const dom = fixture();
  const document = dom.window.document;
  const monitor = new ConversationMonitor({
    document,
    debounceMs: 5,
    onChange: () => {},
  });
  try {
    monitor.setEnabled(true);
    const previousId = monitor.getSnapshot().conversation.id;
    const root = document.querySelector("#main");
    root.setAttribute("data-chat-id", "fictional-chat-b");
    root
      .querySelector("header span")
      .setAttribute("title", "Fictional Example B");
    root.querySelector("header span").textContent = "Fictional Example B";
    root
      .querySelector('[data-testid="conversation-panel-messages"]')
      .replaceChildren(
        message(document, { id: "chat-b-1", text: "Only conversation B" }),
      );
    await waitFor(
      () => monitor.getSnapshot().conversation?.label === "Fictional Example B",
    );
    assert.notEqual(monitor.getSnapshot().conversation.id, previousId);
    assert.deepEqual(
      monitor.getSnapshot().messages.map((item) => item.text),
      ["Only conversation B"],
    );
  } finally {
    monitor.dispose();
    dom.window.close();
  }
});

test("handles missing roots, root replacement and conversation closure", async () => {
  const dom = fixture();
  const document = dom.window.document;
  const root = document.querySelector("#main");
  root.remove();
  const snapshots = [];
  const monitor = new ConversationMonitor({
    document,
    debounceMs: 5,
    onChange: (item) => snapshots.push(item),
  });
  try {
    monitor.setEnabled(true);
    assert.equal(snapshots.at(-1).enabled, true);
    assert.equal(monitor.getSnapshot().status, "waiting_for_conversation");
    document.body.append(root);
    await waitFor(() => monitor.getSnapshot().messages.length === 1);
    const replacement = root.cloneNode(true);
    root.replaceWith(replacement);
    await delay(30);
    replacement.querySelector(".selectable-text").textContent =
      "Replacement root is being observed";
    await waitFor(
      () =>
        monitor.getSnapshot().messages[0]?.text ===
        "Replacement root is being observed",
    );
    replacement.remove();
    await waitFor(
      () => monitor.getSnapshot().status === "waiting_for_conversation",
    );
    assert.deepEqual(monitor.getSnapshot().messages, []);
  } finally {
    monitor.dispose();
    dom.window.close();
  }
});

test("ignores composer and conversation-list mutations", async () => {
  const dom = fixture();
  let emissions = 0;
  const document = dom.window.document;
  const monitor = new ConversationMonitor({
    document,
    debounceMs: 5,
    onChange: () => emissions++,
  });
  try {
    monitor.setEnabled(true);
    const initial = emissions;
    document.querySelector(
      '[contenteditable="true"] .selectable-text',
    ).textContent = "A newly typed private draft";
    document
      .querySelector("#pane-side")
      .append(
        message(document, { id: "other-chat", text: "An unrelated chat" }),
      );
    await delay(30);
    assert.equal(emissions, initial);
    assert.equal(monitor.getSnapshot().messages.length, 1);
  } finally {
    monitor.dispose();
    dom.window.close();
  }
});

test("recognizes an existing conversation hidden and revealed through CSS", async () => {
  const dom = fixture();
  const document = dom.window.document;
  const root = document.querySelector("#main");
  root.style.display = "none";
  const monitor = new ConversationMonitor({
    document,
    debounceMs: 5,
    onChange: () => {},
  });
  try {
    monitor.setEnabled(true);
    assert.equal(monitor.getSnapshot().status, "waiting_for_conversation");
    root.style.display = "block";
    await waitFor(() => monitor.getSnapshot().messages.length === 1);
    root.style.display = "none";
    await waitFor(() => monitor.getSnapshot().messages.length === 0);
  } finally {
    monitor.dispose();
    dom.window.close();
  }
});

test("disabling cancels pending work, clears data, disconnects observers, and can re-enable cleanly", async () => {
  const dom = fixture();
  let activeObservers = 0;
  let emissions = 0;
  const document = dom.window.document;
  const monitor = new ConversationMonitor({
    document,
    debounceMs: 20,
    onChange: () => emissions++,
    createObserver: (callback) => {
      const native = new dom.window.MutationObserver(callback);
      let active = false;
      return {
        observe: (...args) => {
          if (!active) {
            active = true;
            activeObservers++;
          }
          native.observe(...args);
        },
        disconnect: () => {
          if (active) {
            active = false;
            activeObservers--;
          }
          native.disconnect();
        },
        takeRecords: () => native.takeRecords(),
      };
    },
  });
  try {
    monitor.setEnabled(true);
    assert.equal(activeObservers, 2);
    document
      .querySelector('[data-testid="conversation-panel-messages"]')
      .append(message(document, { id: "pending" }));
    await delay(1);
    monitor.setEnabled(false);
    const disabledEmissions = emissions;
    assert.equal(activeObservers, 0);
    await delay(45);
    assert.equal(emissions, disabledEmissions);
    assert.deepEqual(monitor.getSnapshot().messages, []);
    monitor.setEnabled(true);
    assert.equal(activeObservers, 2);
    assert.equal(monitor.getSnapshot().messages.length, 2);
    monitor.dispose();
    assert.equal(activeObservers, 0);
  } finally {
    monitor.dispose();
    dom.window.close();
  }
});
