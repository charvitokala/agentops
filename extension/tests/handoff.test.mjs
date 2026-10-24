import assert from "node:assert/strict";
import { test } from "node:test";
import { JSDOM } from "jsdom";
import {
  createHandoffBroker,
  PENDING_PREFIX,
} from "../src/background/broker.ts";
import {
  createExtensionCase,
  HANDOFF_CHANNEL,
  HANDOFF_TTL_MS,
  isExtensionCase,
} from "../src/shared/handoff.ts";
import { websiteOrigin } from "../src/shared/website-config.ts";
import { analyzeMessage } from "../src/detection/analyze-message.ts";
import { installWebsiteBridge } from "../src/bridge/website.ts";
import { receiveExtensionCase } from "../../src/lib/extension-receiver.ts";
import {
  extensionCaseToScamCase,
  loadExtensionCase,
} from "../../src/lib/extension-cases.ts";
import { waitFor } from "./helpers.mjs";
import { fixture, message } from "./helpers.mjs";
import { startContentController } from "../src/content/controller.ts";
import { renderMessages } from "../src/ui/view.ts";
import { openSelectedInvestigation } from "../src/ui/client.ts";
import { PORT_NAME } from "../src/shared/contracts.ts";

const origin = "http://localhost:3000";
const id = "ext-3917fa9e-b4a7-407d-ad62-648ca0585d86";
const selected = {
  id: "dom:false_919999999999@c.us_PRIVATE_DOM_ID",
  text: "Your bank security team needs your OTP immediately.\nDo not delay.",
  urls: [],
  direction: "incoming",
  observedAt: "2026-10-24T14:00:00.000Z",
};
const assessed = () => analyzeMessage(selected);
const sender = {
  id: "extension-id",
  url: "https://web.whatsapp.com/",
  frameId: 0,
  tab: { id: 4 },
};

function brokerFixture(overrides = {}) {
  const data = {};
  const opened = [];
  const alarms = [];
  let now = Date.now();
  const broker = createHandoffBroker({
    origin,
    extensionId: "extension-id",
    now: () => now,
    storage: {
      getAll: async () => ({ ...data }),
      set: async (items) => Object.assign(data, items),
      remove: async (keys) => {
        for (const key of keys) delete data[key];
      },
    },
    openTab: async (url) => {
      opened.push(url);
      return { id: 77 };
    },
    scheduleExpiry: async (when) => {
      alarms.push(when);
    },
    ...overrides,
  });
  return {
    broker,
    data,
    opened,
    alarms,
    advance: (ms) => {
      now += ms;
    },
  };
}
const openRequest = () => ({
  type: "VERDICTAI_OPEN_CASE",
  message: selected,
  assessment: assessed(),
});
const targetSender = (
  caseId,
  tabId = 77,
  url = `${origin}/investigation/${caseId}`,
) => ({ id: "extension-id", frameId: 0, tab: { id: tabId }, url });

test("More Info broker opens a new investigation tab with only an opaque case ID in its URL", async () => {
  const app = brokerFixture();
  const result = await app.broker.handle(openRequest(), sender);
  assert.equal(result.status, "opened");
  assert.match(
    app.opened[0],
    /^http:\/\/localhost:3000\/investigation\/ext-[a-f0-9-]{36}$/,
  );
  assert.ok(!app.opened[0].includes("OTP"));
  assert.ok(!app.opened[0].includes("919999"));
  assert.equal(new globalThis.URL(app.opened[0]).search, "");
  assert.equal(new globalThis.URL(app.opened[0]).hash, "");
  const entry = app.data[PENDING_PREFIX + result.caseId];
  assert.equal(entry.payload.message.text, selected.text);
  assert.equal(entry.payload.message.id, result.caseId);
  assert.equal(entry.payload.assessment.messageId, result.caseId);
  assert.ok(!JSON.stringify(entry.payload).includes("PRIVATE_DOM_ID"));
});

