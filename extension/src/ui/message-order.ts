import type { ExtractedMessage } from "../shared/contracts.ts";

/** Readers return conversation DOM order (oldest first). observedAt is NOT sent time. */
export function newestFirst(
  messages: readonly ExtractedMessage[],
): ExtractedMessage[] {
  return [...messages].reverse();
}
