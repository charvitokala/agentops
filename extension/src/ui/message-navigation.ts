import type { ExtractedMessage } from "../shared/contracts.ts";
import { messagePreview } from "./message-summary.ts";

/** Presentation only. Scrolling changes selection without requesting or analyzing data. */
export class MessageNavigation {
  private items = new Map<string, HTMLButtonElement>();
  private targets = new Map<string, HTMLElement>();
  private observed = new Set<HTMLElement>();
  private active: string | null = null;
  private readonly observer: IntersectionObserver | null;
  private readonly nav: HTMLElement;
  private readonly messages: HTMLElement;

  constructor(nav: HTMLElement, messages: HTMLElement) {
    this.nav = nav;
    this.messages = messages;
    const window = nav.ownerDocument.defaultView;
    this.observer = window?.IntersectionObserver
      ? new window.IntersectionObserver(
          (entries) => {
            const visible = entries
              .filter((entry) => entry.isIntersecting)
              .sort(
                (a, b) => a.boundingClientRect.top - b.boundingClientRect.top,
              );
            if (visible[0])
              this.select(
                (visible[0].target as HTMLElement).dataset.messageId ?? null,
              );
          },
          { rootMargin: "-5% 0px -50% 0px", threshold: 0 },
        )
      : null;
  }

  update(messages: ExtractedMessage[]): void {
    const next = new Set<string>();
    const targets = new Map(
      [...this.messages.children].map((node) => [
        (node as HTMLElement).dataset.messageId,
        node as HTMLElement,
      ]),
    );
    let position = 0;
    for (const message of messages) {
      const target = targets.get(message.id);
      if (!target || next.has(message.id)) continue;
      next.add(message.id);
      this.targets.set(message.id, target);
      let button = this.items.get(message.id);
      if (!button) {
        button = this.nav.ownerDocument.createElement("button");
        button.className = "message-nav-item";
        button.type = "button";
        button.addEventListener("click", () => {
          this.select(message.id);
          const reduced = this.nav.ownerDocument.defaultView?.matchMedia?.(
            "(prefers-reduced-motion: reduce)",
          ).matches;
          this.targets.get(message.id)?.scrollIntoView({
            behavior: reduced ? "auto" : "smooth",
            block: "start",
          });
        });
        this.items.set(message.id, button);
      }
      const preview = messagePreview(message);
      if (button.textContent !== preview) button.textContent = preview;
      button.setAttribute("aria-controls", target.id);
      if (this.nav.children[position] !== button)
        this.nav.insertBefore(button, this.nav.children[position] ?? null);
      position++;
    }
    for (const [id, item] of this.items)
      if (!next.has(id)) {
        item.remove();
        this.items.delete(id);
        this.targets.delete(id);
      }
    const currentTargets = new Set(this.targets.values());
    for (const old of this.observed)
      if (!currentTargets.has(old)) this.observer?.unobserve(old);
    for (const target of currentTargets)
      if (!this.observed.has(target)) this.observer?.observe(target);
    this.observed = currentTargets;
    this.select(
      this.active && next.has(this.active)
        ? this.active
        : (next.values().next().value ?? null),
    );
    const wrapper = this.nav.closest<HTMLElement>(".message-navigation");
    if (wrapper) wrapper.hidden = next.size === 0;
  }

  clear(): void {
    this.observer?.disconnect();
    this.items.clear();
    this.targets.clear();
    this.observed.clear();
    this.nav.replaceChildren();
    this.active = null;
    const wrapper = this.nav.closest<HTMLElement>(".message-navigation");
    if (wrapper) wrapper.hidden = true;
  }

  private select(id: string | null): void {
    this.active = id;
    for (const [key, button] of this.items) {
      if (key === id) button.setAttribute("aria-current", "true");
      else button.removeAttribute("aria-current");
    }
  }
}
