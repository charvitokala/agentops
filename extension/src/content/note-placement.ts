import { SELECTORS } from "./selectors.ts";
import { isRendered } from "./whatsapp-reader.ts";
import type { RenderedMessageBinding } from "./whatsapp-reader.ts";

export interface NotePlacement {
  container: Element;
  after: Element | null;
}

function verticalFlow(element: Element): boolean {
  const style = element.ownerDocument.defaultView?.getComputedStyle(element);
  return (
    !style ||
    !style.display ||
    ["block", "flow-root", "inline-block", "list-item", "table-cell"].includes(
      style.display,
    ) ||
    (style.display.includes("flex") && style.flexDirection.startsWith("column"))
  );
}

function inFlow(element: Element): boolean {
  return !["absolute", "fixed"].includes(
    element.ownerDocument.defaultView?.getComputedStyle(element).position ?? "",
  );
}

/** Keep normal-flow siblings where possible; virtualized/flex rows need an in-message slot. */
export function findNotePlacement(
  binding: RenderedMessageBinding,
): NotePlacement | null {
  const bubble = binding.bubble;
  const parent = bubble.parentElement;
  if (!parent || !bubble.isConnected || !binding.root.contains(bubble))
    return null;
  if (inFlow(bubble) && verticalFlow(parent))
    return { container: parent, after: bubble };

  const row = bubble.closest('[role="row"]');
  if (
    row &&
    row !== binding.root &&
    binding.root.contains(row) &&
    inFlow(bubble) &&
    inFlow(row) &&
    row.parentElement &&
    verticalFlow(row.parentElement)
  ) {
    const messages = [...row.querySelectorAll(SELECTORS.message)].filter(
      (node) => {
        const ancestor = node.parentElement?.closest(SELECTORS.message);
        return !ancestor || !row.contains(ancestor);
      },
    );
    if (messages.length === 1 && messages[0] === bubble)
      return { container: row.parentElement, after: row };
  }

  // Position:absolute and a horizontal parent do not make the bubble's own
  // vertical content unsafe. Append inside its existing single-message wrapper
  // so WhatsApp's row retains ownership/height of the note. Never move source nodes.
  if (verticalFlow(bubble)) return { container: bubble, after: null };

  const textParts = [...bubble.querySelectorAll(SELECTORS.messageText)].filter(
    (part) => !part.closest(SELECTORS.excluded) && isRendered(part),
  );
  const candidates: Element[] = [];
  for (
    let current = textParts[0]?.parentElement;
    current && bubble.contains(current) && current !== bubble;
    current = current.parentElement
  )
    candidates.unshift(current);
  for (const candidate of candidates) {
    if (
      !["DIV", "SECTION", "ARTICLE"].includes(candidate.tagName) ||
      candidate.matches(SELECTORS.messageText) ||
      candidate.closest(SELECTORS.excluded) ||
      !verticalFlow(candidate)
    )
      continue;
    if (textParts.every((part) => candidate.contains(part)))
      return { container: candidate, after: null };
  }
  // No safe single-message slot: do not guess elsewhere in the conversation.
  return null;
}

export function samePlacement(
  left: NotePlacement,
  right: NotePlacement,
): boolean {
  return left.container === right.container && left.after === right.after;
}

export function noteIsAttached(
  host: HTMLElement,
  placement: NotePlacement,
): boolean {
  return (
    host.isConnected &&
    host.parentElement === placement.container &&
    (placement.after
      ? host.previousElementSibling === placement.after
      : placement.container.lastElementChild === host)
  );
}
