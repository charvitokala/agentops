import type { PreliminaryAssessment } from "../detection/types.ts";
import { isPreliminaryAssessment } from "../detection/types.ts";

export interface ExtractedMessage {
  id: string;
  text: string;
  urls: string[];
  direction: "incoming" | "outgoing" | "unknown";
  /** First observed in the current rendered-message window, not a sent timestamp. */
  observedAt: string;
  /** Gmail header data, kept transient alongside the currently opened body. */
  email?: { sender: string; subject: string };
}

export interface ActiveConversation {
  id: string;
  label: string;
  identitySource: "dom_attribute" | "header_label";
}

export interface MonitoringSnapshot {
  source?: "whatsapp" | "gmail";
  enabled: boolean;
  status:
    | "disabled"
    | "waiting_for_conversation"
    | "unsupported_layout"
    | "ready";
  conversation: ActiveConversation | null;
  messages: ExtractedMessage[];
  /** Present on controller snapshots; absent on raw reader snapshots. */
  assessments?: PreliminaryAssessment[];
  updatedAt: string | null;
}

export const MONITORING_KEY = "monitoringEnabled";
export const GMAIL_MONITORING_KEY = "gmailMonitoringEnabled";
export const PORT_NAME = "verdictai-reader-v1";

export function emptySnapshot(enabled = false): MonitoringSnapshot {
  return {
    enabled,
    status: enabled ? "waiting_for_conversation" : "disabled",
    conversation: null,
    messages: [],
    updatedAt: null,
  };
}

/** Validate messages crossing the content-script/extension-page boundary. */
export function isSnapshot(value: unknown): value is MonitoringSnapshot {
  if (!value || typeof value !== "object") return false;
  const item = value as Record<string, unknown>;
  const conversation = item.conversation as Record<string, unknown> | null;
  return (
    (item.source === undefined ||
      ["whatsapp", "gmail"].includes(String(item.source))) &&
    typeof item.enabled === "boolean" &&
    [
      "disabled",
      "waiting_for_conversation",
      "unsupported_layout",
      "ready",
    ].includes(String(item.status)) &&
    (item.updatedAt === null || typeof item.updatedAt === "string") &&
    (conversation === null ||
      (typeof conversation === "object" &&
        typeof conversation.id === "string" &&
        typeof conversation.label === "string" &&
        ["dom_attribute", "header_label"].includes(
          String(conversation.identitySource),
        ))) &&
    Array.isArray(item.messages) &&
    item.messages.every((message: unknown) => {
      if (!message || typeof message !== "object") return false;
      const data = message as Record<string, unknown>;
      return (
        typeof data.id === "string" &&
        typeof data.text === "string" &&
        typeof data.observedAt === "string" &&
        (data.email === undefined ||
          (data.email !== null &&
            typeof data.email === "object" &&
            typeof (data.email as Record<string, unknown>).sender ===
              "string" &&
            typeof (data.email as Record<string, unknown>).subject ===
              "string")) &&
        ["incoming", "outgoing", "unknown"].includes(String(data.direction)) &&
        Array.isArray(data.urls) &&
        data.urls.every((url: unknown) => typeof url === "string")
      );
    }) &&
    (item.assessments === undefined ||
      (Array.isArray(item.assessments) &&
        item.assessments.every(isPreliminaryAssessment) &&
        new Set(item.assessments.map((assessment) => assessment.messageId))
          .size === item.assessments.length &&
        item.assessments.every(
          (assessment) =>
            item.enabled === true &&
            (item.messages as ExtractedMessage[]).some(
              (message) => message.id === assessment.messageId,
            ),
        )))
  );
}
