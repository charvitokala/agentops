import assert from "node:assert/strict";
import { test } from "node:test";
import { AssessmentPipeline } from "../src/content/assessment-pipeline.ts";
import { analyzeMessage } from "../src/detection/analyze-message.ts";
import { isSnapshot } from "../src/shared/contracts.ts";

const message = (id, text = "Send your OTP.", urls = []) => ({
  id,
  text,
  urls,
  direction: "incoming",
  observedAt: "2026-10-24T14:00:00.000Z",
});
const snapshot = (messages = [], overrides = {}) => ({
  enabled: true,
  status: "ready",
  conversation: {
    id: "conversation-a",
    label: "Fictional A",
    identitySource: "header_label",
  },
  messages,
  updatedAt: null,
  ...overrides,
});

function countedPipeline() {
  let calls = 0;
  return {
    pipeline: new AssessmentPipeline((input) => {
      calls++;
      return analyzeMessage(
        input,
        `2026-10-24T14:00:${String(calls).padStart(2, "0")}.000Z`,
      );
    }),
    calls: () => calls,
  };
}

test("monitoring disabled means no analysis, and existing results are cleared", () => {
  const { pipeline, calls } = countedPipeline();
  assert.deepEqual(
    pipeline.reconcile(
      snapshot([message("a")], {
        enabled: false,
        status: "disabled",
        conversation: null,
      }),
    ).assessments,
    [],
  );
  assert.equal(calls(), 0);
  pipeline.reconcile(snapshot([message("a")]));
  assert.equal(calls(), 1);
  assert.deepEqual(
    pipeline.reconcile(
      snapshot([], { enabled: false, status: "disabled", conversation: null }),
    ).assessments,
    [],
  );
  pipeline.reconcile(snapshot([message("a")]));
  assert.equal(calls(), 2);
});

test("duplicate extraction and unchanged text do not repeat analysis", () => {
  const { pipeline, calls } = countedPipeline();
  const input = snapshot([message("a"), message("a")]);
  const first = pipeline.reconcile(input);
  assert.equal(first.assessments.length, 1);
  assert.equal(first.assessments[0].messageId, "a");
  assert.equal(calls(), 1);
  assert.deepEqual(pipeline.reconcile(input).assessments, first.assessments);
  assert.equal(calls(), 1);
});

test("changed message content updates its assessment without re-analyzing neighbors", () => {
  const { pipeline, calls } = countedPipeline();
  const initial = pipeline.reconcile(
    snapshot([message("a"), message("b", "A generic greeting.")]),
  );
  const edited = pipeline.reconcile(
    snapshot([
      message("a", "Never share your OTP."),
      message("b", "A generic greeting."),
    ]),
  );
  assert.equal(calls(), 3);
  assert.equal(edited.assessments[0].messageId, "a");
  assert.equal(edited.assessments[0].riskScore, 0);
  assert.notEqual(
    edited.assessments[0].analyzedAt,
    initial.assessments[0].analyzedAt,
  );
  assert.deepEqual(edited.assessments[1], initial.assessments[1]);
});

test("changed extracted URLs update an assessment, while URL order does not", () => {
  const { pipeline, calls } = countedPipeline();
  pipeline.reconcile(
    snapshot([message("a", "Bank notice.", ["https://business.example"])]),
  );
  const changed = pipeline.reconcile(
    snapshot([
      message("a", "Bank notice.", [
        "https://bit.ly/fictional",
        "https://business.example",
      ]),
    ]),
  );
  assert.equal(changed.assessments[0].riskScore, 25);
  assert.equal(calls(), 2);
  pipeline.reconcile(
    snapshot([
      message("a", "Bank notice.", [
        "https://business.example",
        "https://bit.ly/fictional",
      ]),
    ]),
  );
  assert.equal(calls(), 2);
});

test("conversation switching clears old results even when IDs and message text repeat", () => {
  const { pipeline, calls } = countedPipeline();
  const first = pipeline.reconcile(snapshot([message("a")]));
  const next = pipeline.reconcile(
    snapshot([message("a")], {
      conversation: {
        id: "conversation-b",
        label: "Fictional B",
        identitySource: "header_label",
      },
    }),
  );
  assert.equal(calls(), 2);
  assert.notEqual(
    next.assessments[0].analyzedAt,
    first.assessments[0].analyzedAt,
  );
  assert.equal(next.assessments[0].messageId, "a");
});

test("virtualized messages and unavailable conversations remove cached results", () => {
  const { pipeline, calls } = countedPipeline();
  pipeline.reconcile(snapshot([message("a"), message("b")]));
  const current = pipeline.reconcile(snapshot([message("b")]));
  assert.deepEqual(
    current.assessments.map((item) => item.messageId),
    ["b"],
  );
  pipeline.reconcile(snapshot([message("a"), message("b")]));
  assert.equal(calls(), 3);
  assert.deepEqual(
    pipeline.reconcile(snapshot([], { status: "unsupported_layout" }))
      .assessments,
    [],
  );
});

test("snapshot validation enforces assessment shape and original message association", () => {
  const result = new AssessmentPipeline().reconcile(snapshot([message("a")]));
  assert.equal(isSnapshot(result), true);
  assert.equal(
    isSnapshot({
      ...result,
      assessments: [{ ...result.assessments[0], messageId: "another-message" }],
    }),
    false,
  );
  assert.equal(
    isSnapshot({
      ...result,
      assessments: [{ ...result.assessments[0], riskScore: 200 }],
    }),
    false,
  );
  assert.equal(
    isSnapshot({
      ...result,
      assessments: [result.assessments[0], result.assessments[0]],
    }),
    false,
  );
  assert.equal(isSnapshot({ ...result, enabled: false }), false);
});
