import { startContentController } from "./controller.ts";

if (location.origin === "https://mail.google.com" && window === window.top) {
  startContentController(document, { source: "gmail" });
}
