import type { ExtractedMessage } from "../shared/contracts.ts";
import { createVisibilityCheck, extractUrls } from "./whatsapp-reader.ts";
import type { ReaderResult } from "./whatsapp-reader.ts";

// Gmail's DOM is not an API. Keep the small set of supported selectors together.
export const GMAIL_SELECTORS = {
  root: '[role="main"]',
  subject: "h2.hP, h2[data-thread-perm-id]",
  body: ".a3s",
  message: "[data-message-id], [data-legacy-message-id], .adn",
  sender: ".gD[email]",
  excluded:
    '[contenteditable="true"], [role="textbox"], script, style, button, svg',
};

export function locateGmailRoot(document: Document): Element | null {
  return (
    [...document.querySelectorAll(GMAIL_SELECTORS.root)].find(
      createVisibilityCheck(),
    ) ?? null
  );
}

function bodyText(node: Node, visible: (element: Element) => boolean): string {
  if (node.nodeType === 3) return node.textContent ?? "";
  if (node.nodeType !== 1) return "";
  const element = node as Element;
  if (!visible(element) || element.matches(GMAIL_SELECTORS.excluded)) return "";
  if (element.tagName === "BR") return "\n";
  if (element.tagName === "IMG") return element.getAttribute("alt") ?? "";
  const text = [...element.childNodes]
    .map((child) => bodyText(child, visible))
    .join("");
  return /^(DIV|P|LI|TR|H[1-6])$/.test(element.tagName) ? `\n${text}\n` : text;
}

/** Reads only the last visible expanded email in the open thread, never inbox rows. */
export class GmailReader {
  private readonly scope = globalThis.crypto.randomUUID();
  private previous: ExtractedMessage | null = null;
  private fallbacks = new WeakMap<Element, number>();
  private nextFallback = 0;

  reset(): void {
    this.previous = null;
    this.fallbacks = new WeakMap();
  }

  // Gmail-to-Courtroom handoff and inline email notes are outside this minimal integration.
  resolveMessage(): null {
    return null;
  }

  read(
    root: Element | null,
    observedAt = new Date().toISOString(),
  ): ReaderResult {
    const visible = createVisibilityCheck();
    const waiting: ReaderResult = {
      status: "waiting_for_conversation",
      conversation: null,
      messages: [],
    };
    if (!root || !visible(root)) {
      this.reset();
      return waiting;
    }
    const subjectElement = [
      ...root.querySelectorAll(GMAIL_SELECTORS.subject),
    ].find(visible);
    const body = [...root.querySelectorAll(GMAIL_SELECTORS.body)]
      .filter(
        (element) =>
          visible(element) && !element.closest(GMAIL_SELECTORS.excluded),
      )
      .at(-1);
    if (!subjectElement || !body) {
      this.reset();
      return waiting;
    }
    const owner = body.closest(GMAIL_SELECTORS.message);
    if (!owner || !root.contains(owner)) {
      this.reset();
      return { ...waiting, status: "unsupported_layout" };
    }
    const subject = subjectElement.textContent?.trim() ?? "";
    const senderElement = [
      ...owner.querySelectorAll(GMAIL_SELECTORS.sender),
    ].find(visible);
    const address = senderElement?.getAttribute("email")?.trim() ?? "";
    const name = senderElement?.textContent?.trim() ?? "";
    const sender =
      name && name !== address ? `${name} <${address}>` : address || name;
    const text = bodyText(body, visible)
      .replace(/\n[\t ]+/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
    if (!text && !subject) {
      this.reset();
      return waiting;
    }
    const nativeId =
      owner.getAttribute("data-message-id") ||
      owner.getAttribute("data-legacy-message-id");
    if (!this.fallbacks.has(owner))
      this.fallbacks.set(owner, ++this.nextFallback);
    const thread =
      subjectElement.getAttribute("data-thread-perm-id") ||
      root.ownerDocument.location.hash;
    const conversation = {
      id: `gmail:${this.scope}:thread:${thread || subject}`,
      label: subject || "Open email",
      identitySource: "dom_attribute" as const,
    };
    const id = `${conversation.id}:message:${nativeId || `fallback:${this.fallbacks.get(owner)}`}`;
    const hrefs = [...body.querySelectorAll("a[href]")]
      .filter(
        (anchor) =>
          visible(anchor) && !anchor.closest(GMAIL_SELECTORS.excluded),
      )
      .map((anchor) => anchor.getAttribute("href") ?? "")
      .filter((href) => /^https?:\/\//i.test(href));
    const message: ExtractedMessage = {
      id,
      // Subject and body are analyzed together; sender identity is never treated as verified.
      text: subject ? `Subject: ${subject}\n\n${text}` : text,
      urls: extractUrls(text, hrefs),
      direction: "unknown",
      observedAt:
        this.previous?.id === id ? this.previous.observedAt : observedAt,
      email: { sender: sender || "Sender unavailable", subject },
    };
    this.previous = message;
    return { status: "ready", conversation, messages: [message] };
  }
}
