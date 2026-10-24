import assert from "node:assert/strict";
import { test } from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { fixture, message, waitFor } from "./helpers.mjs";
import { ConversationMonitor } from "../src/content/monitor.ts";
import { AssessmentPipeline } from "../src/content/assessment-pipeline.ts";
import { InlineNotes } from "../src/content/inline-notes.ts";

const high = "Your bank security team needs your OTP immediately.";
const medium = "Send your OTP.";
const hosts = (document) => [
  ...document.querySelectorAll("[data-verdictai-note]"),
];

function setup(options = {}) {
  const dom = fixture();
  const document = dom.window.document;
  const selected = [];
  const diagnostics = [];
  const pipeline = new AssessmentPipeline();
  let emissions = 0;
  let reconciles = 0;
  const notes = new InlineNotes({
    onMoreInfo: async (id) => {
      selected.push(id);
    },
    activationAllowed: () => true,
    onDiagnostic: (code) => diagnostics.push(code),
    ...options,
  });
  const monitor = new ConversationMonitor({
    document,
    debounceMs: 5,
    onInvalidate: () => notes.pruneStale((id) => monitor.resolveMessage(id)),
    onChange: (snapshot) => {
      emissions++;
      notes.reconcile(pipeline.reconcile(snapshot), (id) =>
        monitor.resolveMessage(id),
      );
    },
    onReconcile: (snapshot) => {
      reconciles++;
      notes.reconcile(pipeline.reconcile(snapshot), (id) =>
        monitor.resolveMessage(id),
      );
    },
  });
  return {
    dom,
    document,
    selected,
    diagnostics,
    notes,
    monitor,
    counts: () => ({ emissions, reconciles }),
    container: document.querySelector(
      '[data-testid="conversation-panel-messages"]',
    ),
    close: () => {
      monitor.dispose();
      notes.clear();
      dom.window.close();
    },
  };
}

test("high and medium incoming messages get compact notes under their exact bubbles", () => {
  const app = setup();
  try {
    app.container.replaceChildren(
      message(app.document, { id: "high", text: high }),
      message(app.document, { id: "medium", text: medium }),
    );
    const original = [
      ...app.container.querySelectorAll(".selectable-text"),
    ].map((node) => node.textContent);
    app.monitor.setEnabled(true);
    assert.equal(hosts(app.document).length, 2);
    for (const [index, host] of hosts(app.document).entries()) {
      assert.equal(
        host.previousElementSibling.getAttribute("data-id"),
        index ? "medium" : "high",
      );
      assert.ok(
        host.shadowRoot.textContent.includes(
          index ? "Medium risk" : "High risk",
        ),
      );
      assert.ok(
        host.shadowRoot.textContent.includes(
          "Preliminary rule-based assessment",
        ),
      );
      assert.equal(
        host.shadowRoot.querySelector("button").textContent,
        "More Info →",
      );
      assert.equal(host.shadowRoot.querySelector("a"), null);
    }
    assert.deepEqual(
      [...app.container.querySelectorAll(".selectable-text")].map(
        (node) => node.textContent,
      ),
      original,
    );
  } finally {
    app.close();
  }
});

test("low, insufficient, outgoing and unknown-direction messages receive no notes", () => {
  const app = setup();
  try {
    app.container.replaceChildren(
      message(app.document, { id: "low", text: "Never share your OTP." }),
      message(app.document, { id: "short", text: "Hello" }),
      message(app.document, { id: "out", text: high, direction: "outgoing" }),
      message(app.document, {
        id: "unknown",
        text: high,
        direction: "unknown",
      }),
    );
    app.monitor.setEnabled(true);
    assert.equal(hosts(app.document).length, 0);
    assert.deepEqual(app.diagnostics, ["unknown-message-direction"]);
  } finally {
    app.close();
  }
});

test("refreshing and unrelated observer activity never duplicates a note or creates feedback loops", async () => {
  const app = setup();
  try {
    app.container.querySelector(".selectable-text").textContent = high;
    app.monitor.setEnabled(true);
    const original = hosts(app.document)[0];
    app.monitor.refresh();
    app.monitor.refresh();
    const settled = app.counts();
    await delay(40);
    assert.equal(hosts(app.document).length, 1);
    assert.equal(hosts(app.document)[0], original);
    assert.deepEqual(app.counts(), settled);
    assert.equal(app.monitor.getSnapshot().messages[0].text, high);
    assert.ok(
      !app.monitor.getSnapshot().messages[0].text.includes("VerdictAI"),
    );
  } finally {
    app.close();
  }
});

test("identical native-ID DOM replacement rebinds the note even when snapshot text is unchanged", async () => {
  const app = setup();
  try {
    app.container.querySelector(".selectable-text").textContent = high;
    app.monitor.setEnabled(true);
    const original = app.container.querySelector(".message-in");
    const replacement = original.cloneNode(true);
    original.replaceWith(replacement);
    await waitFor(
      () =>
        app.counts().reconciles >= 1 &&
        hosts(app.document).length === 1 &&
        hosts(app.document)[0].previousElementSibling === replacement,
    );
    assert.equal(original.isConnected, false);
    assert.ok(app.counts().reconciles >= 1);
  } finally {
    app.close();
  }
});

