import type { ExtractedMessage } from "./contracts.ts";
import type { PreliminaryAssessment } from "../detection/types.ts";
import { isPreliminaryAssessment } from "../detection/types.ts";
import { analyzeMessage } from "../detection/analyze-message.ts";
import { websiteOrigin } from "./website-config.ts";

export const EXTENSION_CASE_PATTERN =
  /^ext-[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
export const HANDOFF_CHANNEL = "verdictai.case.v1";
export const HANDOFF_TTL_MS = 120_000;
export const MAX_CASE_TEXT = 20_000;

export interface ExtensionCase {
  version: 1;
  caseId: string;
  websiteOrigin: string;
  createdAt: string;
  expiresAt: string;
  message: ExtractedMessage;
  assessment: PreliminaryAssessment;
}

function exactKeys(value: object, keys: string[]): boolean {
  return Object.keys(value).sort().join("|") === [...keys].sort().join("|");
}

export function isSelectedMessage(value: unknown): value is ExtractedMessage {
  if (!value || typeof value !== "object") return false;
  const item = value as Record<string, unknown>;
  return (
    exactKeys(item, ["id", "text", "urls", "direction", "observedAt"]) &&
    typeof item.id === "string" &&
    item.id.length > 0 &&
    item.id.length <= 4096 &&
    typeof item.text === "string" &&
    item.text.trim().length > 0 &&
    item.text.length <= MAX_CASE_TEXT &&
    item.direction === "incoming" &&
    typeof item.observedAt === "string" &&
    Number.isFinite(Date.parse(item.observedAt)) &&
    Array.isArray(item.urls) &&
    item.urls.length <= 32 &&
    item.urls.every((url: unknown) => {
      if (typeof url !== "string" || url.length > 4096) return false;
      try {
        return ["http:", "https:"].includes(new URL(url).protocol);
      } catch {
        return false;
      }
    })
  );
}

function assessmentKey(item: PreliminaryAssessment): string {
  return JSON.stringify([
    item.messageId,
    item.riskLevel,
    item.riskScore,
    item.category,
    item.signals.map((signal) => [
      signal.id,
      signal.label,
      signal.explanation,
      signal.weight,
    ]),
    item.summary,
    item.recommendedActions,
    item.analyzedAt,
    item.analysisMethod,
  ]);
}

export function isSelectedAssessment(
  message: ExtractedMessage,
  value: unknown,
): value is PreliminaryAssessment {
  if (
    !isPreliminaryAssessment(value) ||
    !exactKeys(value, [
      "messageId",
      "riskLevel",
      "riskScore",
      "category",
      "signals",
      "summary",
      "recommendedActions",
      "analyzedAt",
      "analysisMethod",
    ])
  )
    return false;
  if (
    value.messageId !== message.id ||
    !["high", "medium"].includes(value.riskLevel) ||
    value.signals.length > 32 ||
    value.recommendedActions.length > 32 ||
    value.summary.length > 1000
  )
    return false;
  if (
    !value.signals.every(
      (signal) =>
        exactKeys(signal, ["id", "label", "explanation", "weight"]) &&
        signal.id.length <= 128 &&
        signal.label.length <= 500 &&
        signal.explanation.length <= 5000,
    ) ||
    !value.recommendedActions.every((action) => action.length <= 1000)
  )
    return false;
  // Reuse the Phase 1C engine to reject altered scores, claims or instructions.
  return (
    assessmentKey(value) ===
    assessmentKey(analyzeMessage(message, value.analyzedAt))
  );
}

export function createExtensionCase(
  message: unknown,
  assessment: unknown,
  origin: string,
  now = Date.now(),
  caseId = `ext-${globalThis.crypto.randomUUID()}`,
): ExtensionCase {
  if (
    !isSelectedMessage(message) ||
    !isSelectedAssessment(message, assessment) ||
    !EXTENSION_CASE_PATTERN.test(caseId)
  )
    throw new Error("Invalid selected case.");
  const target = websiteOrigin(origin);
  // Raw WhatsApp data-id can contain chat identifiers. Do not transfer it.
  const selected: ExtractedMessage = {
    id: caseId,
    text: message.text,
    urls: [...message.urls],
    direction: "incoming",
    observedAt: message.observedAt,
  };
  return {
    version: 1,
    caseId,
    websiteOrigin: target,
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + HANDOFF_TTL_MS).toISOString(),
    message: selected,
    assessment: { ...structuredClone(assessment), messageId: caseId },
  };
}

export function isExtensionCase(
  value: unknown,
  expected: {
    caseId: string;
    origin: string;
    now?: number;
    checkExpiry?: boolean;
  },
): value is ExtensionCase {
  if (!value || typeof value !== "object") return false;
  const item = value as ExtensionCase;
  if (
    typeof item.caseId !== "string" ||
    typeof item.websiteOrigin !== "string" ||
    typeof item.createdAt !== "string" ||
    typeof item.expiresAt !== "string"
  )
    return false;
  if (
    !exactKeys(item, [
      "version",
      "caseId",
      "websiteOrigin",
      "createdAt",
      "expiresAt",
      "message",
      "assessment",
    ]) ||
    item.version !== 1 ||
    !EXTENSION_CASE_PATTERN.test(item.caseId) ||
    item.caseId !== expected.caseId ||
    item.websiteOrigin !== expected.origin
  )
    return false;
  try {
    if (websiteOrigin(item.websiteOrigin) !== item.websiteOrigin) return false;
  } catch {
    return false;
  }
  const created = Date.parse(item.createdAt);
  const expires = Date.parse(item.expiresAt);
  const now = expected.now ?? Date.now();
  if (
    !Number.isFinite(created) ||
    !Number.isFinite(expires) ||
    expires - created !== HANDOFF_TTL_MS
  )
    return false;
  if (
    expected.checkExpiry !== false &&
    (now < created - 10_000 || now >= expires)
  )
    return false;
  return (
    isSelectedMessage(item.message) &&
    item.message.id === item.caseId &&
    isSelectedAssessment(item.message, item.assessment)
  );
}
