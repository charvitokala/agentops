import type {
  ActiveConversation,
  ExtractedMessage,
} from "../shared/contracts.ts";
import { SELECTORS } from "./selectors.ts";

function createVisibilityCheck(): (element: Element) => boolean {
  // Per-scan cache avoids repeating computed-style work for shared ancestors.
  const cache = new WeakMap<Element, boolean>();
  function check(element: Element): boolean {
    const known = cache.get(element);
    if (known !== undefined) return known;
    if (
      !element.isConnected ||
      element.hasAttribute("hidden") ||
      element.getAttribute("aria-hidden") === "true"
    ) {
      cache.set(element, false);
      return false;
    }
    const style = element.ownerDocument.defaultView?.getComputedStyle(element);
    const visible =
      style?.display !== "none" &&
      style?.visibility !== "hidden" &&
      style?.visibility !== "collapse" &&
      style?.opacity !== "0" &&
      (!element.parentElement || check(element.parentElement));
    cache.set(element, visible);
    return visible;
  }
  return check;
}

export function isRendered(element: Element): boolean {
  return createVisibilityCheck()(element);
}

export function locateConversationRoot(document: Document): Element | null {
  return (
    [...document.querySelectorAll(SELECTORS.conversationRoot)].find(
      createVisibilityCheck(),
    ) ?? null
  );
}

function fingerprint(value: string): string {
  let hash = 2166136261;
  for (const character of value)
    hash = Math.imul(hash ^ character.codePointAt(0)!, 16777619);
  return (hash >>> 0).toString(36);
}

function conversationInfo(
  root: Element,
  scope: string,
  rendered: (element: Element) => boolean,
): ActiveConversation | null {
  for (const selector of SELECTORS.conversationTitle) {
    const title = [...root.querySelectorAll(selector)].find(rendered);
    const label = (
      title?.getAttribute("title") ||
      title?.textContent ||
      ""
    ).trim();
    if (!label) continue;
    const domId = root.getAttribute("data-chat-id");
    return {
      id: `${scope}:conversation:${fingerprint(domId || label)}`,
      label,
      identitySource: domId ? "dom_attribute" : "header_label",
    };
  }
  return null;
}

function visibleText(
  node: Node,
  rendered: (element: Element) => boolean,
): string {
  if (node.nodeType === 3) return node.textContent ?? "";
  if (node.nodeType !== 1) return "";
  const element = node as Element;
  if (element.matches(SELECTORS.excluded) || !rendered(element)) return "";
  if (element.tagName === "BR") return "\n";
  if (element.tagName === "IMG") return element.getAttribute("alt") ?? "";
  if (["SCRIPT", "STYLE", "BUTTON", "SVG"].includes(element.tagName)) return "";
  let text = "";
  for (const child of element.childNodes) {
    if (
      child.nodeType === 1 &&
      /^(DIV|P|LI)$/.test((child as Element).tagName) &&
      text &&
      !text.endsWith("\n")
    )
      text += "\n";
    text += visibleText(child, rendered);
  }
  return /^(DIV|P|LI)$/.test(element.tagName) ? `${text}\n` : text;
}

function trimUrl(value: string): string {
  let url = value.replace(/[.,;!?:]+$/, "");
  for (const [open, close] of [
    ["(", ")"],
    ["[", "]"],
    ["{", "}"],
  ]) {
    while (
      url.endsWith(close) &&
      url.split(close).length > url.split(open).length
    )
      url = url.slice(0, -1);
  }
  return url;
}

export function extractUrls(text: string, hrefs: string[] = []): string[] {
  const candidates =
    text.match(
      /(?<![\w@])(?:https?:\/\/|www\.)[^\s<>"\u200b]+|(?<![\w@])(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,63}(?::\d{2,5})?(?:\/[^\s<>"\u200b]*)?/gi,
    ) ?? [];
  const urls = new Set<string>();
  for (const candidate of [...candidates, ...hrefs]) {
    const value = trimUrl(candidate);
    try {
      const url = new URL(
        /^https?:\/\//i.test(value) ? value : `https://${value}`,
      );
      if (
        ["http:", "https:"].includes(url.protocol) &&
        !/^(?:javascript|data|mailto|tel):/i.test(value)
      )
        urls.add(url.href);
    } catch {
      /* Malformed addresses are ignored; no URL is ever requested. */
    }
  }
  return [...urls];
}

export interface ReaderResult {
  status: "waiting_for_conversation" | "unsupported_layout" | "ready";
  conversation: ActiveConversation | null;
  messages: ExtractedMessage[];
}

export interface RenderedMessageBinding {
  bubble: Element;
  root: Element;
  conversationId: string;
  domId: string | null | undefined;
  message: ExtractedMessage;
}

