import assert from "node:assert/strict";
import { test } from "node:test";
import { analyzeMessage } from "../../extension/src/detection/analyze-message.ts";

const assess = (text) => analyzeMessage({ id: "public-fictional-example", text, urls: [] });
test("critical rules remain high without requiring an SMS-spam model", () => {
  assert.equal(assess("Your bank account will be blocked in 10 minutes. Send your OTP immediately.").riskLevel, "high");
});
test("protective advice never becomes a credential-theft request", () => {
  const result = assess("Never share your OTP or PIN with anyone.");
  assert.equal(result.signals.some((signal) => signal.id === "credential-request"), false);
});
test("urgent KYC warnings retain verification and account-pressure evidence", () => {
  const result = assess("Complete your KYC verification immediately or your account will be suspended.");
  assert.ok(result.signals.some((signal) => signal.id === "kyc-request"));
  assert.ok(result.signals.some((signal) => signal.id === "account-threat"));
  assert.ok(["medium", "high"].includes(result.riskLevel));
});
test("routine delivery notices do not acquire unsupported scam findings", () => {
  assert.deepEqual(assess("Your credit card has been delivered.").signals, []);
});
test("ambiguous updates retain uncertainty", () => {
  assert.equal(assess("Account update.").riskLevel, "insufficient_evidence");
});
