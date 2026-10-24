import { connectToReader, setMonitoringPreference } from "./client.ts";
import { describeSnapshot, element } from "./view.ts";
import { renderLatestRisk } from "./latest-risk.ts";

const toggle = element<HTMLInputElement>("monitoring");
const status = element("status");
const count = element("count");
const latestRisk = element("latest-risk");
const error = element("error");
const openDebug = element<HTMLButtonElement>("open-debug");
let tabId: number | undefined;
let source = "whatsapp";
let disconnect = () => {};

toggle.addEventListener("change", async () => {
  toggle.disabled = true;
  error.textContent = "";
  try {
    await setMonitoringPreference(toggle.checked, source);
  } catch {
    toggle.checked = !toggle.checked;
    error.textContent =
      "The monitoring preference could not be saved. Try again.";
  } finally {
    toggle.disabled = false;
  }
});
openDebug.addEventListener("click", async () => {
  if (tabId === undefined) return;
  try {
    await chrome.tabs.create({
      url: `${chrome.runtime.getURL("debug.html")}#tab=${tabId}`,
    });
    window.close();
  } catch {
    error.textContent = "The debugging view could not be opened. Try again.";
  }
});
window.addEventListener("pagehide", () => disconnect(), { once: true });

async function initialize() {
  try {
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });
    tabId = tab?.id;
    if (tabId === undefined) {
      status.textContent = "Open a supported message tab to connect.";
      return;
    }
    disconnect = connectToReader(
      tabId,
      (snapshot) => {
        source = snapshot.source ?? "whatsapp";
        toggle.disabled = false;
        status.textContent = describeSnapshot(snapshot);
        count.textContent = String(snapshot.messages.length);
        renderLatestRisk(latestRisk, snapshot);
        toggle.checked = snapshot.enabled;
        openDebug.disabled = false;
      },
      () => {
        status.textContent =
          "Reload the supported message tab, then open VerdictAI again.";
        count.textContent = "0";
        renderLatestRisk(latestRisk);
        openDebug.disabled = true;
      },
    );
  } catch {
    error.textContent =
      "VerdictAI could not connect. Reopen the popup to try again.";
  }
}
void initialize();
