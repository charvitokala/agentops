import type { MonitoringSnapshot } from "../shared/contracts.ts";
import { analyzeMessage } from "../detection/analyze-message.ts";
import type { PreliminaryAssessment } from "../detection/types.ts";

export type AssessedSnapshot = MonitoringSnapshot & {
  assessments: PreliminaryAssessment[];
};

/** Bounded to the current conversation's rendered window; never a chat history. */
export class AssessmentPipeline {
  private conversationId: string | null = null;
  private cache = new Map<
    string,
    { fingerprint: string; assessment: PreliminaryAssessment }
  >();
  private readonly analyze: typeof analyzeMessage;

  constructor(analyze = analyzeMessage) {
    this.analyze = analyze;
  }

  reconcile(snapshot: MonitoringSnapshot): AssessedSnapshot {
    if (
      !snapshot.enabled ||
      snapshot.status !== "ready" ||
      !snapshot.conversation
    ) {
      this.cache.clear();
      this.conversationId = null;
      return { ...snapshot, assessments: [] };
    }
    if (snapshot.conversation.id !== this.conversationId) this.cache.clear();
    this.conversationId = snapshot.conversation.id;
    const current = new Map<
      string,
      { fingerprint: string; assessment: PreliminaryAssessment }
    >();
    for (const message of snapshot.messages) {
      if (current.has(message.id)) continue;
      const fingerprint = JSON.stringify([
        message.text,
        [...new Set(message.urls)].sort(),
      ]);
      const previous = this.cache.get(message.id);
      current.set(
        message.id,
        previous?.fingerprint === fingerprint
          ? previous
          : { fingerprint, assessment: this.analyze(message) },
      );
    }
    this.cache = current;
    return {
      ...snapshot,
      assessments: structuredClone(
        [...current.values()].map((entry) => entry.assessment),
      ),
    };
  }
}
