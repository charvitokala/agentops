import { analyzeMessage } from "./analysis.ts";
import type { ScamCase } from "./contracts.ts";

const STORAGE_PREFIX = "verdictai:investigation:v1:";
export const LOCAL_CASE_PATTERN =
  /^local-[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;

/** Store only input; reconstruct trusted derived fields through the same rule engine. */
export function saveLocalInvestigation(item: ScamCase): void {
  sessionStorage.setItem(
    STORAGE_PREFIX + item.id,
    JSON.stringify({
      version: 1,
      id: item.id,
      text: item.message.text,
      createdAt: item.createdAt,
    }),
  );
}

export function loadLocalInvestigation(id: string): ScamCase | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_PREFIX + id);
    if (!raw) return null;
    const stored: unknown = JSON.parse(raw);
    if (!stored || typeof stored !== "object") return null;
    const record = stored as Record<string, unknown>;
    if (
      record.version !== 1 ||
      record.id !== id ||
      !LOCAL_CASE_PATTERN.test(id) ||
      typeof record.text !== "string" ||
      typeof record.createdAt !== "string" ||
      !Number.isFinite(Date.parse(record.createdAt))
    )
      return null;
    return analyzeMessage(record.text, id, record.createdAt);
  } catch {
    return null;
  }
}
