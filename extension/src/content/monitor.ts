import { emptySnapshot } from "../shared/contracts.ts";
import type { MonitoringSnapshot } from "../shared/contracts.ts";
import { SELECTORS } from "./selectors.ts";
import { locateConversationRoot, WhatsAppReader } from "./whatsapp-reader.ts";
import { isOwnedMutation } from "./ownership.ts";

interface MonitorOptions {
  document: Document;
  onChange: (snapshot: MonitoringSnapshot) => void;
  onReconcile?: (snapshot: MonitoringSnapshot) => void;
  onInvalidate?: () => void;
  debounceMs?: number;
  createObserver?: (callback: MutationCallback) => MutationObserver;
}

/** Two observers: cheap root lifecycle detection and scoped conversation changes. */
export class ConversationMonitor {
  private snapshot = emptySnapshot();
  private readonly reader = new WhatsAppReader();
  private root: Element | null = null;
  private topologyObserver: MutationObserver | null = null;
  private conversationObserver: MutationObserver | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private pendingSince: number | null = null;
  private readonly makeObserver: (
    callback: MutationCallback,
  ) => MutationObserver;
  private readonly options: MonitorOptions;

  constructor(options: MonitorOptions) {
    this.options = options;
    const window = options.document.defaultView;
    if (!window) throw new Error("A document with a window is required.");
    this.makeObserver =
      options.createObserver ??
      ((callback) => new window.MutationObserver(callback));
  }

  getSnapshot(): MonitoringSnapshot {
    return structuredClone(this.snapshot);
  }

  resolveMessage(id: string) {
    return this.snapshot.enabled ? this.reader.resolveMessage(id) : null;
  }

  refresh(): MonitoringSnapshot {
    this.scan();
    return this.getSnapshot();
  }

  setEnabled(enabled: boolean): void {
    if (enabled === this.snapshot.enabled) return;
    if (!enabled) {
      this.disconnect();
      this.reader.reset();
      this.root = null;
      this.snapshot = emptySnapshot();
      this.options.onChange(this.getSnapshot());
      return;
    }
    this.snapshot = emptySnapshot(true);
    this.options.onChange(this.getSnapshot());
    this.topologyObserver = this.makeObserver((records) => {
      records = records.filter((record) => !isOwnedMutation(record));
      if (!records.length) return;
      if (!this.snapshot.enabled) return;
      if (this.root && !this.root.isConnected) {
        this.options.onInvalidate?.();
        this.schedule();
        return;
      }
      if (!this.root) {
        if (
          records.some((record) => {
            const candidates =
              record.type === "attributes"
                ? [record.target]
                : [...record.addedNodes];
            return candidates.some(
              (node) =>
                node.nodeType === 1 &&
                ((node as Element).matches(SELECTORS.conversationRoot) ||
                  (node as Element).querySelector(SELECTORS.conversationRoot)),
            );
          })
        )
          this.schedule();
        return;
      }
      if (
        records.some(
          (record) =>
            record.type === "attributes" &&
            record.target.nodeType === 1 &&
            (record.target as Element).contains(this.root),
        )
      )
        this.schedule();
    });
    this.topologyObserver.observe(this.options.document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["hidden", "aria-hidden", "class", "style"],
    });
    this.scan();
  }

  dispose(): void {
    this.setEnabled(false);
    this.disconnect();
  }

  private schedule(): void {
    if (!this.snapshot.enabled) return;
    this.pendingSince ??= Date.now();
    if (this.timer !== null) clearTimeout(this.timer);
    const delay = Math.min(
      this.options.debounceMs ?? 120,
      Math.max(0, 500 - (Date.now() - this.pendingSince)),
    );
    this.timer = setTimeout(() => {
      this.timer = null;
      this.pendingSince = null;
      this.scan();
    }, delay);
  }

  private scan(): void {
    if (!this.snapshot.enabled) return;
    const root = locateConversationRoot(this.options.document);
    if (root !== this.root) {
      this.conversationObserver?.disconnect();
      this.conversationObserver = null;
      this.root = root;
      this.reader.reset();
      if (root) {
        this.conversationObserver = this.makeObserver((records) => {
          const relevant = records.some((record) => {
            if (isOwnedMutation(record)) return false;
            const element =
              record.target.nodeType === 1
                ? (record.target as Element)
                : record.target.parentElement;
            return !element?.closest(SELECTORS.composer);
          });
          if (relevant) {
            this.options.onInvalidate?.();
            this.schedule();
          }
        });
        this.conversationObserver.observe(root, {
          childList: true,
          subtree: true,
          characterData: true,
          attributes: true,
          attributeFilter: [
            "data-id",
            "data-chat-id",
            "title",
            "hidden",
            "aria-hidden",
            "class",
            "style",
          ],
        });
      }
    }
    const result = this.reader.read(root);
    const next = {
      enabled: true,
      ...result,
      updatedAt: this.snapshot.updatedAt,
    };
    const previous = { ...this.snapshot, updatedAt: null };
    if (
      JSON.stringify({ ...next, updatedAt: null }) === JSON.stringify(previous)
    ) {
      this.options.onReconcile?.(this.getSnapshot());
      return;
    }
    this.snapshot = { ...next, updatedAt: new Date().toISOString() };
    this.options.onChange(this.getSnapshot());
  }

  private disconnect(): void {
    this.topologyObserver?.disconnect();
    this.conversationObserver?.disconnect();
    this.topologyObserver = null;
    this.conversationObserver = null;
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
    this.pendingSince = null;
  }
}
