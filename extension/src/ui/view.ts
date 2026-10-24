import type {
  ExtractedMessage,
  MonitoringSnapshot,
} from "../shared/contracts.ts";
import { explainAssessment } from "../detection/explanations.ts";
import type {
  PreliminaryAssessment,
  RiskLevel,
  ScamCategory,
} from "../detection/types.ts";
import { cardInsights, investigationSummary } from "./card-insights.ts";
import { cardIcon } from "./icons.ts";
import type { CardIcon } from "./icons.ts";

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

function textNode(
  document: Document,
  tag: string,
  text: string,
  className = "",
): HTMLElement {
  const node = document.createElement(tag);
  node.className = className;
  node.textContent = text;
  return node;
}

function panel(
  document: Document,
  className: string,
  heading: string,
  icon?: CardIcon,
): HTMLElement {
  const card = document.createElement("section");
  card.className = `card dashboard-card ${className}`;
  const title = textNode(document, "h3", heading, "card-heading");
  if (icon) title.prepend(cardIcon(document, icon));
  card.append(title);
  return card;
}

function scoreCard(document: Document, value: unknown): HTMLElement {
  const score =
    typeof value === "number" && Number.isFinite(value)
      ? Math.min(100, Math.max(0, value))
      : null;
  const card = panel(
    document,
    "score-card fraud-risk-score",
    "Fraud Risk Score",
  );
  card.append(
    textNode(
      document,
      "p",
      score === null ? "N/A" : `${score}%`,
      "fraud-risk-score-value",
    ),
    textNode(
      document,
      "p",
      "Rule-based risk score, not a fraud probability.",
      "secondary",
    ),
  );
  return card;
}

function technicalDetails(
  document: Document,
  message: ExtractedMessage,
  assessment?: PreliminaryAssessment,
): HTMLElement {
  const details = document.createElement("details");
  details.className = "card technical-details";
  details.append(textNode(document, "summary", "Technical Details"));
  const meta = document.createElement("div");
  meta.className = "message-meta";
  meta.append(
    textNode(
      document,
      "span",
      {
        incoming: "Incoming",
        outgoing: "Outgoing",
        unknown: "Direction unknown",
      }[message.direction],
      "badge",
    ),
  );
  const time = document.createElement("time");
  time.dateTime = message.observedAt;
  const date = new Date(message.observedAt);
  time.textContent = `Observed ${Number.isFinite(date.getTime()) ? date.toLocaleString() : message.observedAt}`;
  meta.append(time);
  details.append(
    meta,
    textNode(document, "h3", "Preliminary rule-based assessment"),
  );
  if (assessment) {
    details.append(
      textNode(
        document,
        "p",
        `Category: ${categoryLabels[assessment.category]}`,
        "secondary",
      ),
      textNode(document, "p", assessment.summary, "assessment-summary"),
      textNode(
        document,
        "p",
        `Method: ${assessment.analysisMethod}. Analyzed: ${assessment.analyzedAt}`,
        "secondary",
      ),
    );
    const explanation = explainAssessment(message, assessment);
    details.append(textNode(document, "h3", explanation.heading));
    const findings = document.createElement("ul");
    for (const finding of explanation.items) {
      const item = document.createElement("li");
      item.append(
        textNode(document, "strong", finding.label),
        textNode(document, "p", finding.explanation),
      );
      findings.append(item);
    }
    const fullActions = document.createElement("ol");
    for (const action of assessment.recommendedActions)
      fullActions.append(textNode(document, "li", action));
    details.append(
      findings,
      textNode(document, "h3", "All recommendations"),
      fullActions,
    );
  }
  details.append(
    textNode(
      document,
      "p",
      "Local rules only. No AI agents have run, and no evidence or sender identity has been verified.",
      "secondary",
    ),
  );
  details.append(textNode(document, "h3", "Extracted URLs"));
  if (!message.urls.length)
    details.append(textNode(document, "p", "No URLs detected.", "secondary"));
  else {
    const list = document.createElement("ul");
    for (const url of message.urls) {
      const item = document.createElement("li");
      item.append(textNode(document, "code", url));
      list.append(item);
    }
    details.append(list);
  }
  return details;
}