test("only the exact configured origin, route, top frame and destination tab can consume a case", async () => {
  const app = brokerFixture();
  const result = await app.broker.handle(openRequest(), sender);
  const request = { type: "VERDICTAI_CLAIM_CASE", caseId: result.caseId };
  for (const attempted of [
    targetSender(result.caseId, 88),
    targetSender(
      result.caseId,
      77,
      `https://unrelated.example/investigation/${result.caseId}`,
    ),
    targetSender(
      result.caseId,
      77,
      `http://localhost:3001/investigation/${result.caseId}`,
    ),
    targetSender(result.caseId, 77, `${origin}/demo`),
    { ...targetSender(result.caseId), frameId: 1 },
    { ...targetSender(result.caseId), id: "other-extension" },
  ])
    assert.notEqual(
      (await app.broker.handle(request, attempted)).status,
      "delivered",
    );
  assert.equal(
    (await app.broker.handle(request, targetSender(result.caseId))).status,
    "delivered",
  );
  assert.deepEqual(app.data, {});
  assert.equal(
    (await app.broker.handle(request, targetSender(result.caseId))).status,
    "unavailable",
  );
});

test("simultaneous claims are single-use and expired/closed-tab records are deleted", async () => {
  const app = brokerFixture();
  const result = await app.broker.handle(openRequest(), sender);
  const request = { type: "VERDICTAI_CLAIM_CASE", caseId: result.caseId };
  const responses = await Promise.all([
    app.broker.handle(request, targetSender(result.caseId)),
    app.broker.handle(request, targetSender(result.caseId)),
  ]);
  assert.equal(
    responses.filter((response) => response.status === "delivered").length,
    1,
  );
  const expired = await app.broker.handle(openRequest(), sender);
  app.advance(HANDOFF_TTL_MS + 1);
  assert.equal(
    (
      await app.broker.handle(
        { type: "VERDICTAI_CLAIM_CASE", caseId: expired.caseId },
        targetSender(expired.caseId),
      )
    ).status,
    "unavailable",
  );
  assert.deepEqual(app.data, {});
  await app.broker.handle(openRequest(), sender);
  await app.broker.cleanup(77);
  assert.deepEqual(app.data, {});
  assert.equal(app.alarms.at(-1), null);
});

test("invalid, altered, outgoing or unsupported cases are rejected before opening a tab", async () => {
  const app = brokerFixture();
  for (const request of [
    null,
    { type: "VERDICTAI_OPEN_CASE" },
    { ...openRequest(), message: { ...selected, direction: "outgoing" } },
    { ...openRequest(), assessment: { ...assessed(), riskScore: 100 } },
    { ...openRequest(), message: { ...selected, history: ["unrelated chat"] } },
  ])
    assert.equal((await app.broker.handle(request, sender)).status, "rejected");
  assert.equal(
    (
      await app.broker.handle(openRequest(), {
        ...sender,
        url: "https://another.example/",
      })
    ).status,
    "rejected",
  );
  assert.equal(app.opened.length, 0);
  assert.deepEqual(app.data, {});
});

test("case schema validates exact ID, destination, expiry, associations and canonical local findings", () => {
  const payload = createExtensionCase(
    selected,
    assessed(),
    origin,
    Date.now(),
    id,
  );
  assert.equal(isExtensionCase(payload, { caseId: id, origin }), true);
  for (const value of [
    { ...payload, caseId: "ext-wrong" },
    { ...payload, websiteOrigin: "https://another.example" },
    { ...payload, agents: [{ role: "judge", verdict: "fraud" }] },
    {
      ...payload,
      assessment: { ...payload.assessment, summary: "Verified fraud" },
    },
  ])
    assert.equal(isExtensionCase(value, { caseId: id, origin }), false);
  assert.equal(
    isExtensionCase(payload, {
      caseId: id,
      origin,
      now: Date.now() + HANDOFF_TTL_MS + 1,
    }),
    false,
  );
});

test("website origin configuration allows loopback HTTP and exact production HTTPS only", () => {
  assert.equal(websiteOrigin("http://localhost:3000"), origin);
  assert.equal(
    websiteOrigin("https://guardian.example/"),
    "https://guardian.example",
  );
  for (const value of [
    "http://untrusted.example",
    "https://user:password@guardian.example",
    "https://guardian.example/path",
    "https://guardian.example/?private=1",
    "https://web.whatsapp.com",
    "javascript:alert(1)",
    "https://*.example",
  ])
    assert.throws(() => websiteOrigin(value));
});

