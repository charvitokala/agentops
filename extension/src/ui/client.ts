import "../shared/chrome.ts";
import type { ChromePort } from "../shared/chrome.ts";
import { isSnapshot, MONITORING_KEY, PORT_NAME } from "../shared/contracts.ts";
import type { MonitoringSnapshot } from "../shared/contracts.ts";

export async function getMonitoringPreference(): Promise<boolean> {
  const settings = await chrome.storage.local.get(MONITORING_KEY);
  return settings[MONITORING_KEY] === true;
}

export function setMonitoringPreference(enabled: boolean): Promise<void> {
  return chrome.storage.local.set({ [MONITORING_KEY]: enabled });
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
