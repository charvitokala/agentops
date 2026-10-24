import {
  isExtensionCase,
  EXTENSION_CASE_PATTERN,
} from "../../extension/src/shared/handoff.ts";
import type { ExtensionCase } from "../../extension/src/shared/handoff.ts";
import { COURTROOM_AGENTS } from "./analysis.ts";
import type { ScamCase, SignalKind } from "./contracts.ts";

export { EXTENSION_CASE_PATTERN };
const PREFIX = "verdictai:extension-case:v1:";
export interface CaseStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function saveExtensionCase(
  storage: CaseStorage,
  payload: unknown,
  caseId: string,
  origin: string,
): ExtensionCase {
  if (!isExtensionCase(payload, { caseId, origin }))
    throw new Error("The extension case could not be validated.");
  storage.setItem(PREFIX + caseId, JSON.stringify(payload));
  return payload;
}

export function loadExtensionCase(
  storage: CaseStorage,
  caseId: string,
  origin: string,
): ExtensionCase | null {
  try {
    const raw = storage.getItem(PREFIX + caseId);
    if (!raw) return null;
    const payload: unknown = JSON.parse(raw);
    // Transport expiry is checked at receipt. A retained website tab may refresh later.
    return isExtensionCase(payload, { caseId, origin, checkExpiry: false })
      ? payload
      : null;
  } catch {
    return null;
  }
}

export function extensionCaseToScamCase(payload: ExtensionCase): ScamCase {
  if (
    !isExtensionCase(payload, {
      caseId: payload.caseId,
      origin: payload.websiteOrigin,
      checkExpiry: false,
    })
  )
    throw new Error("Invalid extension investigation.");
  const assessment = payload.assessment;
  const kinds: Record<string, SignalKind> = {
    "credential-request": "credentials",
    "upi-pin-receive": "upi",
    "upi-qr-receive": "upi",
    "upi-collect-receive": "upi",
    "refund-advance": "upi",
    "loan-upfront-fee": "loan",
    "guaranteed-loan": "loan",
    "insurance-release-fee": "insurance",
    "policy-cancellation": "insurance",
    "policy-renewal-demand": "insurance",
    "account-threat": "urgency",
    "kyc-request": "kyc",
    "account-verification": "banking",
    "bank-claim": "authority",
    "guaranteed-returns": "returns",
    "risk-free-investment": "investment",
    "url-pattern": "external_link",
    urgency: "urgency",
  };
  if (assessment.riskLevel !== "high" && assessment.riskLevel !== "medium")
    throw new Error("Unsupported extension risk state.");
  return {
    id: payload.caseId,
    title: "WhatsApp message investigation",
    createdAt: payload.createdAt,
    status: "preliminary",
    message: {
      id: payload.message.id,
      text: payload.message.text,
      source: "extension",
      receivedAt: payload.message.observedAt,
    },
    assessment: {
      level: assessment.riskLevel,
      method: "local_rules",
      summary: assessment.summary,
      limitations: `Heuristic severity score: ${assessment.riskScore}/100, not a fraud probability. Category: ${assessment.category}. Sender identity, links and claims have not been verified.`,
    },
    signals: assessment.signals.map((signal) => ({
      id: signal.id,
      kind: kinds[signal.id] ?? "banking",
      title: signal.label,
      explanation: signal.explanation,
      severity:
        signal.weight >= 40 ? "high" : signal.weight >= 25 ? "medium" : "low",
      matchedText: "",
    })),
    note: {
      id: `${payload.caseId}:note`,
      status: "rule_generated",
      text: assessment.summary,
    },
    actions: assessment.recommendedActions.map((action, index) => ({
      id: `${payload.caseId}:action:${index}`,
      title: action,
      description: "",
    })),
    agents: COURTROOM_AGENTS.map((agent) => ({ ...agent })),
    evidence: [
      {
        id: `${payload.caseId}:message`,
        type: "message",
        status: "unverified",
        label: "Selected WhatsApp message text",
      },
      ...payload.message.urls.map((url, index) => ({
        id: `${payload.caseId}:url:${index}`,
        type: "external" as const,
        status: "unverified" as const,
        label: `Unverified URL: ${url}`,
        url,
      })),
    ],
  };
}