function loopback(window) {
  window.postMessage = (data, target) => {
    assert.equal(
      target,
      window.location.origin,
      "No wildcard postMessage target",
    );
    globalThis.queueMicrotask(() =>
      window.dispatchEvent(
        new window.MessageEvent("message", {
          data,
          origin: window.location.origin,
          source: window,
        }),
      ),
    );
  };
}

test("new-tab bridge hands off the exact selected case to website sessionStorage and preserves it on refresh", async () => {
  let site;
  let stopBridge;
  let stopReceiver;
  let delivered;
  const app = brokerFixture({
    openTab: async (url) => {
      site = new JSDOM("<main></main>", { url });
      loopback(site.window);
      const caseId = site.window.location.pathname.split("/").at(-1);
      stopBridge = installWebsiteBridge(site.window, origin, (caseId) =>
        app.broker.handle(
          { type: "VERDICTAI_CLAIM_CASE", caseId },
          targetSender(caseId),
        ),
      );
      stopReceiver = receiveExtensionCase(
        site.window,
        caseId,
        (payload) => {
          delivered = payload;
        },
        (error) => {
          throw new Error(error);
        },
      );
      return { id: 77 };
    },
  });
  try {
    const opened = await app.broker.handle(openRequest(), sender);
    await waitFor(() => !!delivered);
    assert.equal(delivered.caseId, opened.caseId);
    assert.equal(delivered.message.text, selected.text);
    assert.deepEqual(delivered.assessment.signals, assessed().signals);
    assert.equal(delivered.assessment.riskLevel, assessed().riskLevel);
    const stored = loadExtensionCase(
      site.window.sessionStorage,
      opened.caseId,
      origin,
    );
    assert.deepEqual(stored, delivered);
    assert.equal(
      loadExtensionCase(site.window.sessionStorage, id, origin),
      null,
    );
    const websiteCase = extensionCaseToScamCase(stored);
    assert.equal(websiteCase.message.text, selected.text);
    assert.equal(websiteCase.message.source, "extension");
    assert.equal(websiteCase.assessment.level, delivered.assessment.riskLevel);
    assert.equal(websiteCase.agents.length, 4);
    assert.ok(
      websiteCase.agents.every((agent) => agent.status === "not_available"),
    );
    assert.ok(
      websiteCase.evidence.every(
        (evidence) => evidence.status === "unverified",
      ),
    );
    assert.deepEqual(app.data, {});
  } finally {
    stopReceiver?.();
    stopBridge?.();
    site?.window.close();
  }
});

test("website receiver rejects wrong-origin, wrong-source, wrong-ID and invalid payload events", async () => {
  const site = new JSDOM("<main></main>", {
    url: `${origin}/investigation/${id}`,
  });
  const posted = [];
  site.window.postMessage = (data, target) => {
    assert.equal(target, origin);
    posted.push(data);
  };
  let received = null;
  let unavailable = "";
  const stop = receiveExtensionCase(
    site.window,
    id,
    (payload) => {
      received = payload;
    },
    (message) => {
      unavailable = message;
    },
    30,
  );
  try {
    const ready = posted[0];
    const payload = createExtensionCase(
      selected,
      assessed(),
      origin,
      Date.now(),
      id,
    );
    const data = {
      channel: HANDOFF_CHANNEL,
      type: "CASE_DELIVERY",
      caseId: id,
      nonce: ready.nonce,
      payload,
    };
    for (const event of [
      { data, origin: "https://another.example", source: site.window },
      { data, origin, source: null },
      { data: { ...data, caseId: "ext-other" }, origin, source: site.window },
      {
        data: { ...data, nonce: "unrelated-nonce" },
        origin,
        source: site.window,
      },
      {
        data: {
          ...data,
          payload: {
            ...payload,
            assessment: {
              ...payload.assessment,
              summary: "Final judge verdict",
            },
          },
        },
        origin,
        source: site.window,
      },
    ])
      site.window.dispatchEvent(new site.window.MessageEvent("message", event));
    assert.equal(received, null);
    assert.equal(site.window.sessionStorage.length, 0);
    await waitFor(() => !!unavailable);
    assert.match(unavailable, /unavailable or expired/);
  } finally {
    stop();
    site.window.close();
  }
});

