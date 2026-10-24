import { readFileSync } from "node:fs";
import { URL } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import { JSDOM } from "jsdom";

export function fixture() {
  return new JSDOM(
    readFileSync(new URL("./fixtures/whatsapp.html", import.meta.url), "utf8"),
    { url: "https://web.whatsapp.com/", pretendToBeVisual: true },
  );
}

export function message(document, { id, text, direction = "incoming" } = {}) {
  const bubble = document.createElement("div");
  if (direction === "unknown") bubble.dataset.testid = "msg-container";
  else
    bubble.className = direction === "incoming" ? "message-in" : "message-out";
  if (id) bubble.setAttribute("data-id", id);
  const content = document.createElement("span");
  content.className = "selectable-text";
  content.textContent = text ?? "Fictional test text";
  bubble.append(content);
  return bubble;
}

export async function waitFor(predicate) {
  for (let tries = 0; tries < 100; tries++) {
    if (predicate()) return;
    await delay(10);
  }
  throw new Error("Timed out waiting for a DOM observer result.");
}
