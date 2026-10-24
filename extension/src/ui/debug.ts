import {
  connectToReader,
  setMonitoringPreference,
  openSelectedInvestigation,
} from "./client.ts";
import { describeSnapshot, element, renderMessages } from "./view.ts";
import { MessageNavigation } from "./message-navigation.ts";
import { newestFirst } from "./message-order.ts";

const toggle = element<HTMLInputElement>("monitoring");
const status = element("status");
const count = element("count");
const messages = element("messages");
const empty = element("empty");
const error = element("error");
const navigation = new MessageNavigation(
  element("message-navigation"),
  messages,
);
let disconnect = () => {};
let source = "whatsapp";

toggle.addEventListener("change", async () => {
  toggle.disabled = true;
  error.textContent = "";
  try {
    await setMonitoringPreference(toggle.checked, source);
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
    navigation.clear();
  },
  { once: true },
);

async function initialize() {
  try {
    const raw = new URLSearchParams(location.hash.slice(1)).get("tab");
    const tabId = Number(raw);
    if (!raw || !Number.isSafeInteger(tabId) || tabId < 0) {
      status.textContent = "No source tab selected";
      empty.textContent =
        'Open VerdictAI from the WhatsApp Web tab and select "Click for More Info".';
      return;
    }
    disconnect = connectToReader(
      tabId,
      (snapshot) => {
        source = snapshot.source ?? "whatsapp";
        toggle.disabled = false;
        status.textContent = describeSnapshot(snapshot);
        toggle.checked = snapshot.enabled;
        count.textContent = String(snapshot.messages.length);
        const ordered = newestFirst(snapshot.messages);
        renderMessages(
          messages,
          { ...snapshot, messages: ordered },
          (messageId) => openSelectedInvestigation(tabId, messageId),
        );
        navigation.update(ordered);
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
        navigation.clear();
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