function messageDashboard(
  document: Document,
  message: ExtractedMessage,
  assessment: PreliminaryAssessment | undefined,
  moreInfo: (() => Promise<void>) | undefined,
): HTMLElement {
  const article = document.createElement("article");
  article.className = "card message-card";
  article.id = `message-${globalThis.crypto.randomUUID()}`;
  article.dataset.messageId = message.id;
  article.setAttribute(
    "aria-label",
    message.email?.subject || "Message analysis",
  );
  const grid = document.createElement("div");
  grid.className = "preliminary-assessment dashboard-grid";
  const original = panel(
    document,
    "original-message-card",
    "Message",
    "message",
  );
  if (message.email)
    original.append(
      textNode(document, "p", `From: ${message.email.sender}`, "email-sender"),
    );
  const content = textNode(document, "p", message.text, "message-text");
  content.tabIndex = 0;
  content.setAttribute("role", "region");
  content.setAttribute("aria-label", "Complete message content");
  original.append(content);
  const summary = panel(
    document,
    "message-summary-card",
    "Investigation",
    "search",
  );
  summary.append(
    textNode(document, "p", investigationSummary(message), "content-summary"),
  );
  const level = assessment?.riskLevel;
  const risk = panel(
    document,
    `risk-status-card risk-${level ?? "insufficient_evidence"}`,
    "Final Judgment",
    "scales",
  );
  const status = level ? riskLabels[level] : "N/A";
  risk.append(textNode(document, "p", status, "risk-status-value"));
  risk.append(
    textNode(document, "p", "Local rules · no agents run", "risk-caution"),
  );
  const insights = cardInsights(message, assessment);
  function perspective(
    className: string,
    heading: string,
    icon: CardIcon,
    items: string[],
  ): HTMLElement {
    const card = panel(
      document,
      `${className} perspective-card`,
      heading,
      icon,
    );
    card.querySelector("h3")?.classList.add("assessment-explanation-heading");
    const list = document.createElement("ul");
    for (const item of items) list.append(textNode(document, "li", item));
    card.append(list);
    return card;
  }
  const defender = perspective(
    "defender-card",
    "Defender",
    "shield",
    insights.defender,
  );
  const prosecutor = perspective(
    "explanation-card prosecutor-card",
    "Prosecuter",
    "lawyer",
    insights.prosecutor,
  );
  const actions = document.createElement("section");
  actions.className = "card dashboard-card actions-card";
  actions.append(
    textNode(
      document,
      "h4",
      "What to do next",
      "assessment-explanation-heading",
    ),
  );
  const recommendations = document.createElement("ol");
  for (const action of insights.actions)
    recommendations.append(textNode(document, "li", action));
  actions.append(recommendations);
  if (moreInfo) {
    const button = textNode(
      document,
      "button",
      "More Info →",
      "primary",
    ) as HTMLButtonElement;
    button.type = "button";
    const error = textNode(document, "p", "", "error");
    error.setAttribute("role", "status");
    button.addEventListener("click", async () => {
      button.disabled = true;
      error.textContent = "";
      try {
        await moreInfo();
      } catch {
        error.textContent =
          "This message is unavailable. Check monitoring and reload the source tab, then try again.";
      } finally {
        button.disabled = false;
      }
    });
    actions.append(button, error);
  }
  grid.append(
    original,
    risk,
    scoreCard(document, assessment?.riskScore),
    summary,
    defender,
    prosecutor,
    actions,
  );
  article.append(grid, technicalDetails(document, message, assessment));
  return article;
}

export function element<T extends HTMLElement>(id: string): T {
  const found = document.getElementById(id);
  if (!found) throw new Error(`Missing interface element: ${id}`);
  return found as T;
}

export function describeSnapshot(snapshot: MonitoringSnapshot): string {
  if (!snapshot.enabled) return "Monitoring is off";
  if (snapshot.status === "waiting_for_conversation")
    return snapshot.source === "gmail"
      ? "Open an email in Gmail"
      : "Open a conversation in WhatsApp Web";
  if (snapshot.status === "unsupported_layout")
    return "Conversation layout not recognized";
  return snapshot.conversation
    ? `${snapshot.source === "gmail" ? "Open email" : "Open conversation"}: ${snapshot.conversation.label}`
    : "Conversation detected";
}

interface RenderCache {
  records: Map<string, { node: HTMLElement; fingerprint: string }>;
  moreInfo?: (messageId: string) => Promise<void>;
}
const renderCaches = new WeakMap<HTMLElement, RenderCache>();

/** Reconcile by message ID; unchanged sections retain scroll position and open details. */
export function renderMessages(
  container: HTMLElement,
  snapshot: MonitoringSnapshot,
  onMoreInfo?: (messageId: string) => Promise<void>,
): void {
  let cache = renderCaches.get(container);
  if (!cache) {
    cache = { records: new Map() };
    renderCaches.set(container, cache);
  }
  cache.moreInfo = onMoreInfo;
  const assessments = new Map(
    snapshot.assessments?.map((item) => [item.messageId, item]),
  );
  const current = new Set<string>();
  let position = 0;
  for (const message of snapshot.messages) {
    if (current.has(message.id)) continue;
    current.add(message.id);
    const assessment = assessments.get(message.id);
    const eligible = Boolean(
      onMoreInfo &&
        snapshot.enabled &&
        snapshot.status === "ready" &&
        message.direction === "incoming" &&
        assessment &&
        ["high", "medium"].includes(assessment.riskLevel),
    );
    const fingerprint = JSON.stringify([message, assessment, eligible]);
    let record = cache.records.get(message.id);
    if (!record || record.fingerprint !== fingerprint) {
      const node = messageDashboard(
        container.ownerDocument,
        message,
        assessment,
        eligible ? () => cache!.moreInfo!(message.id) : undefined,
      );
      if (record) {
        node.id = record.node.id;
        const wasOpen = record.node.querySelector("details")?.open;
        const details = node.querySelector("details");
        if (details) details.open = Boolean(wasOpen);
        record.node.replaceWith(node);
      }
      record = { node, fingerprint };
      cache.records.set(message.id, record);
    }
    if (container.children[position] !== record.node)
      container.insertBefore(record.node, container.children[position] ?? null);
    position++;
  }
  for (const [id, record] of cache.records)
    if (!current.has(id)) {
      record.node.remove();
      cache.records.delete(id);
    }
}
