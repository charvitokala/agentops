import "../shared/chrome.ts";
import type { ChromePort } from "../shared/chrome.ts";
import {
  isSnapshot,
  GMAIL_MONITORING_KEY,
  MONITORING_KEY,
  PORT_NAME,
} from "../shared/contracts.ts";
import type { MonitoringSnapshot } from "../shared/contracts.ts";

export async function getMonitoringPreference(
  source = "whatsapp",
): Promise<boolean> {
  const key = source === "gmail" ? GMAIL_MONITORING_KEY : MONITORING_KEY;
  const settings = await chrome.storage.local.get(key);
  return settings[key] === true;
}

export function setMonitoringPreference(
  enabled: boolean,
  source = "whatsapp",
): Promise<void> {
  const key = source === "gmail" ? GMAIL_MONITORING_KEY : MONITORING_KEY;
  return chrome.storage.local.set({ [key]: enabled });
}

/** The source reader revalidates this ID; debug-page text is never trusted as a case. */
export async function openSelectedInvestigation(
  tabId: number,
  messageId: string,
): Promise<void> {
  const response = (await chrome.tabs.sendMessage(tabId, {
    type: "VERDICTAI_OPEN_SELECTED_MESSAGE",
    messageId,
  })) as { status?: string };
  if (response?.status !== "opened")
    throw new Error("Selected message unavailable.");
}

export function connectToReader(
  tabId: number,
  onSnapshot: (snapshot: MonitoringSnapshot) => void,
  onUnavailable: () => void,
): () => void {
  let port: ChromePort;
  let closed = false;
  try {
    port = chrome.tabs.connect(tabId, { name: PORT_NAME });
    port.onMessage.addListener((value) => {
      if (!closed && isSnapshot(value)) onSnapshot(value);
    });
    port.onDisconnect.addListener(() => {
      // Read lastError to acknowledge an absent/reloaded content script silently.
      void chrome.runtime.lastError;
      if (!closed) {
        closed = true;
        onUnavailable();
      }
    });
  } catch {
    onUnavailable();
    return () => {};
  }
  return () => {
    closed = true;
    try {
      port.disconnect();
    } catch {
      /* Closed with the source tab. */
    }
  };
}