test("bridge never claims a case on unrelated origins or another website route", () => {
  for (const url of [
    `https://another.example/investigation/${id}`,
    `${origin}/demo`,
  ]) {
    const site = new JSDOM("", { url });
    let claims = 0;
    const stop = installWebsiteBridge(site.window, origin, async () => {
      claims++;
      return {};
    });
    site.window.dispatchEvent(
      new site.window.MessageEvent("message", {
        data: {
          channel: HANDOFF_CHANNEL,
          type: "CASE_READY",
          caseId: id,
          nonce: globalThis.crypto.randomUUID(),
        },
        origin: site.window.location.origin,
        source: site.window,
      }),
    );
    assert.equal(claims, 0);
    stop();
    site.window.close();
  }
});

for (const entryPoint of ["inline", "debug"])
  test(`${entryPoint} More Info click flows through the controller, broker, new tab, bridge and website storage`, async () => {
    const source = fixture();
    const document = source.window.document;
    const wanted = "Pay an advance fee first to receive your refund.";
    const selectedBubble = message(document, {
      id: "selected-refund",
      text: wanted,
    });
    const wrapper = document.createElement("div");
    wrapper.style.display = "flex";
    wrapper.style.flexDirection = "row";
    wrapper.append(selectedBubble);
    if (entryPoint === "debug") {
      // No reliable vertical placement: debug navigation must still work.
      selectedBubble.style.display = "flex";
      selectedBubble.style.flexDirection = "row";
    }
    document
      .querySelector('[data-testid="conversation-panel-messages"]')
      .replaceChildren(
        message(document, {
          id: "other-message",
          text: "Your bank security team needs your OTP immediately.",
        }),
        wrapper,
      );
    let site;
    let stopBridge;
    let stopReceiver;
    let delivered;
    const app = brokerFixture({
      openTab: async (url) => {
        site = new JSDOM("<main></main>", { url });
        loopback(site.window);
        const caseId = site.window.location.pathname.split("/").at(-1);
        stopBridge = installWebsiteBridge(site.window, origin, (caseId) =>
          app.broker.handle(
            { type: "VERDICTAI_CLAIM_CASE", caseId },
            targetSender(caseId),
          ),
        );
        stopReceiver = receiveExtensionCase(
          site.window,
          caseId,
          (payload) => {
            delivered = payload;
          },
          (error) => {
            throw new Error(error);
          },
        );
        return { id: 77 };
      },
    });
    function event() {
      const listeners = new Set();
      return {
        addListener: (fn) => listeners.add(fn),
        removeListener: (fn) => listeners.delete(fn),
        emit: (...args) => {
          for (const fn of listeners) fn(...args);
        },
      };
    }
    const oldChrome = Object.getOwnPropertyDescriptor(globalThis, "chrome");
    const oldDocument = Object.getOwnPropertyDescriptor(globalThis, "document");
    Object.defineProperty(globalThis, "chrome", {
      configurable: true,
      value: {
        runtime: {
          id: "extension-id",
          onConnect: event(),
          onMessage: event(),
          getURL: (path) => `chrome-extension://extension-id/${path}`,
          sendMessage: (request) => app.broker.handle(request, sender),
        },
        tabs: {
          sendMessage: async (tabId, request) => {
            assert.equal(tabId, sender.tab.id);
            return new Promise((resolve) =>
              globalThis.chrome.runtime.onMessage.emit(
                request,
                {
                  id: "extension-id",
                  url: "chrome-extension://extension-id/debug.html",
                },
                resolve,
              ),
            );
          },
        },
        storage: {
          local: { get: async () => ({ monitoringEnabled: true }) },
          onChanged: event(),
        },
      },
    });
    const stopController = startContentController(document, {
      activationAllowed: () => true,
    });
    let snapshot;
    globalThis.chrome.runtime.onConnect.emit({
      name: PORT_NAME,
      sender: {
        id: "extension-id",
        url: "chrome-extension://extension-id/debug.html",
      },
      postMessage: (value) => {
        snapshot = value;
      },
      onDisconnect: event(),
      disconnect: () => {},
    });
    const debug = new JSDOM("<main></main>");
    try {
      await waitFor(() => snapshot?.enabled && snapshot.messages.length === 2);
      if (entryPoint === "inline") {
        const notes = document.querySelectorAll("[data-verdictai-note]");
        assert.equal(notes.length, 2);
        assert.equal(notes[1].parentElement, selectedBubble);
        notes[1].shadowRoot.querySelector("button").click();
      } else {
        assert.equal(
          selectedBubble.querySelector("[data-verdictai-note]"),
          null,
        );
        Object.defineProperty(globalThis, "document", {
          configurable: true,
          value: debug.window.document,
        });
        const list = debug.window.document.querySelector("main");
        renderMessages(list, snapshot, (messageId) =>
          openSelectedInvestigation(sender.tab.id, messageId),
        );
        list.querySelectorAll("button")[1].click();
      }
      await waitFor(() => !!delivered);
      assert.equal(delivered.message.text, wanted);
      assert.equal(delivered.assessment.riskLevel, "medium");
      assert.equal(delivered.assessment.category, "upi");
      assert.equal(extensionCaseToScamCase(delivered).message.text, wanted);
      assert.ok(!JSON.stringify(delivered).includes("security team"));
      assert.equal(
        site.window.location.pathname,
        `/investigation/${delivered.caseId}`,
      );
      assert.equal(site.window.location.search, "");
      assert.equal(site.window.location.hash, "");
      assert.deepEqual(app.data, {});
    } finally {
      stopController();
      stopReceiver?.();
      stopBridge?.();
      source.window.close();
      debug.window.close();
      site?.window.close();
      if (oldChrome) Object.defineProperty(globalThis, "chrome", oldChrome);
      else Reflect.deleteProperty(globalThis, "chrome");
      if (oldDocument)
        Object.defineProperty(globalThis, "document", oldDocument);
      else Reflect.deleteProperty(globalThis, "document");
    }
  });

