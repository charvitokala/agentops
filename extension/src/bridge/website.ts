import "../shared/chrome.ts";
import {
  EXTENSION_CASE_PATTERN,
  HANDOFF_CHANNEL,
  isExtensionCase,
} from "../shared/handoff.ts";
import type { ExtensionCase } from "../shared/handoff.ts";
import { WEBSITE_ORIGIN } from "../shared/website-config.ts";

export function installWebsiteBridge(
  window: Window,
  origin: string,
  claim: (caseId: string) => Promise<unknown>,
): () => void {
  const caseId = window.location.pathname.match(
    /^\/investigation\/([^/]+)$/,
  )?.[1];
  if (
    window.location.origin !== origin ||
    window !== window.top ||
    !caseId ||
    !EXTENSION_CASE_PATTERN.test(caseId) ||
    window.location.search ||
    window.location.hash
  )
    return () => {};
  let busy = false;
  let cached: ExtensionCase | null = null;
  let stopped = false;
  let activeNonce: string | null = null;
  const listener = async (event: MessageEvent) => {
    if (
      stopped ||
      event.source !== window ||
      event.origin !== origin ||
      !event.data ||
      event.data.channel !== HANDOFF_CHANNEL ||
      event.data.caseId !== caseId ||
      typeof event.data.nonce !== "string" ||
      !/^[a-f0-9-]{36}$/.test(event.data.nonce)
    )
      return;
    if (event.data.type === "CASE_STORED" && event.data.nonce === activeNonce) {
      cleanup();
      return;
    }
    if (event.data.type !== "CASE_READY" || busy) return;
    const nonce: string = event.data.nonce;
    activeNonce = nonce;
    busy = true;
    try {
      if (!cached) {
        const response = (await claim(caseId)) as {
          status?: string;
          payload?: unknown;
        };
        if (stopped) return;
        if (
          response?.status !== "delivered" ||
          !isExtensionCase(response.payload, { caseId, origin })
        )
          return;
        cached = response.payload;
      }
      if (!stopped)
        window.postMessage(
          {
            channel: HANDOFF_CHANNEL,
            type: "CASE_DELIVERY",
            caseId,
            nonce,
            payload: cached,
          },
          origin,
        );
    } catch {
      /* Missing/reloaded extension: website shows an unavailable state. */
    } finally {
      busy = false;
    }
  };
  function cleanup() {
    stopped = true;
    cached = null;
    window.removeEventListener("message", listener);
    window.removeEventListener("pagehide", cleanup);
    window.clearTimeout(expiry);
  }
  const expiry = window.setTimeout(cleanup, 120_000);
  window.addEventListener("message", listener);
  window.addEventListener("pagehide", cleanup);
  return cleanup;
}

if (typeof window !== "undefined" && typeof chrome !== "undefined")
  installWebsiteBridge(window, WEBSITE_ORIGIN, (caseId) =>
    chrome.runtime.sendMessage({ type: "VERDICTAI_CLAIM_CASE", caseId }),
  );