test("edited and removed messages reconcile notes without modifying original text", async () => {
  const app = setup();
  try {
    const part = app.container.querySelector(".selectable-text");
    part.textContent = high;
    app.monitor.setEnabled(true);
    part.textContent = "Never share your OTP.";
    await waitFor(() => hosts(app.document).length === 0);
    part.textContent = medium;
    await waitFor(() => hosts(app.document).length === 1);
    app.container.querySelector(".message-in").remove();
    await waitFor(() => hosts(app.document).length === 0);
  } finally {
    app.close();
  }
});

test("conversation switching removes old notes and associates new notes with the new conversation", async () => {
  const app = setup();
  try {
    app.container.querySelector(".selectable-text").textContent = high;
    app.monitor.setEnabled(true);
    const oldHost = hosts(app.document)[0];
    const root = app.document.querySelector("#main");
    root.setAttribute("data-chat-id", "fictional-b");
    root.querySelector("header span").setAttribute("title", "Fictional B");
    app.container.replaceChildren(
      message(app.document, { id: "b", text: medium }),
    );
    await waitFor(
      () =>
        hosts(app.document).length === 1 &&
        hosts(app.document)[0].previousElementSibling?.getAttribute(
          "data-id",
        ) === "b",
    );
    assert.equal(oldHost.isConnected, false);
  } finally {
    app.close();
  }
});

test("disabled monitoring removes every note and stops reinjection", async () => {
  const app = setup();
  try {
    app.container.querySelector(".selectable-text").textContent = high;
    app.monitor.setEnabled(true);
    app.monitor.setEnabled(false);
    assert.equal(hosts(app.document).length, 0);
    app.container.append(message(app.document, { id: "new", text: medium }));
    await delay(30);
    assert.equal(hosts(app.document).length, 0);
    assert.deepEqual(app.monitor.getSnapshot().messages, []);
  } finally {
    app.close();
  }
});

test("More Info passes only the verified selected ID; stale nodes are rejected before opening", async () => {
  const app = setup();
  try {
    const part = app.container.querySelector(".selectable-text");
    part.textContent = high;
    app.monitor.setEnabled(true);
    const id = app.monitor.getSnapshot().messages[0].id;
    hosts(app.document)[0].shadowRoot.querySelector("button").click();
    await delay(0);
    assert.deepEqual(app.selected, [id]);
    part.textContent = "This text changed before the observer runs.";
    hosts(app.document)[0].shadowRoot.querySelector("button").click();
    await delay(0);
    assert.deepEqual(app.selected, [id]);
    assert.ok(app.diagnostics.includes("stale-selection"));
  } finally {
    app.close();
  }
});

test("production activation guard rejects script-generated clicks", async () => {
  const app = setup({ activationAllowed: undefined });
  try {
    app.container.querySelector(".selectable-text").textContent = high;
    app.monitor.setEnabled(true);
    hosts(app.document)[0].shadowRoot.querySelector("button").click();
    await delay(0);
    assert.deepEqual(app.selected, []);
  } finally {
    app.close();
  }
});

test("ambiguous duplicate native identifiers never get an arbitrary warning placement", () => {
  const app = setup();
  try {
    const first = message(app.document, { id: "duplicate", text: high });
    app.container.replaceChildren(first, first.cloneNode(true));
    app.monitor.setEnabled(true);
    assert.equal(hosts(app.document).length, 0);
    assert.ok(app.diagnostics.includes("unreliable-message-binding"));
  } finally {
    app.close();
  }
});

test("reused message DOM IDs are checked again before selection", () => {
  const app = setup();
  try {
    app.container.querySelector(".selectable-text").textContent = high;
    app.monitor.setEnabled(true);
    const id = app.monitor.getSnapshot().messages[0].id;
    app.container
      .querySelector(".message-in")
      .setAttribute("data-id", "different-message");
    assert.equal(app.monitor.resolveMessage(id), null);
  } finally {
    app.close();
  }
});

test("horizontal layouts use a message-owned slot or a unique enclosing row", () => {
  const app = setup();
  try {
    app.container.style.display = "flex";
    app.container.style.flexDirection = "row";
    app.container.querySelector(".selectable-text").textContent = high;
    app.monitor.setEnabled(true);
    assert.equal(hosts(app.document).length, 1);
    assert.equal(
      hosts(app.document)[0].parentElement,
      app.container.querySelector(".message-in"),
    );
    app.monitor.setEnabled(false);
    app.container.style.display = "block";
    const row = app.document.createElement("div");
    row.setAttribute("role", "row");
    const horizontal = app.document.createElement("div");
    horizontal.style.display = "flex";
    horizontal.style.flexDirection = "row";
    horizontal.append(message(app.document, { id: "in-row", text: high }));
    row.append(horizontal);
    app.container.replaceChildren(row);
    app.monitor.setEnabled(true);
    assert.equal(hosts(app.document).length, 1);
    assert.equal(hosts(app.document)[0].previousElementSibling, row);
  } finally {
    app.close();
  }
});

