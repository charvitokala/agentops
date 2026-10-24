import assert from "node:assert/strict";
import { test } from "node:test";
import { analyzeMessage, MAX_MESSAGE_LENGTH } from "../src/lib/analysis.ts";
import {
  demoCases,
  demoMetrics,
  matchDemoMessage,
} from "../src/lib/demo-cases.ts";
import {
  loadLocalInvestigation,
  saveLocalInvestigation,
} from "../src/lib/local-investigations.ts";

const timestamp = "2026-10-24T09:00:00.000Z";
const id = "local-38e15f74-31b7-43ce-a81b-e430df1c5687";

test("the four required fictional cases have appropriate preliminary assessments", () => {
  assert.deepEqual(
    demoCases.map((item) => item.assessment.level),
    ["high", "high", "medium", "low"],
  );
  assert.deepEqual(demoMetrics, {
    messagesAnalyzed: 4,
    potentialThreats: 3,
    investigations: 4,
  });
  assert.ok(
    demoCases.every((item) => item.assessment.method === "local_rules"),
  );
  assert.ok(
    demoCases.every((item) =>
      item.agents.every((agent) => agent.status === "not_available"),
    ),
  );
  assert.ok(
    demoCases.every((item) =>
      item.evidence.every((source) => source.status === "unverified"),
    ),
  );
});

test("custom messages get their own signals and preserve their own text", () => {
  const text = "Please send your OTP to our bank security team immediately.";
  const result = analyzeMessage(text, id, timestamp);
  assert.equal(result.message.text, text);
  assert.equal(result.message.source, "manual");
  assert.equal(result.assessment.level, "high");
  assert.ok(result.signals.some((signal) => signal.kind === "otp_request"));
  assert.ok(!result.signals.some((signal) => signal.kind === "kyc"));
  assert.ok(!result.signals.some((signal) => signal.kind === "external_link"));
  assert.equal(matchDemoMessage(text), undefined);
});

test("a low-indicator custom message is never described as verified or safe", () => {
  const result = analyzeMessage(
    "Your statement is in your usual banking app.",
    id,
    timestamp,
  );
  assert.equal(result.assessment.level, "low");
  assert.equal(result.signals.length, 0);
  assert.match(result.assessment.summary, /does not establish.*safe/);
  assert.match(result.note.text, /not proof of safety/);
});

test("a warning against OTP disclosure does not become an OTP request", () => {
  const result = analyzeMessage(
    "Never share your OTP with anyone.",
    id,
    timestamp,
  );
  assert.equal(
    result.signals.some((signal) => signal.kind === "otp_request"),
    false,
  );
});

test("custom investment and link messages get relevant signals", () => {
  const investment = analyzeMessage(
    "Our investment group offers guaranteed returns. Limited spots available.",
    id,
    timestamp,
  );
  assert.equal(investment.assessment.level, "medium");
  assert.ok(investment.signals.some((signal) => signal.kind === "returns"));
  const linked = analyzeMessage(
    "Read the update at https://banking-info.example",
    id,
    timestamp,
  );
  assert.ok(linked.signals.some((signal) => signal.kind === "external_link"));
  assert.equal(linked.assessment.level, "medium");
});

test("empty and oversized input is rejected", () => {
  assert.throws(() => analyzeMessage("   ", id, timestamp));
  assert.throws(() =>
    analyzeMessage("x".repeat(MAX_MESSAGE_LENGTH + 1), id, timestamp),
  );
});

test("custom input round-trips locally and missing or malformed storage is handled", () => {
  const store = new Map<string, string>();
  const previous = Object.getOwnPropertyDescriptor(
    globalThis,
    "sessionStorage",
  );
  Object.defineProperty(globalThis, "sessionStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => store.set(key, value),
    },
  });
  try {
    assert.equal(loadLocalInvestigation(id), null);
    const original = analyzeMessage(
      "Please reply with the OTP immediately.",
      id,
      timestamp,
    );
    saveLocalInvestigation(original);
    assert.deepEqual(loadLocalInvestigation(id), original);
    const key = [...store.keys()][0];
    store.set(key, "not valid JSON");
    assert.equal(loadLocalInvestigation(id), null);
    store.set(
      key,
      JSON.stringify({ version: 1, id, text: 123, createdAt: timestamp }),
    );
    assert.equal(loadLocalInvestigation(id), null);
  } finally {
    if (previous) Object.defineProperty(globalThis, "sessionStorage", previous);
    else Reflect.deleteProperty(globalThis, "sessionStorage");
  }
});
