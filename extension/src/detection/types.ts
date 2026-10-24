import type { ExtractedMessage } from "../shared/contracts.ts";

export const RISK_LEVELS = [
  "high",
  "medium",
  "low",
  "insufficient_evidence",
] as const;
export type RiskLevel = (typeof RISK_LEVELS)[number];
export const SCAM_CATEGORIES = [
  "banking",
  "kyc",
  "credentials",
  "upi",
  "investment",
  "loan",
  "insurance",
  "unknown",
] as const;
export type ScamCategory = (typeof SCAM_CATEGORIES)[number];
export type AnalyzableMessage = Pick<ExtractedMessage, "id" | "text" | "urls">;

export interface DetectedSignal {
  id: string;
  label: string;
  explanation: string;
  weight: number;
}

export interface PreliminaryAssessment {
  messageId: string;
  riskLevel: RiskLevel;
  /** Heuristic severity, never a calibrated probability or percentage. */
  riskScore: number;
  category: ScamCategory;
  signals: DetectedSignal[];
  summary: string;
  recommendedActions: string[];
  analyzedAt: string;
  analysisMethod: "local_rules";
}

export function isPreliminaryAssessment(
  value: unknown,
): value is PreliminaryAssessment {
  if (!value || typeof value !== "object") return false;
  const data = value as Record<string, unknown>;
  return (
    typeof data.messageId === "string" &&
    RISK_LEVELS.some((risk) => risk === data.riskLevel) &&
    typeof data.riskScore === "number" &&
    Number.isFinite(data.riskScore) &&
    data.riskScore >= 0 &&
    data.riskScore <= 100 &&
    SCAM_CATEGORIES.some((category) => category === data.category) &&
    typeof data.summary === "string" &&
    data.summary.length > 0 &&
    data.analysisMethod === "local_rules" &&
    typeof data.analyzedAt === "string" &&
    Number.isFinite(Date.parse(data.analyzedAt)) &&
    Array.isArray(data.recommendedActions) &&
    data.recommendedActions.length > 0 &&
    data.recommendedActions.every(
      (action: unknown) => typeof action === "string",
    ) &&
    Array.isArray(data.signals) &&
    data.signals.every((signal: unknown) => {
      if (!signal || typeof signal !== "object") return false;
      const item = signal as Record<string, unknown>;
      return (
        typeof item.id === "string" &&
        typeof item.label === "string" &&
        typeof item.explanation === "string" &&
        typeof item.weight === "number" &&
        Number.isFinite(item.weight) &&
        item.weight > 0 &&
        item.weight <= 100
      );
    })
  );
}