function bubbleData(bubble: Element, rendered: (element: Element) => boolean) {
  const parts = [...bubble.querySelectorAll(SELECTORS.messageText)].filter(
    (element) =>
      !element.closest(SELECTORS.excluded) &&
      !element.parentElement?.closest(SELECTORS.messageText) &&
      rendered(element),
  );
  const text = parts
    .map((part) => visibleText(part, rendered))
    .map((part) => part.replace(/\r\n?/g, "\n").trim())
    .filter(Boolean)
    .join("\n");
  const directionElement = bubble.matches(".message-in, .message-out")
    ? bubble
    : bubble.querySelector(".message-in, .message-out");
  const direction: ExtractedMessage["direction"] = directionElement?.matches(
    ".message-in",
  )
    ? "incoming"
    : directionElement?.matches(".message-out")
      ? "outgoing"
      : "unknown";
  const domId =
    bubble.getAttribute("data-id") ||
    bubble.querySelector("[data-id]")?.getAttribute("data-id");
  const hrefs = parts.flatMap((part) =>
    [...part.querySelectorAll("a[href]")]
      .map((anchor) => anchor.getAttribute("href") ?? "")
      .filter((href) => /^https?:\/\//i.test(href)),
  );
  return { text, direction, urls: extractUrls(text, hrefs), domId };
}

export class WhatsAppReader {
  private previous = new Map<string, ExtractedMessage>();
  private conversationId: string | null = null;
  private readonly scope: string;
  private bindings = new Map<string, RenderedMessageBinding>();

  constructor(scope = globalThis.crypto.randomUUID()) {
    this.scope = scope;
  }

  reset(): void {
    this.previous.clear();
    this.conversationId = null;
    this.bindings.clear();
  }

  resolveMessage(id: string): RenderedMessageBinding | null {
    const binding = this.bindings.get(id);
    if (
      !binding ||
      !binding.bubble.isConnected ||
      !binding.root.contains(binding.bubble)
    )
      return null;
    const rendered = createVisibilityCheck();
    if (
      !rendered(binding.bubble) ||
      conversationInfo(binding.root, this.scope, rendered)?.id !==
        binding.conversationId
    )
      return null;
    const current = bubbleData(binding.bubble, rendered);
    if (
      current.domId !== binding.domId ||
      current.text !== binding.message.text ||
      current.direction !== binding.message.direction ||
      JSON.stringify(current.urls) !== JSON.stringify(binding.message.urls)
    )
      return null;
    return binding;
  }

  read(
    root: Element | null,
    observedAt = new Date().toISOString(),
  ): ReaderResult {
    const rendered = createVisibilityCheck();
    this.bindings.clear();
    if (!root || !rendered(root)) {
      this.reset();
      return {
        status: "waiting_for_conversation",
        conversation: null,
        messages: [],
      };
    }
    const conversation = conversationInfo(root, this.scope, rendered);
    if (!conversation) {
      this.reset();
      return { status: "unsupported_layout", conversation: null, messages: [] };
    }
    if (conversation.id !== this.conversationId) this.previous.clear();
    this.conversationId = conversation.id;
    const container =
      SELECTORS.messageContainers
        .map((selector) => [...root.querySelectorAll(selector)].find(rendered))
        .find(Boolean) ?? (root.querySelector(SELECTORS.message) ? root : null);
    if (!container) {
      this.previous.clear();
      return { status: "unsupported_layout", conversation, messages: [] };
    }
    const messages = new Map<string, ExtractedMessage>();
    const occurrences = new Map<string, number>();
    for (const bubble of container.querySelectorAll(SELECTORS.message)) {
      if (!rendered(bubble) || bubble.closest(SELECTORS.excluded)) continue;
      const parentBubble = bubble.parentElement?.closest(SELECTORS.message);
      if (parentBubble && container.contains(parentBubble)) continue;
      const { text, direction, urls, domId } = bubbleData(bubble, rendered);
      if (!text) continue;
      const fallback = fingerprint(`${direction}\0${text}`);
      const ordinal = (occurrences.get(fallback) ?? 0) + 1;
      occurrences.set(fallback, ordinal);
      const id = `${conversation.id}:${domId ? `dom:${domId}` : `fallback:${fallback}:${ordinal}`}`;
      if (messages.has(id)) {
        this.bindings.delete(id);
        continue;
      }
      const message: ExtractedMessage = {
        id,
        text,
        urls,
        direction,
        observedAt: this.previous.get(id)?.observedAt ?? observedAt,
      };
      messages.set(id, message);
      this.bindings.set(id, {
        bubble,
        root,
        conversationId: conversation.id,
        domId,
        message,
      });
    }
    // Retain only the current DOM window, never an accumulated conversation history.
    this.previous = messages;
    return { status: "ready", conversation, messages: [...messages.values()] };
  }
}
