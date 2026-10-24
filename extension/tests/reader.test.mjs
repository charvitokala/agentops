import assert from "node:assert/strict";
import { test } from "node:test";
import {
  WhatsAppReader,
  extractUrls,
  locateConversationRoot,
} from "../src/content/whatsapp-reader.ts";
import { fixture, message } from "./helpers.mjs";

const firstObserved = "2026-10-24T12:00:00.000Z";

test("extracts one message without the composer, sidebar, title, or nested duplicates", () => {
  const dom = fixture();
  try {
    const result = new WhatsAppReader("test").read(
      locateConversationRoot(dom.window.document),
      firstObserved,
    );
    assert.equal(result.status, "ready");
    assert.equal(result.conversation.label, "Fictional Example A");
    assert.equal(result.messages.length, 1);
    assert.equal(
      result.messages[0].text,
      "Hello from a fictional conversation.",
    );
    assert.equal(result.messages[0].direction, "incoming");
    assert.equal(result.messages[0].observedAt, firstObserved);
  } finally {
    dom.window.close();
  }
});

test("extracts multiple messages with incoming, outgoing, and unknown direction", () => {
  const dom = fixture();
  try {
    const document = dom.window.document;
    const container = document.querySelector(
      '[data-testid="conversation-panel-messages"]',
    );
    container.append(
      message(document, {
        id: "out-1",
        text: "Fictional reply",
        direction: "outgoing",
      }),
      message(document, { id: "unknown-1", direction: "unknown" }),
    );
    const result = new WhatsAppReader().read(locateConversationRoot(document));
    assert.deepEqual(
      result.messages.map((item) => item.direction),
      ["incoming", "outgoing", "unknown"],
    );
  } finally {
    dom.window.close();
  }
});

test("preserves multiline text, Unicode emoji, and image emoji", () => {
  const dom = fixture();
  try {
    const part = dom.window.document.querySelector("#main .selectable-text");
    part.innerHTML =
      'First line 🙂<br>Second line<div>Third line<img alt="✅"></div><div>Fourth line</div>';
    const result = new WhatsAppReader().read(
      locateConversationRoot(dom.window.document),
    );
    assert.equal(
      result.messages[0].text,
      "First line 🙂\nSecond line\nThird line✅\nFourth line",
    );
  } finally {
    dom.window.close();
  }
});

test("extracts and deduplicates URLs, trims punctuation, and preserves balanced parentheses", () => {
  assert.deepEqual(
    extractUrls(
      "Read https://bank.example/a_(b)). Then www.bank.example, or bank.example/help. Contact test@unrelated.example",
      ["https://bank.example/help", "javascript:alert(1)"],
    ),
    [
      "https://bank.example/a_(b)",
      "https://www.bank.example/",
      "https://bank.example/help",
    ],
  );
});

test("reads visible anchor destinations as text without opening them", () => {
  const dom = fixture();
  try {
    dom.window.document.querySelector("#main .selectable-text").innerHTML =
      'Read <a href="https://fictional.example/notice">this notice</a>';
    const result = new WhatsAppReader().read(
      locateConversationRoot(dom.window.document),
    );
    assert.deepEqual(result.messages[0].urls, [
      "https://fictional.example/notice",
    ]);
    assert.equal(dom.window.location.href, "https://web.whatsapp.com/");
  } finally {
    dom.window.close();
  }
});

test("repeated scans and replacement DOM nodes preserve stable IDs and first-observed timestamps", () => {
  const dom = fixture();
  try {
    const reader = new WhatsAppReader("stable");
    const root = locateConversationRoot(dom.window.document);
    const initial = reader.read(root, firstObserved);
    root
      .querySelector(".message-in")
      .replaceWith(root.querySelector(".message-in").cloneNode(true));
    assert.deepEqual(reader.read(root, "2026-10-24T12:01:00.000Z"), initial);
    root
      .querySelector('[data-testid="conversation-panel-messages"]')
      .append(root.querySelector(".message-in").cloneNode(true));
    assert.equal(reader.read(root).messages.length, 1);
  } finally {
    dom.window.close();
  }
});

test("identical separate messages remain separate with native or scoped occurrence IDs", () => {
  const dom = fixture();
  try {
    const document = dom.window.document;
    const container = document.querySelector(
      '[data-testid="conversation-panel-messages"]',
    );
    container.replaceChildren(
      message(document, { text: "Same fictional text" }),
      message(document, { text: "Same fictional text" }),
    );
    const reader = new WhatsAppReader("fallback");
    const result = reader.read(locateConversationRoot(document));
    assert.equal(result.messages.length, 2);
    assert.notEqual(result.messages[0].id, result.messages[1].id);
    assert.ok(result.messages.every((item) => item.id.includes(":fallback:")));
    assert.deepEqual(
      reader
        .read(locateConversationRoot(document))
        .messages.map((item) => item.id),
      result.messages.map((item) => item.id),
    );
    container.children[0].setAttribute("data-id", "distinct-1");
    container.children[1].setAttribute("data-id", "distinct-2");
    assert.equal(
      reader.read(locateConversationRoot(document)).messages.length,
      2,
    );
  } finally {
    dom.window.close();
  }
});

test("ignores hidden, quoted, metadata, empty and media-only content", () => {
  const dom = fixture();
  try {
    const document = dom.window.document;
    const container = document.querySelector(
      '[data-testid="conversation-panel-messages"]',
    );
    const quoted = document.createElement("div");
    quoted.dataset.testid = "quoted-message";
    quoted.innerHTML =
      '<span class="selectable-text">Previous quoted private text</span>';
    container.querySelector(".message-in").prepend(quoted);
    const hidden = message(document, { id: "hidden", text: "Not displayed" });
    hidden.hidden = true;
    const cssHidden = message(document, {
      id: "css-hidden",
      text: "CSS hidden",
    });
    cssHidden.style.display = "none";
    const media = document.createElement("div");
    media.className = "message-out";
    media.innerHTML =
      '<img alt="Photo"><span data-testid="msg-meta">12:00</span>';
    container.append(
      hidden,
      cssHidden,
      media,
      message(document, { id: "empty", text: "   " }),
    );
    const result = new WhatsAppReader().read(locateConversationRoot(document));
    assert.equal(result.messages.length, 1);
    assert.equal(
      result.messages[0].text,
      "Hello from a fictional conversation.",
    );
  } finally {
    dom.window.close();
  }
});

test("reconciles virtualization instead of retaining removed chat history", () => {
  const dom = fixture();
  try {
    const document = dom.window.document;
    const reader = new WhatsAppReader();
    const root = locateConversationRoot(document);
    reader.read(root);
    root
      .querySelector('[data-testid="conversation-panel-messages"]')
      .replaceChildren(
        message(document, {
          id: "new-window",
          text: "Only the current rendered window",
        }),
      );
    const result = reader.read(root);
    assert.equal(result.messages.length, 1);
    assert.equal(result.messages[0].text, "Only the current rendered window");
  } finally {
    dom.window.close();
  }
});

test("missing or changed containers return explicit states with no unrelated text", () => {
  const dom = fixture();
  try {
    const reader = new WhatsAppReader();
    assert.equal(reader.read(null).status, "waiting_for_conversation");
    const root = locateConversationRoot(dom.window.document);
    root.querySelector('[data-testid="conversation-panel-messages"]').remove();
    assert.equal(reader.read(root).status, "unsupported_layout");
    assert.deepEqual(reader.read(root).messages, []);
    root.remove();
    assert.equal(locateConversationRoot(dom.window.document), null);
  } finally {
    dom.window.close();
  }
});
