import "../shared/chrome.ts";
import { WEBSITE_ORIGIN } from "../shared/website-config.ts";
import { createHandoffBroker, EXPIRY_ALARM } from "./broker.ts";

const broker = createHandoffBroker({
  origin: WEBSITE_ORIGIN,
  extensionId: chrome.runtime.id,
  storage: {
    getAll: () => chrome.storage.session.get(null),
    set: (items) => chrome.storage.session.set(items),
    remove: (keys) => chrome.storage.session.remove(keys),
  },
  openTab: (url) => chrome.tabs.create({ url }),
  scheduleExpiry: async (when) => {
    if (when === null) await chrome.alarms.clear(EXPIRY_ALARM);
    else await chrome.alarms.create(EXPIRY_ALARM, { when });
  },
});
chrome.runtime.onMessage.addListener((request, sender, respond) => {
  void broker
    .handle(request, sender)
    .then(respond, () => respond({ status: "unavailable" }));
  return true;
});
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === EXPIRY_ALARM) void broker.cleanup().catch(() => {});
});
chrome.tabs.onRemoved.addListener((tabId) => {
  void broker.cleanup(tabId).catch(() => {});
});
void broker.cleanup().catch(() => {});
