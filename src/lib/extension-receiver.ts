import {
  HANDOFF_CHANNEL,
  EXTENSION_CASE_PATTERN,
  isExtensionCase,
} from "../../extension/src/shared/handoff.ts";
import type { ExtensionCase } from "../../extension/src/shared/handoff.ts";
import { saveExtensionCase } from "./extension-cases.ts";

export function receiveExtensionCase(
  window: Window,
  caseId: string,
  onCase: (payload: ExtensionCase) => void,
  onUnavailable: (message: string) => void,
  timeoutMs = 10_000,
): () => void {
  const origin = window.location.origin;
  if (
    !EXTENSION_CASE_PATTERN.test(caseId) ||
    window.location.pathname !== `/investigation/${caseId}` ||
    window !== window.top
  ) {
    onUnavailable("This extension investigation is not available in this tab.");
    return () => {};
  }
  const nonce = window.crypto.randomUUID();
  let stopped = false;
  function cleanup() {
    stopped = true;
    window.removeEventListener("message", listener);
    window.clearInterval(retry);
    window.clearTimeout(timeout);
  }
  function listener(event: MessageEvent) {
    if (
      stopped ||
      event.source !== window ||
      event.origin !== origin ||
      event.data?.channel !== HANDOFF_CHANNEL ||
      event.data.type !== "CASE_DELIVERY" ||
      event.data.caseId !== caseId ||
      event.data.nonce !== nonce
    )
      return;
    if (!isExtensionCase(event.data.payload, { caseId, origin })) return;
    try {
      const payload = saveExtensionCase(
        window.sessionStorage,
        event.data.payload,
        caseId,
        origin,
      );
      cleanup();
      window.postMessage(
        { channel: HANDOFF_CHANNEL, type: "CASE_STORED", caseId, nonce },
        origin,
      );
      onCase(payload);
    } catch {
      cleanup();
      onUnavailable(
        "This browser could not save the selected case in this tab. Return to WhatsApp and try More Info again.",
      );
    }
  }
  const ready = () =>
    window.postMessage(
      { channel: HANDOFF_CHANNEL, type: "CASE_READY", caseId, nonce },
      origin,
    );
  window.addEventListener("message", listener);
  const retry = window.setInterval(ready, 400);
  const timeout = window.setTimeout(() => {
    cleanup();
    onUnavailable(
      "The extension handoff is unavailable or expired. Return to WhatsApp and click More Info again. Reload the extension and WhatsApp Web if needed.",
    );
  }, timeoutMs);
  ready();
  return cleanup;
}
