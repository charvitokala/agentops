import { startContentController } from "./controller.ts";

// Static MV3 match plus a defensive origin check; never touch the page runtime.
if (location.origin === "https://web.whatsapp.com" && window === window.top) {
  startContentController(document);
}
