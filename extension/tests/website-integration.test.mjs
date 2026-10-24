import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";
import { Buffer } from "node:buffer";
import { URL, fileURLToPath, pathToFileURL } from "node:url";
import { JSDOM } from "jsdom";
import { build } from "esbuild";
import { createExtensionCase } from "../src/shared/handoff.ts";
import { analyzeMessage } from "../src/detection/analyze-message.ts";
import {
  extensionCaseToScamCase,
  loadExtensionCase,
} from "../../src/lib/extension-cases.ts";
import { getDemoCase } from "../../src/lib/demo-cases.ts";

const require = createRequire(new URL("../../package.json", import.meta.url));
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const root = new URL("../../", import.meta.url);
const compiled = await build({
  entryPoints: [
    fileURLToPath(new URL("src/components/investigation.tsx", root)),
  ],
  bundle: true,
  platform: "node",
  format: "esm",
  write: false,
  jsx: "automatic",
  logLevel: "silent",
  tsconfig: fileURLToPath(new URL("tsconfig.json", root)),
  plugins: [
    {
      name: "use-existing-website-packages",
      setup(builder) {
        builder.onResolve(
          { filter: /^(?:react(?:\/.*)?|next\/link|lucide-react)$/ },
          (args) => ({
            path: pathToFileURL(require.resolve(args.path)).href,
            external: true,
          }),
        );
      },
    },
  ],
});
const { Investigation } = await import(
  "data:text/javascript;base64," +
    Buffer.from(compiled.outputFiles[0].text).toString("base64")
);

function selectedCase() {
  const message = {
    id: "fictional-selected",
    text: "Your bank security team needs your OTP immediately.\nA fictional selected message with <private> text.",
    urls: [],
    direction: "incoming",
    observedAt: new Date().toISOString(),
  };
  return createExtensionCase(
    message,
    analyzeMessage(message),
    "http://localhost:3000",
  );
}

test("transferred case renders exact original text and risk in the approved investigation component", () => {
  const payload = selectedCase();
  const item = extensionCaseToScamCase(payload);
  const html = renderToStaticMarkup(
    React.createElement(Investigation, { item }),
  );
  const dom = new JSDOM(html);
  try {
    assert.equal(
      dom.window.document.querySelector("blockquote").textContent,
      payload.message.text,
    );
    assert.equal(
      dom.window.document.querySelector(".risk-badge").textContent,
      "High risk",
    );
    assert.equal(dom.window.document.querySelectorAll(".agent-card").length, 4);
    assert.deepEqual(
      [...dom.window.document.querySelectorAll(".agent-card h3")].map(
        (element) => element.textContent,
      ),
      ["investigator", "prosecutor", "defender", "judge"],
    );
    assert.equal(
      dom.window.document.querySelectorAll(".agent-card .phase-label").length,
      4,
    );
    assert.ok(
      [...dom.window.document.querySelectorAll(".phase-label")].every(
        (element) => element.textContent === "Coming in Phase 2",
      ),
    );
    assert.equal(
      dom.window.document.querySelector(".matched-text"),
      null,
      "Do not invent matched quotations when the engine supplies no text span",
    );
    assert.ok(html.includes(payload.assessment.summary));
    for (const action of payload.assessment.recommendedActions)
      assert.ok(dom.window.document.body.textContent.includes(action));
    assert.ok(
      dom.window.document.body.textContent.includes(
        "Evidence verification not yet available",
      ),
    );
    assert.ok(item.agents.every((agent) => agent.status === "not_available"));
    assert.ok(
      item.evidence.every((evidence) => evidence.status === "unverified"),
    );
    const textCard = dom.window.document
      .querySelector("blockquote")
      .closest("section");
    assert.equal(textCard.nextElementSibling.id, "courtroom");
  } finally {
    dom.window.close();
  }
});

test("demo cases preserve their existing quotations, tabs, and all four Courtroom cards", () => {
  const item = getDemoCase("demo-kyc-001");
  const html = renderToStaticMarkup(
    React.createElement(Investigation, { item }),
  );
  const dom = new JSDOM(html);
  try {
    assert.equal(
      dom.window.document.querySelector("h1").textContent,
      item.title,
    );
    assert.equal(
      dom.window.document.querySelector("blockquote").textContent,
      item.message.text,
    );
    assert.equal(dom.window.document.querySelectorAll(".agent-card").length, 4);
    assert.equal(
      dom.window.document.querySelectorAll('[role="tab"]').length,
      3,
    );
    assert.equal(
      dom.window.document.querySelectorAll(".matched-text").length,
      item.signals.length,
    );
  } finally {
    dom.window.close();
  }
});

test("missing, tampered and malformed stored extension cases fail closed", () => {
  const payload = selectedCase();
  const stored = new Map();
  const storage = { getItem: (key) => stored.get(key) ?? null };
  const key = "verdictai:extension-case:v1:" + payload.caseId;
  assert.equal(
    loadExtensionCase(storage, payload.caseId, payload.websiteOrigin),
    null,
  );
  stored.set(key, "invalid JSON");
  assert.equal(
    loadExtensionCase(storage, payload.caseId, payload.websiteOrigin),
    null,
  );
  stored.set(
    key,
    JSON.stringify({
      ...payload,
      assessment: { ...payload.assessment, riskLevel: "low" },
    }),
  );
  assert.equal(
    loadExtensionCase(storage, payload.caseId, payload.websiteOrigin),
    null,
  );
  stored.set(key, JSON.stringify(payload));
  assert.equal(
    loadExtensionCase(storage, payload.caseId, "https://another.example"),
    null,
  );
  assert.equal(
    loadExtensionCase(storage, payload.caseId, payload.websiteOrigin).message
      .text,
    payload.message.text,
  );
});
