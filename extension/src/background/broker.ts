import {
  createExtensionCase,
  EXTENSION_CASE_PATTERN,
  isExtensionCase,
} from "../shared/handoff.ts";
import { websiteOrigin } from "../shared/website-config.ts";

export const PENDING_PREFIX = "verdictai:pending-case:";
export const EXPIRY_ALARM = "verdictai-case-expiry";
export interface HandoffSender {
  id?: string;
  url?: string;
  frameId?: number;
  tab?: { id?: number };
}
interface Pending {
  payload: ReturnType<typeof createExtensionCase>;
  targetTabId: number;
}
interface BrokerOptions {
  origin: string;
  extensionId: string;
  now?: () => number;
  storage: {
    getAll: () => Promise<Record<string, unknown>>;
    set: (items: Record<string, unknown>) => Promise<void>;
    remove: (keys: string[]) => Promise<void>;
  };
  openTab: (url: string) => Promise<{ id?: number }>;
  scheduleExpiry: (when: number | null) => Promise<void>;
}

export function createHandoffBroker(options: BrokerOptions) {
  const origin = websiteOrigin(options.origin);
  const now = options.now ?? Date.now;
  let queue: Promise<unknown> = Promise.resolve();
  function serialized<T>(work: () => Promise<T>): Promise<T> {
    const result = queue.then(work);
    queue = result.catch(() => {});
    return result;
  }
  async function prune(closedTabId?: number): Promise<Record<string, Pending>> {
    const data = await options.storage.getAll();
    const retained: Record<string, Pending> = {};
    const removed: string[] = [];
    for (const [key, value] of Object.entries(data)) {
      if (!key.startsWith(PENDING_PREFIX)) continue;
      const entry = value as Pending | null;
      const id = key.slice(PENDING_PREFIX.length);
      if (
        !entry ||
        typeof entry.targetTabId !== "number" ||
        entry.targetTabId === closedTabId ||
        !isExtensionCase(entry.payload, { caseId: id, origin, now: now() })
      )
        removed.push(key);
      else retained[key] = entry;
    }
    if (removed.length) await options.storage.remove(removed);
    const expiries = Object.values(retained).map((entry) =>
      Date.parse(entry.payload.expiresAt),
    );
    await options.scheduleExpiry(
      expiries.length ? Math.min(...expiries) : null,
    );
    return retained;
  }
  return {
    cleanup: (closedTabId?: number) => serialized(() => prune(closedTabId)),
    handle: (request: unknown, sender: HandoffSender): Promise<unknown> =>
      serialized(async () => {
        const retained = await prune();
        if (
          !request ||
          typeof request !== "object" ||
          sender.id !== options.extensionId ||
          sender.frameId !== 0 ||
          !Number.isSafeInteger(sender.tab?.id)
        )
          return { status: "rejected" };
        const data = request as Record<string, unknown>;
        let source: URL;
        try {
          source = new URL(sender.url ?? "");
        } catch {
          return { status: "rejected" };
        }
        if (data.type === "VERDICTAI_OPEN_CASE") {
          if (
            source.origin !== "https://web.whatsapp.com" ||
            Object.values(retained).length >= 8
          )
            return { status: "rejected" };
          let payload;
          try {
            payload = createExtensionCase(
              data.message,
              data.assessment,
              origin,
              now(),
            );
          } catch {
            return { status: "rejected" };
          }
          const url = `${origin}/investigation/${payload.caseId}`;
          const tab = await options.openTab(url);
          if (!Number.isSafeInteger(tab.id)) return { status: "unavailable" };
          await options.storage.set({
            [PENDING_PREFIX + payload.caseId]: { payload, targetTabId: tab.id },
          });
          await prune();
          return { status: "opened", caseId: payload.caseId };
        }
        if (data.type === "VERDICTAI_CLAIM_CASE") {
          const caseId = data.caseId;
          if (
            typeof caseId !== "string" ||
            !EXTENSION_CASE_PATTERN.test(caseId) ||
            source.origin !== origin ||
            source.pathname !== `/investigation/${caseId}` ||
            source.search ||
            source.hash
          )
            return { status: "rejected" };
          const key = PENDING_PREFIX + caseId;
          const entry = retained[key];
          if (!entry || entry.targetTabId !== sender.tab?.id)
            return { status: "unavailable" };
          // Serialized single-use consume: a second tab or concurrent request cannot claim it.
          await options.storage.remove([key]);
          await prune();
          return { status: "delivered", payload: entry.payload };
        }
        return { status: "rejected" };
      }),
  };
}
