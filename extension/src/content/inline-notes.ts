import type { AssessedSnapshot } from "./assessment-pipeline.ts";
import type { RenderedMessageBinding } from "./whatsapp-reader.ts";
import { NOTE_ATTRIBUTE } from "./ownership.ts";
import { SELECTORS } from "./selectors.ts";

export type InlineDiagnostic =
  | "unreliable-message-binding"
  | "unsupported-message-layout"
  | "unknown-message-direction"
  | "stale-selection";
interface InlineOptions {
  onMoreInfo: (id: string) => Promise<void>;
  onDiagnostic?: (code: InlineDiagnostic) => void;
  activationAllowed?: (event: MouseEvent) => boolean;
}
interface Note {
  host: HTMLElement;
  anchor: Element;
  bubble: Element;
  signature: string;
}

function safeParent(element: Element): boolean {
  const style = element.ownerDocument.defaultView?.getComputedStyle(element);
  return (
    !style ||
    !style.display ||
    ["block", "flow-root", "list-item", "table-cell"].includes(style.display) ||
    (style.display === "flex" && style.flexDirection.startsWith("column"))
  );
}

export class InlineNotes {
  private readonly notes = new Map<string, Note>();
  private readonly reported = new Set<InlineDiagnostic>();
  private readonly options: InlineOptions;
  constructor(options: InlineOptions) {
    this.options = options;
  }
  private diagnostic(code: InlineDiagnostic) {
    if (this.reported.has(code)) return;
    this.reported.add(code);
    this.options.onDiagnostic?.(code);
  }
  clear(): void {
    for (const note of this.notes.values()) note.host.remove();
    this.notes.clear();
  }

  pruneStale(resolve: (id: string) => RenderedMessageBinding | null): void {
    for (const [id, note] of this.notes) {
      const binding = resolve(id);
      if (
        !binding ||
        binding.bubble !== note.bubble ||
        !note.host.isConnected ||
        note.host.previousElementSibling !== note.anchor ||
        !note.anchor.parentElement ||
        !safeParent(note.anchor.parentElement) ||
        ["absolute", "fixed"].includes(
          note.anchor.ownerDocument.defaultView?.getComputedStyle(note.anchor)
            .position ?? "",
        )
      ) {
        note.host.remove();
        this.notes.delete(id);
      }
    }
  }