test("website storage failure returns a clear error without accepting a case", () => {
  const site = new JSDOM("", { url: `${origin}/investigation/${id}` });
  const posted = [];
  site.window.postMessage = (data) => posted.push(data);
  Object.defineProperty(site.window, "sessionStorage", {
    configurable: true,
    get: () => {
      throw new Error("Storage blocked");
    },
  });
  let error = "";
  const stop = receiveExtensionCase(
    site.window,
    id,
    () => assert.fail("Must not accept without session storage"),
    (message) => {
      error = message;
    },
  );
  try {
    const payload = createExtensionCase(
      selected,
      assessed(),
      origin,
      Date.now(),
      id,
    );
    site.window.dispatchEvent(
      new site.window.MessageEvent("message", {
        data: {
          channel: HANDOFF_CHANNEL,
          type: "CASE_DELIVERY",
          caseId: id,
          nonce: posted[0].nonce,
          payload,
        },
        origin,
        source: site.window,
      }),
    );
    assert.match(error, /could not save/);
  } finally {
    stop();
    site.window.close();
  }
});

test("pending cases survive broker recreation and retention is bounded", async () => {
  const app = brokerFixture();
  const opened = await app.broker.handle(openRequest(), sender);
  const restored = createHandoffBroker({
    origin,
    extensionId: "extension-id",
    storage: {
      getAll: async () => ({ ...app.data }),
      set: async (items) => Object.assign(app.data, items),
      remove: async (keys) => {
        for (const key of keys) delete app.data[key];
      },
    },
    openTab: async () => ({ id: 77 }),
    scheduleExpiry: async () => {},
  });
  assert.equal(
    (
      await restored.handle(
        { type: "VERDICTAI_CLAIM_CASE", caseId: opened.caseId },
        targetSender(opened.caseId),
      )
    ).status,
    "delivered",
  );
  for (let count = 0; count < 8; count++)
    assert.equal(
      (await app.broker.handle(openRequest(), sender)).status,
      "opened",
    );
  assert.equal(
    (await app.broker.handle(openRequest(), sender)).status,
    "rejected",
  );
  assert.equal(Object.keys(app.data).length, 8);
});
