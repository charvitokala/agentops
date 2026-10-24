/** Transport-friendly contracts shared by the UI and future integrations. */
export type RiskLevel = "high" | "medium" | "low";
export type InvestigationStatus =
  | "preliminary"
  | "awaiting_verification"
  | "verified";
export type SignalKind =
  | "urgency"
  | "kyc"
  | "external_link"
  | "otp_request"
  | "authority"
  | "returns"
  | "investment"
  | "scarcity"
  | "credentials"
  | "banking"
  | "upi"
  | "loan"
  | "insurance";

export interface MessageInput {
  id: string;
  text: string;
  source: "demo" | "manual" | "extension";
  receivedAt: string;
}

export interface DetectedSignal {
  id: string;
  kind: SignalKind;
  title: string;
  explanation: string;
  severity: RiskLevel;
  matchedText: string;
}

export interface RiskAssessment {
  level: RiskLevel;
  method: "local_rules";
  summary: string;
  limitations: string;
}

export interface CommunityNote {
  id: string;
  status: "illustrative" | "rule_generated";
  text: string;
}

export interface AgentFinding {
  id: string;
  role: "investigator" | "prosecutor" | "defender" | "judge";
  status: "not_available" | "pending" | "complete";
  description: string;
}

export interface EvidenceSource {
  id: string;
  type: "message" | "external";
  status: "unverified" | "verified";
  label: string;
  url?: string;
}

export interface SafetyAction {
  id: string;
  title: string;
  description: string;
}

export interface ScamCase {
  id: string;
  title: string;
  createdAt: string;
  status: InvestigationStatus;
  message: MessageInput;
  assessment: RiskAssessment;
  signals: DetectedSignal[];
  note: CommunityNote;
  actions: SafetyAction[];
  agents: AgentFinding[];
  evidence: EvidenceSource[];
}