test("message layouts without a vertical content slot are still skipped rather than guessed", () => {
  const app = setup();
  try {
    app.container.replaceChildren(
      message(app.document, { id: "no-slot", text: high }),
    );
    app.container.style.display = "flex";
    app.container.style.flexDirection = "row";
    app.container.querySelector(".message-in").style.display = "flex";
    app.container.querySelector(".message-in").style.flexDirection = "row";
    app.monitor.setEnabled(true);
    assert.equal(hosts(app.document).length, 0);
    assert.ok(app.diagnostics.includes("unsupported-message-layout"));
  } finally {
    app.close();
  }
});

test("cloned in-message note hosts are replaced without duplicates or observer loops", async () => {
  const app = setup();
  try {
    app.container.style.display = "flex";
    app.container.style.flexDirection = "row";
    const bubble = message(app.document, { id: "cloned-message", text: high });
    app.container.replaceChildren(bubble);
    app.monitor.setEnabled(true);
    const clone = bubble.cloneNode(true);
    bubble.replaceWith(clone);
    await waitFor(
      () =>
        hosts(app.document).length === 1 && !!hosts(app.document)[0].shadowRoot,
    );
    assert.equal(hosts(app.document)[0].parentElement, clone);
    assert.equal(app.monitor.refresh().messages[0].text, high);
    const count = app.counts();
    await delay(25);
    assert.deepEqual(app.counts(), count);
    app.monitor.setEnabled(false);
    assert.equal(hosts(app.document).length, 0);
  } finally {
    app.close();
  }
});

test("stale orphan notes are removed in the mutation microtask before the debounced rescan", async () => {
  const app = setup();
  try {
    app.container.querySelector(".selectable-text").textContent = high;
    app.monitor.setEnabled(true);
    assert.equal(hosts(app.document).length, 1);
    app.container.querySelector(".message-in").remove();
    await Promise.resolve();
    assert.equal(hosts(app.document).length, 0);
  } finally {
    app.close();
  }
});

test("flex message wrappers still expose More Info beneath the verified message content", async () => {
  const app = setup();
  try {
    const wrapper = app.document.createElement("div");
    wrapper.style.display = "flex";
    wrapper.style.flexDirection = "row";
    const bubble = message(app.document, { id: "flex-incoming", text: high });
    wrapper.append(bubble);
    app.container.replaceChildren(wrapper);
    app.monitor.setEnabled(true);
    assert.equal(app.monitor.getSnapshot().messages.length, 1);
    assert.equal(hosts(app.document).length, 1);
    const note = hosts(app.document)[0];
    assert.equal(note.parentElement, bubble);
    assert.equal(bubble.lastElementChild, note);
    assert.equal(wrapper.style.flexDirection, "row");
    note.shadowRoot.querySelector("button").click();
    await delay(0);
    assert.deepEqual(app.selected, [app.monitor.getSnapshot().messages[0].id]);
    assert.equal(app.monitor.refresh().messages[0].text, high);
  } finally {
    app.close();
  }
});

test("horizontal bubbles use their vertical body wrapper and preserve native controls", () => {
  const app = setup();
  try {
    app.container.style.display = "flex";
    app.container.style.flexDirection = "row";
    const bubble = message(app.document, { id: "body-wrapped", text: high });
    bubble.style.display = "flex";
    bubble.style.flexDirection = "row";
    const body = app.document.createElement("div");
    body.className = "copyable-text";
    const text = bubble.firstElementChild;
    body.append(text);
    const control = app.document.createElement("button");
    control.textContent = "Message menu";
    bubble.append(body, control);
    app.container.replaceChildren(bubble);
    app.monitor.setEnabled(true);
    assert.equal(hosts(app.document).length, 1);
    assert.equal(hosts(app.document)[0].parentElement, body);
    assert.equal(text.parentElement, body);
    assert.equal(control.parentElement, bubble);
    assert.equal(app.monitor.refresh().messages[0].text, high);
  } finally {
    app.close();
  }
});

test("positioned message wrappers contain their own note rather than suppressing More Info", () => {
  const app = setup();
  try {
    const bubble = message(app.document, {
      id: "positioned-incoming",
      text: medium,
    });
    bubble.style.position = "absolute";
    app.container.replaceChildren(bubble);
    app.monitor.setEnabled(true);
    assert.equal(hosts(app.document).length, 1);
    assert.equal(hosts(app.document)[0].parentElement, bubble);
    assert.equal(bubble.style.position, "absolute");
    assert.ok(hosts(app.document)[0].shadowRoot.querySelector("button"));
  } finally {
    app.close();
  }
});
