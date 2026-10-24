import assert from "node:assert/strict";
import { readFile, access } from "node:fs/promises";
import { URL, fileURLToPath } from "node:url";
import process from "node:process";
import { websiteOrigin } from "../src/shared/website-config.ts";

const directory = new URL("../dist/", import.meta.url);
const manifest = JSON.parse(
  await readFile(new URL("manifest.json", directory), "utf8"),
);
assert.equal(manifest.manifest_version, 3);
assert.deepEqual(manifest.permissions, ["storage", "alarms"]);
assert.deepEqual(manifest.background, {
  service_worker: "background.js",
  type: "module",
});
assert.equal(manifest.externally_connectable, undefined);
assert.equal(manifest.host_permissions, undefined);
assert.deepEqual(manifest.content_scripts[0].matches, [
  "https://web.whatsapp.com/*",
]);
assert.equal(manifest.content_scripts[0].world, "ISOLATED");
assert.equal(manifest.content_scripts.length, 2);
const bridge = manifest.content_scripts[1];
const origin = websiteOrigin(
  bridge.matches[0].replace(/\/investigation\/\*$/, ""),
);
assert.deepEqual(bridge.matches, [`${origin}/investigation/*`]);
assert.equal(bridge.world, "ISOLATED");
assert.equal(bridge.all_frames, false);
for (const filename of [
  ...manifest.content_scripts[0].js,
  ...bridge.js,
  manifest.background.service_worker,
  manifest.action.default_popup,
  "debug.html",
  "popup.js",
  "debug.js",
  "ui.css",
])
  await access(new URL(filename, directory));
const content = await readFile(new URL("content.js", directory), "utf8");
assert.ok(
  !/^\s*import\s/m.test(content),
  "Content script must be a self-contained classic script",
);
for (const filename of [
  "content.js",
  "website-bridge.js",
  "background.js",
  "popup.js",
  "debug.js",
]) {
  const code = await readFile(new URL(filename, directory), "utf8");
  assert.ok(
    !/\b(?:fetch|XMLHttpRequest|WebSocket|EventSource|sendBeacon)\s*\(/.test(
      code,
    ),
    "No outbound networking in " + filename,
  );
  assert.ok(
    !/\b(?:eval|Function)\s*\(/.test(code),
    "No dynamic code evaluation in " + filename,
  );
}
for (const filename of ["popup.html", "debug.html"]) {
  const html = await readFile(new URL(filename, directory), "utf8");
  assert.ok(!/\son\w+=/i.test(html), "No inline event handlers in " + filename);
  assert.ok(
    !/<script(?![^>]*\bsrc=)[^>]*>/i.test(html),
    "No inline scripts in " + filename,
  );
}
process.stdout.write(
  "MV3 package checks passed: " + fileURLToPath(directory) + "\n",
);
