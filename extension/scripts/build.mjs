import { build } from "esbuild";
import { cp, mkdir, rm, readFile, writeFile } from "node:fs/promises";
import process from "node:process";
import { fileURLToPath, URL } from "node:url";
import { websiteOrigin } from "../src/shared/website-config.ts";

const project = fileURLToPath(new URL("../", import.meta.url));
const banner = {
  js: "/* eslint-disable -- Generated extension bundle; lint extension/src instead. */",
};
process.chdir(project);
const origin = websiteOrigin(
  process.env.VERDICTAI_WEBSITE_URL || "http://localhost:3000",
);
const define = { __VERDICTAI_WEBSITE_ORIGIN__: JSON.stringify(origin) };
await rm("dist", { recursive: true, force: true });
await mkdir("dist", { recursive: true });
await cp("public", "dist", { recursive: true });
await cp("src/ui/styles.css", "dist/ui.css");
const manifest = JSON.parse(await readFile("dist/manifest.json", "utf8"));
manifest.content_scripts[1].matches = [`${origin}/investigation/*`];
await writeFile("dist/manifest.json", JSON.stringify(manifest, null, 2) + "\n");
await Promise.all([
  build({
    entryPoints: ["src/content/gmail-index.ts"],
    outfile: "dist/gmail-content.js",
    bundle: true,
    format: "iife",
    platform: "browser",
    target: "chrome114",
    legalComments: "none",
    banner,
    define,
  }),
  build({
    entryPoints: ["src/content/index.ts"],
    outfile: "dist/content.js",
    bundle: true,
    format: "iife",
    platform: "browser",
    target: "chrome114",
    legalComments: "none",
    banner,
    define,
  }),
  build({
    entryPoints: ["src/bridge/website.ts"],
    outfile: "dist/website-bridge.js",
    bundle: true,
    format: "iife",
    platform: "browser",
    target: "chrome114",
    legalComments: "none",
    banner,
    define,
  }),
  build({
    entryPoints: ["src/background/index.ts"],
    outfile: "dist/background.js",
    bundle: true,
    format: "esm",
    platform: "browser",
    target: "chrome114",
    legalComments: "none",
    banner,
    define,
  }),
  build({
    entryPoints: { popup: "src/ui/popup.ts", debug: "src/ui/debug.ts" },
    outdir: "dist",
    bundle: true,
    format: "esm",
    platform: "browser",
    target: "chrome114",
    legalComments: "none",
    banner,
    define,
  }),
]);
process.stdout.write(
  "Extension built: " +
    fileURLToPath(new URL("../dist/", import.meta.url)) +
    "\n",
);
