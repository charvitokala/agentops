import {
  connectToReader,
  getMonitoringPreference,
  setMonitoringPreference,
} from "./client.ts";
import { describeSnapshot, element, renderMessages } from "./view.ts";

const toggle = element<HTMLInputElement>("monitoring");
const status = element("status");
const count = element("count");
const messages = element("messages");
const empty = element("empty");
const error = element("error");
let disconnect = () => {};

toggle.addEventListener("change", async () => {
  toggle.disabled = true;
  error.textContent = "";
  try {
    await setMonitoringPreference(toggle.checked);
  } catch {
    toggle.checked = !toggle.checked;
    error.textContent = "The monitoring preference could not be saved.";
  } finally {
    toggle.disabled = false;
  }
});
window.addEventListener(
  "pagehide",
  () => {
    disconnect();
    messages.replaceChildren();
  },
  { once: true },
);

async function initialize() {
  try {
    toggle.checked = await getMonitoringPreference();
    toggle.disabled = false;
    const raw = new URLSearchParams(location.hash.slice(1)).get("tab");
    const tabId = Number(raw);
    if (!raw || !Number.isSafeInteger(tabId) || tabId < 0) {
      status.textContent = "No source tab selected";
      empty.textContent =
        "Open VerdictAI from the WhatsApp Web tab and select Open debugging view.";
      return;
    }
    disconnect = connectToReader(
      tabId,
      (snapshot) => {
        status.textContent = describeSnapshot(snapshot);
        toggle.checked = snapshot.enabled;
        count.textContent = String(snapshot.messages.length);
        renderMessages(messages, snapshot);
        empty.hidden = snapshot.messages.length > 0;
        empty.textContent = !snapshot.enabled
          ? "Monitoring is off. Transient message data has been cleared."
          : snapshot.status === "unsupported_layout"
            ? "This WhatsApp layout does not match the current DOM selectors. No message content is being extracted. See the extension README."
            : "No rendered text messages are available. Open a conversation in the source WhatsApp tab. Media-only messages are excluded.";
      },
      () => {
        status.textContent = "Source tab unavailable";
        count.textContent = "0";
        messages.replaceChildren();
        empty.hidden = false;
        empty.textContent =
          "The source tab may have closed or reloaded. Open VerdictAI from WhatsApp Web again to reconnect.";
      },
    );
  } catch {
    error.textContent =
      "Could not connect to the local reader. Open VerdictAI from WhatsApp Web again.";
  }
}
void initialize();