  reconcile(
    snapshot: AssessedSnapshot,
    resolve: (id: string) => RenderedMessageBinding | null,
  ): void {
    const retained = new Set<string>();
    const messages = new Map(
      snapshot.messages.map((message) => [message.id, message]),
    );
    if (snapshot.enabled && snapshot.status === "ready")
      for (const assessment of snapshot.assessments) {
        if (
          assessment.riskLevel !== "high" &&
          assessment.riskLevel !== "medium"
        )
          continue;
        const message = messages.get(assessment.messageId);
        if (!message || message.direction !== "incoming") {
          if (message?.direction === "unknown")
            this.diagnostic("unknown-message-direction");
          continue;
        }
        const binding = resolve(message.id);
        if (
          !binding ||
          binding.message.text !== message.text ||
          binding.message.id !== message.id ||
          binding.conversationId !== snapshot.conversation?.id
        ) {
          this.diagnostic("unreliable-message-binding");
          continue;
        }
        const bubble = binding.bubble;
        if (
          ["absolute", "fixed"].includes(
            bubble.ownerDocument.defaultView?.getComputedStyle(bubble)
              .position ?? "",
          )
        ) {
          this.diagnostic("unsupported-message-layout");
          continue;
        }
        let anchor = bubble;
        let parent = anchor.parentElement;
        if (!parent) continue;
        if (!safeParent(parent)) {
          const row = bubble.closest('[role="row"]');
          const candidates = row
            ? [...row.querySelectorAll(SELECTORS.message)].filter(
                (node) =>
                  !node.parentElement?.closest(SELECTORS.message) ||
                  !row.contains(node.parentElement.closest(SELECTORS.message)),
              )
            : [];
          if (
            !row ||
            row === binding.root ||
            !binding.root.contains(row) ||
            candidates.length !== 1 ||
            candidates[0] !== bubble ||
            !row.parentElement ||
            ["absolute", "fixed"].includes(
              row.ownerDocument.defaultView?.getComputedStyle(row).position ??
                "",
            ) ||
            !safeParent(row.parentElement)
          ) {
            this.diagnostic("unsupported-message-layout");
            continue;
          }
          anchor = row;
          parent = row.parentElement;
        }
        const signature = JSON.stringify([
          assessment.riskLevel,
          assessment.summary,
        ]);
        const existing = this.notes.get(message.id);
        retained.add(message.id);
        if (
          existing?.anchor === anchor &&
          existing.bubble === bubble &&
          existing.host.isConnected &&
          existing.host.previousElementSibling === anchor &&
          existing.signature === signature
        )
          continue;
        existing?.host.remove();
        const document = anchor.ownerDocument;
        const host = document.createElement("div");
        host.setAttribute(NOTE_ATTRIBUTE, "");
        host.style.cssText =
          "display:block;clear:both;max-width:360px;width:100%;margin:6px 0 8px;box-sizing:border-box;";
        const shadow = host.attachShadow({ mode: "open" });
        const style = document.createElement("style");
        style.textContent = `:host{color-scheme:light}*{box-sizing:border-box}.note{font:12px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#1D1D1F;background:#fff;border:1px solid #E5E5EA;border-radius:12px;padding:11px 13px}.brand{display:flex;align-items:center;gap:6px;font-weight:600}.risk{margin-left:auto;font-size:11px;color:${assessment.riskLevel === "high" ? "#a42f2a" : "#80590e"}}p{margin:7px 0}.label{color:#6E6E73;font-size:10px}button{font:600 12px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;border:0;border-radius:8px;background:#111;color:#fff;padding:6px 10px;cursor:pointer}button:hover{background:#303033}button:focus-visible{outline:2px solid #111;outline-offset:3px}button:disabled{opacity:.55;cursor:wait}.error{font-size:11px}.error:empty{display:none}`;
        const note = document.createElement("section");
        note.className = "note";
        note.setAttribute("aria-label", "VerdictAI preliminary safety note");
        const brand = document.createElement("div");
        brand.className = "brand";
        const shield = document.createElementNS(
          "http://www.w3.org/2000/svg",
          "svg",
        );
        shield.setAttribute("viewBox", "0 0 24 24");
        shield.setAttribute("width", "16");
        shield.setAttribute("height", "18");
        shield.setAttribute("aria-hidden", "true");
        const path = document.createElementNS(
          "http://www.w3.org/2000/svg",
          "path",
        );
        path.setAttribute(
          "d",
          "M12 2 21 6v7c0 5-5 8-9 10-4-2-9-5-9-10V6Z M8 12l3 3 5-6",
        );
        path.setAttribute("fill", "none");
        path.setAttribute("stroke", "currentColor");
        path.setAttribute("stroke-width", "1.5");
        path.setAttribute("stroke-linejoin", "round");
        shield.append(path);
        const name = document.createElement("span");
        name.textContent = "VerdictAI";
        const risk = document.createElement("span");
        risk.className = "risk";
        risk.textContent =
          assessment.riskLevel === "high" ? "High risk" : "Medium risk";
        brand.append(shield, name, risk);
        const summary = document.createElement("p");
        summary.textContent = assessment.summary;
        const label = document.createElement("p");
        label.className = "label";
        label.textContent = "Preliminary rule-based assessment";
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = "More Info →";
        const error = document.createElement("p");
        error.className = "error";
        error.setAttribute("role", "status");
        button.addEventListener("click", async (event) => {
          event.preventDefault();
          event.stopPropagation();
          if (!(this.options.activationAllowed?.(event) ?? event.isTrusted))
            return;
          if (resolve(message.id)?.bubble !== bubble) {
            this.diagnostic("stale-selection");
            host.remove();
            this.notes.delete(message.id);
            return;
          }
          button.disabled = true;
          error.textContent = "";
          try {
            await this.options.onMoreInfo(message.id);
          } catch {
            error.textContent =
              "Could not open this investigation. Please try again.";
          } finally {
            button.disabled = false;
          }
        });
        note.addEventListener("pointerdown", (event) =>
          event.stopPropagation(),
        );
        note.append(brand, summary, label, button, error);
        shadow.append(style, note);
        anchor.after(host);
        this.notes.set(message.id, { host, anchor, bubble, signature });
      }
    for (const [id, note] of this.notes)
      if (!retained.has(id)) {
        note.host.remove();
        this.notes.delete(id);
      }
  }
}
