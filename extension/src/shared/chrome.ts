/** Narrow, structural typings for the Chrome APIs used here; no runtime shim. */
export interface ChromeEvent<Listener> {
  addListener(listener: Listener): void;
  removeListener(listener: Listener): void;
}

export interface ChromePort {
  name: string;
  sender?: { id?: string; url?: string };
  postMessage(message: unknown): void;
  disconnect(): void;
  onMessage: ChromeEvent<(message: unknown) => void>;
  onDisconnect: ChromeEvent<() => void>;
}

export interface StorageChange {
  oldValue?: unknown;
  newValue?: unknown;
}

interface MessageSender {
  id?: string;
  url?: string;
  frameId?: number;
  tab?: { id?: number };
}

declare global {
  const chrome: {
    runtime: {
      id: string;
      lastError?: { message?: string };
      getURL(path: string): string;
      onConnect: ChromeEvent<(port: ChromePort) => void>;
      sendMessage(message: unknown): Promise<unknown>;
      onMessage: ChromeEvent<
        (
          message: unknown,
          sender: MessageSender,
          respond: (message: unknown) => void,
        ) => boolean | void
      >;
    };
    storage: {
      local: {
        get(key: string): Promise<Record<string, unknown>>;
        set(items: Record<string, unknown>): Promise<void>;
      };
      session: {
        get(key: null): Promise<Record<string, unknown>>;
        set(items: Record<string, unknown>): Promise<void>;
        remove(keys: string[]): Promise<void>;
      };
      onChanged: ChromeEvent<
        (changes: Record<string, StorageChange>, areaName: string) => void
      >;
    };
    tabs: {
      query(query: {
        active: boolean;
        currentWindow: boolean;
      }): Promise<{ id?: number }[]>;
      connect(tabId: number, options: { name: string }): ChromePort;
      sendMessage(tabId: number, message: unknown): Promise<unknown>;
      create(properties: { url: string }): Promise<{ id?: number }>;
      onRemoved: ChromeEvent<(tabId: number) => void>;
    };
    alarms: {
      create(name: string, options: { when: number }): Promise<void>;
      clear(name: string): Promise<boolean>;
      onAlarm: ChromeEvent<(alarm: { name: string }) => void>;
    };
  };
}
