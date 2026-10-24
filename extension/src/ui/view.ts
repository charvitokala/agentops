import type { MonitoringSnapshot } from "../shared/contracts.ts";
import type {
  PreliminaryAssessment,
  RiskLevel,
  ScamCategory,
} from "../detection/types.ts";

const riskLabels: Record<RiskLevel, string> = {
  high: "High risk",
  medium: "Medium risk",
  low: "Low indicators",
  insufficient_evidence: "Insufficient evidence",
};
const categoryLabels: Record<ScamCategory, string> = {
  banking: "Banking",
  kyc: "KYC verification",
  credentials: "Codes and credentials",
  upi: "UPI and payments",
  investment: "Investments",
  loan: "Loans",
  insurance: "Insurance",
  unknown: "Not identified",
};

function assessmentView(
  assessment: PreliminaryAssessment | undefined,
): HTMLElement {
  const section = document.createElement("section");
  section.className = "preliminary-assessment";
  const heading = document.createElement("h3");
  heading.textContent = "Preliminary rule-based assessment";
  section.append(heading);
  if (!assessment) {
    const missing = document.createElement("p");
    missing.className = "secondary";
    missing.textContent =
      "Assessment unavailable. Reload WhatsApp Web to update the reader.";
    section.append(missing);
    return section;
  }
  const risk = document.createElement("span");
  risk.className = `badge assessment-risk risk-${assessment.riskLevel}`;
  risk.textContent = riskLabels[assessment.riskLevel];
  const category = document.createElement("p");
  category.className = "assessment-category";
  category.textContent = `Category: ${categoryLabels[assessment.category]}`;
  const summary = document.createElement("p");
  summary.className = "assessment-summary";
  summary.textContent = assessment.summary;
  const score = document.createElement("p");
  score.className = "secondary";
  score.textContent = `Rule severity score: ${assessment.riskScore}/100. This is a heuristic score, not a fraud probability.`;
  section.append(risk, category, summary, score);
  const signalsHeading = document.createElement("h4");
  signalsHeading.textContent = "Warning signs";
  section.append(signalsHeading);
  if (!assessment.signals.length) {
    const none = document.createElement("p");
    none.className = "secondary";
    none.textContent =
      "No warning patterns matched these rules. The message and sender are not verified.";
    section.append(none);
  } else {
    const list = document.createElement("ul");
    for (const signal of assessment.signals) {
      const item = document.createElement("li");
      const label = document.createElement("strong");
      label.textContent = signal.label;
      const explanation = document.createElement("p");
      explanation.textContent = signal.explanation;
      item.append(label, explanation);
      list.append(item);
    }
    section.append(list);
  }
  const actionsHeading = document.createElement("h4");
  actionsHeading.textContent = "What to do next";
  const actions = document.createElement("ol");
  for (const recommendation of assessment.recommendedActions) {
    const action = document.createElement("li");
    action.textContent = recommendation;
    actions.append(action);
  }
  const note = document.createElement("p");
  note.className = "secondary";
  note.textContent =
    "Local rules only. No AI agents have run, and no evidence or sender identity has been verified.";
  section.append(actionsHeading, actions, note);
  return section;
}

export function element<T extends HTMLElement>(id: string): T {
  const found = document.getElementById(id);
  if (!found) throw new Error(`Missing interface element: ${id}`);
  return found as T;
}

export function describeSnapshot(snapshot: MonitoringSnapshot): string {
  if (!snapshot.enabled) return "Monitoring is off";
  if (snapshot.status === "waiting_for_conversation")
    return "Open a conversation in WhatsApp Web";
  if (snapshot.status === "unsupported_layout")
    return "Conversation layout not recognized";
  return snapshot.conversation
    ? `Open conversation: ${snapshot.conversation.label}`
    : "Conversation detected";
}

export function renderMessages(
  container: HTMLElement,
  snapshot: MonitoringSnapshot,
): void {
  const fragment = document.createDocumentFragment();
  const assessments = new Map(
    snapshot.assessments?.map((assessment) => [
      assessment.messageId,
      assessment,
    ]),
  );
  for (const message of snapshot.messages) {
    const card = document.createElement("article");
    card.className = "card message-card";
    const meta = document.createElement("div");
    meta.className = "message-meta";
    const direction = document.createElement("span");
    direction.className = "badge";
    direction.textContent = {
      incoming: "Incoming",
      outgoing: "Outgoing",
      unknown: "Direction unknown",
    }[message.direction];
    const time = document.createElement("time");
    time.dateTime = message.observedAt;
    const date = new Date(message.observedAt);
    time.textContent = `Observed ${Number.isFinite(date.getTime()) ? date.toLocaleString() : message.observedAt}`;
    meta.append(direction, time);
    const text = document.createElement("p");
    text.className = "message-text";
    text.textContent = message.text;
    const linksLabel = document.createElement("h3");
    linksLabel.textContent = "Extracted URLs";
    card.append(
      meta,
      text,
      assessmentView(assessments.get(message.id)),
      linksLabel,
    );
    if (!message.urls.length) {
      const none = document.createElement("p");
      none.className = "secondary";
      none.textContent = "No URLs detected.";
      card.append(none);
    } else {
      const list = document.createElement("ul");
      for (const url of message.urls) {
        const item = document.createElement("li");
        const code = document.createElement("code");
        code.textContent = url;
        item.append(code);
        list.append(item);
      }
      card.append(list);
    }
    fragment.append(card);
  }
  // All WhatsApp-derived content is textContent, never HTML or clickable links.
  container.replaceChildren(fragment);
}
