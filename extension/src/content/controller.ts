import "../shared/chrome.ts";
import type { ChromePort, StorageChange } from "../shared/chrome.ts";
import {
  GMAIL_MONITORING_KEY,
  MONITORING_KEY,
  PORT_NAME,
} from "../shared/contracts.ts";
import { ConversationMonitor } from "./monitor.ts";
import { AssessmentPipeline } from "./assessment-pipeline.ts";
import { InlineNotes } from "./inline-notes.ts";
import {
  GmailReader,
  GMAIL_SELECTORS,
  locateGmailRoot,
} from "./gmail-reader.ts";

/** Connects Chrome preference events to a reader. Chat data never enters storage. */
export function startContentController(
  document: Document,
  options: {
    activationAllowed?: (event: MouseEvent) => boolean;
    onDiagnostic?: (code: string) => void;
    source?: "gmail";
  } = {},
): () => void {
  const ports = new Set<ChromePort>();
  let preferenceRevision = 0;
  let disposed = false;
  const monitoringKey =
    options.source === "gmail" ? GMAIL_MONITORING_KEY : MONITORING_KEY;
  const assessments = new AssessmentPipeline();
  async function openSelectedInvestigation(id: string): Promise<void> {
    const snapshot = assessments.reconcile(monitor.refresh());
    const selected = monitor.resolveMessage(id);
    const assessment = snapshot.assessments.find(
      (item) => item.messageId === id,
    );
    if (
      !snapshot.enabled ||
      !selected ||
      !assessment ||
      selected.message.direction !== "incoming" ||
      !["high", "medium"].includes(assessment.riskLevel)
    )
      throw new Error("Selection unavailable.");
    const response = (await chrome.runtime.sendMessage({
      type: "VERDICTAI_OPEN_CASE",
      message: selected.message,
      assessment,
    })) as { status?: string };
    if (response?.status !== "opened")
      throw new Error("Investigation unavailable.");
  }
  const notes =
    options.source === "gmail"
      ? null
      : new InlineNotes({
          onDiagnostic:
            options.onDiagnostic ??
            ((code) => console.debug("[VerdictAI]", code)),
          activationAllowed: options.activationAllowed,
          onMoreInfo: openSelectedInvestigation,
        });
  const monitor = new ConversationMonitor({
    document,
    ...(options.source === "gmail"
      ? {
          source: "gmail" as const,
          reader: new GmailReader(),
          locateRoot: locateGmailRoot,
          rootSelector: GMAIL_SELECTORS.root,
          excludedSelector: GMAIL_SELECTORS.excluded,
          extraAttributes: [
            "href",
            "email",
            "data-message-id",
            "data-legacy-message-id",
          ],
        }
      : {}),
    onInvalidate: () => notes?.pruneStale((id) => monitor.resolveMessage(id)),
    onReconcile: (snapshot) =>
      notes?.reconcile(assessments.reconcile(snapshot), (id) =>
        monitor.resolveMessage(id),
      ),
    onChange: (snapshot) => {
      const assessed = assessments.reconcile(snapshot);
      notes?.reconcile(assessed, (id) => monitor.resolveMessage(id));
      for (const port of ports) {
        try {
          port.postMessage(assessed);
        } catch {
          ports.delete(port);
        }
      }
    },
  });

  const onConnect = (port: ChromePort) => {
    if (
      port.name !== PORT_NAME ||
      port.sender?.id !== chrome.runtime.id ||
      !port.sender.url?.startsWith(chrome.runtime.getURL(""))
    )
      return;
    ports.add(port);
    try {
      port.postMessage(assessments.reconcile(monitor.getSnapshot()));
    } catch {
      ports.delete(port);
    }
    port.onDisconnect.addListener(() => {
      ports.delete(port);
    });
  };
  const onPreferenceChanged = (
    changes: Record<string, StorageChange>,
    areaName: string,
  ) => {
    if (areaName !== "local" || !(monitoringKey in changes)) return;
    preferenceRevision++;
    monitor.setEnabled(changes[monitoringKey].newValue === true);
  };
  const onMessage = (
    request: unknown,
    sender: { id?: string; url?: string },
    respond: (message: unknown) => void,
  ): true | void => {
    if (!request || typeof request !== "object") return;
    const data = request as Record<string, unknown>;
    if (data.type !== "VERDICTAI_OPEN_SELECTED_MESSAGE") return;
    if (
      sender.id !== chrome.runtime.id ||
      !sender.url?.startsWith(chrome.runtime.getURL("")) ||
      typeof data.messageId !== "string" ||
      data.messageId.length > 4096
    ) {
      respond({ status: "rejected" });
      return;
    }
    void openSelectedInvestigation(data.messageId).then(
      () => respond({ status: "opened" }),
      () => respond({ status: "unavailable" }),
    );
    return true;
  };
  const synchronizePreference = async () => {
    const revision = preferenceRevision;
    try {
      const settings = await chrome.storage.local.get(monitoringKey);
      if (!disposed && revision === preferenceRevision)
        monitor.setEnabled(settings[monitoringKey] === true);
    } catch {
      if (!disposed) monitor.setEnabled(false);
    }
  };
  const onPageHide = () => {
    preferenceRevision++;
    monitor.setEnabled(false);
  };
  const onPageShow = () => {
    void synchronizePreference();
  };
  chrome.runtime.onConnect.addListener(onConnect);
  chrome.runtime.onMessage.addListener(onMessage);
  chrome.storage.onChanged.addListener(onPreferenceChanged);
  document.defaultView?.addEventListener("pagehide", onPageHide);
  document.defaultView?.addEventListener("pageshow", onPageShow);
  void synchronizePreference();

  return () => {
    disposed = true;
    monitor.dispose();
    notes?.clear();
    chrome.runtime.onConnect.removeListener(onConnect);
    chrome.runtime.onMessage.removeListener(onMessage);
    chrome.storage.onChanged.removeListener(onPreferenceChanged);
    document.defaultView?.removeEventListener("pagehide", onPageHide);
    document.defaultView?.removeEventListener("pageshow", onPageShow);
    for (const port of ports) {
      try {
        port.disconnect();
      } catch {
        /* Already disconnected. */
      }
    }
    ports.clear();
  };
}
