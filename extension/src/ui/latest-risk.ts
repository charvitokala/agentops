import type { MonitoringSnapshot } from "../shared/contracts.ts";
import type { RiskLevel } from "../detection/types.ts";
import { newestFirst } from "./message-order.ts";

const labels: Record<RiskLevel, string> = {
  high: "High risk",
  medium: "Medium risk",
  low: "Low indicators",
  insufficient_evidence: "Insufficient evidence",
};

/** Show only the newest rendered message's existing assessment, never an older fallback. */
export function renderLatestRisk(
  container: HTMLElement,
  snapshot?: MonitoringSnapshot,
): void {
  const value = container.querySelector<HTMLElement>(".latest-risk-value")!;
  const latest =
    snapshot?.enabled && snapshot.status === "ready"
      ? newestFirst(snapshot.messages)[0]
      : undefined;
  container.hidden = !latest;
  value.textContent = "";
  value.removeAttribute("data-risk");
  if (!latest) return;
  const assessment = snapshot?.assessments?.find(
    (item) => item.messageId === latest.id,
  );
  if (!assessment) {
    value.textContent = "Assessment unavailable";
    return;
  }
  const score =
    typeof assessment.riskScore === "number" &&
    Number.isFinite(assessment.riskScore)
      ? `${Math.min(100, Math.max(0, assessment.riskScore))}%`
      : "N/A";
  value.textContent = `${labels[assessment.riskLevel]} — ${score}`;
  value.dataset.risk = assessment.riskLevel;
}
