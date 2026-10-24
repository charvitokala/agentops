# VerdictAI Guardian · Phase 1D

A standalone Manifest V3 Chrome extension that reads text already rendered in the open WhatsApp Web conversation. The approved VerdictAI Next.js design is preserved; only extension-case input, storage and route support were added. Phase 1C adds local BFSI rules and preliminary insights. Phase 1D adds compact incoming-message notes and selected-case handoff to the existing investigation website. No AI agents or sending/modifying WhatsApp messages are implemented. See [HANDOFF.md](HANDOFF.md) for configuration, security assumptions, permissions and exact manual test steps. See [DETECTION.md](DETECTION.md) for weights, integration, and limitations.

## Build

Use Node.js 22.18+ and npm. No runtime dependencies, credentials, or environment variables are needed.

```bash
cd /Users/charvitokala/Desktop/agentops/extension
npm install
npm run typecheck
npm test
npm run build
npm run check:package
```

Build output: **`/Users/charvitokala/Desktop/agentops/extension/dist`**.

The build uses esbuild as a lightweight TypeScript bundler. The content script is a single classic-script IIFE, and the popup/debug pages have bundled external scripts compatible with extension CSP. TypeScript and JSDOM are development-only dependencies. The generated directory runs without npm or the Next.js website.

## Load in Chrome

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked** and select the `extension/dist` directory above (not the source `extension/` directory).
4. Confirm version **0.1.1** is loaded. Open or reload `https://web.whatsapp.com/`. A reload is required for an already open WhatsApp tab after loading/reloading the extension.
5. Open one conversation, then open **VerdictAI Guardian** from Chrome's Extensions menu. Pin it if useful.
6. Monitoring starts **off**. Turn on **WhatsApp monitoring** to begin reading the currently rendered message window.
7. Click **Open debugging view**. This opens a local extension page bound to that WhatsApp source tab. It shows conversation status, current message count, text, URLs, direction, first-observed timestamps, preliminary risk, category, warning signs, short explanations, and safety actions. Scores are heuristic severity points, not fraud probabilities. URLs are non-clickable text. High/medium incoming entries have a **More Info** button that opens the same selected-case investigation as an inline note.
8. Return to WhatsApp and switch conversations, scroll to virtualize messages, or receive a new message. The debug page follows the source tab's open conversation after the observer debounce. It does not auto-scroll, open other chats, or load older history.
9. Turn monitoring off from the popup or debugging page. All observers stop, pending work is canceled, and transient message data is cleared from the reader and connected views. The boolean preference applies to each WhatsApp Web tab.

If the source tab closes, reloads, or the extension is updated, the debug view clears its messages and asks you to reconnect through the popup. If the popup is opened on another website, it requests that you open/reload WhatsApp Web; no script is injected into the unrelated site.

## Structure

```text
public/                         MV3 manifest and local popup/debug HTML
src/content/selectors.ts        Centralized WhatsApp DOM hooks
src/content/whatsapp-reader.ts   Scoped DOM extraction, IDs, URLs, visibility
src/content/monitor.ts           Debounced observers and current-window reconciliation
src/content/controller.ts       Preference lifecycle and local Chrome messaging
src/content/assessment-pipeline.ts Current-window analysis caching and reconciliation
src/detection/                  Pure rules, URL checks, scoring, summaries/actions
src/shared/                     Serializable contracts and narrow Chrome API types
src/ui/                         Popup, debug view, safe text rendering, shared styling
scripts/                        esbuild packaging and MV3 artifact validation
tests/                          Fictional DOM fixtures and integration tests
dist/                           Generated Load-unpacked directory (ignored by Git)
```

## DOM behavior and limitations

- **Unofficial DOM hooks:** WhatsApp provides no stable public DOM schema. Selectors are centralized and may need updates after WhatsApp releases, experiments, or locale/layout changes. This implementation uses DOM access only; it does not read WhatsApp's internal JavaScript objects, application stores, APIs, cookies, tokens, network responses, or IndexedDB.
- **Strict conversation scope:** extraction starts inside `#main` or the recognized conversation wrapper, requires an identifiable conversation header, and reads only recognized message bubbles and text spans. The conversation list, composer, quoted-preview containers, metadata, hidden elements, and media-only messages are excluded. Unknown layouts show an explicit unsupported state rather than falling back to page-wide text.
- **Rendered window, not history:** messages are reconciled against the current DOM on every relevant batch. Virtualized/removed messages are dropped. Connected, CSS-visible messages may extend beyond the scroll viewport because WhatsApp pre-renders some surrounding content. The reader never scrolls or fetches history. Backgrounding the WhatsApp tab does not disable the reader; this permits the debugging page to remain connected to the same open conversation.
- **Selector fallback:** when a dedicated list hook is unavailable, recognized bubbles may be read within the conversation root. This does not expand into the sidebar or composer. Unrecognized text layouts are ignored.
- **Message identity:** a DOM `data-id`, when available, is scoped to this content-script session and conversation. Otherwise the fallback is `session scope + conversation fingerprint + text/direction fingerprint + duplicate occurrence`. Fallback IDs are **not globally unique** and are not suitable as database or evidence identifiers. Occurrence IDs may shift when identical messages are virtualized or reordered; hash collisions are possible. Same-named conversations cannot always be distinguished from the header alone, though the message list is always replaced with the current DOM contents.
- **Direction:** `.message-in` and `.message-out` are used when available. Otherwise direction is `unknown`; it is never guessed from message wording.
- **Observation time:** `observedAt` is the first time a message entered the current in-memory DOM window. It is not WhatsApp's sent/delivery time. Removing and later re-rendering a message can reset this time.
- **URLs:** text detection is heuristic, recognizes HTTP(S), `www`, and common bare domain forms, and normalizes missing schemes to HTTPS. Displayed anchor destinations are included without navigation or resolution. This does not verify a domain or classify its safety.
- **Timing:** relevant mutations debounce for 120ms with a 500ms maximum wait during continuous changes. The root lifecycle observer performs only a cheap connectedness check during ordinary mutations outside the conversation; composer changes do not trigger extraction. Visibility checks share a per-scan cache. Rapid conversation transitions may briefly show the previous settled snapshot until reconciliation completes.

## Privacy and permissions

Requested permissions are **`storage`** and **`alarms`**. Alarms expire explicitly selected pending handoff cases. The WhatsApp reader matches only **`https://web.whatsapp.com/*`**. The separate handoff bridge matches only the configured website investigation origin/path. Both run in the isolated world and top frame; neither enters WhatsApp's internal runtime. A service worker brokers selected cases, and a second isolated content script is restricted to the configured investigation website. No `tabs`, `activeTab`, `scripting`, cookies or broad host permissions are requested. The popup uses the active tab's numeric ID to connect; it does not query tab titles, URLs, or unrelated content.

Only `chrome.storage.local.monitoringEnabled` is persisted. During ordinary monitoring, messages, assessments, and the conversation label live only in content-script memory and connected extension pages. An explicit More Info click temporarily hands only the selected case to the configured website tab. Storage is never used for chat history, including localStorage or IndexedDB. Phase 1D uses `chrome.storage.session` only for bounded, short-lived, explicitly selected pending cases; it never accumulates conversation history. The destination tab stores the selected case in its own sessionStorage. See HANDOFF.md for expiry and origin boundaries. Closing the popup/debug view does not itself disable a previously enabled reader; use the monitoring switch. Disabling, changing conversations, removing virtualized nodes, or reloading the WhatsApp tab clears the corresponding transient data. No telemetry, analytics, external libraries at runtime, console logging of message content, or outbound networking are included. Extension-page CSP also blocks network connections. Message content is rendered through `textContent`, never `innerHTML`, and extracted URLs are not clickable links.

## Testing and manual verification

`npm test` runs Node's test runner with JSDOM and a fictional WhatsApp-like fixture. It checks single/multiple messages, multiline/emoji text, URL extraction, identity/deduplication, current-window reconciliation, new messages and edits, conversation/root changes, missing/hidden containers, composer/sidebar exclusion, enable/disable control, canceled pending work, observer cleanup, preference races, port trust boundaries, local-only preference writes, and safe debug rendering. `check:package` verifies manifest scope, generated file references, isolated-world packaging, CSP-compatible scripts, and absence of outbound network calls in bundles.

Phase 1C additionally tests BFSI scenarios, protective/negated wording, scoring boundaries, overlap prevention, URL patterns, message-ID associations, cached analysis, edits, conversation changes, disabled monitoring, and the full fixture reader/controller/debugging flow.

These tests do **not** establish compatibility with every current WhatsApp Web deployment. Chrome Load-unpacked installation and live WhatsApp behavior must be manually verified on the target browser. No successful live WhatsApp test is claimed.

Implementation validation: installation succeeded from existing npm cache data, all 104 tests passed, strict TypeScript and source lint checks passed, and the extension build and MV3 package checks passed. The existing Next.js production build also passed, and website CSS, main investigation layout, Courtroom/agent components, dashboard and analyzer remain preserved; route/data adapters are the only website integration changes. Live Chrome/WhatsApp testing remains manual; Phase 1D adds fixture-driven click, broker, bridge, storage and actual investigation-rendering tests. The lockfile includes official cached metadata for all esbuild native platforms; it contains no temporary-cache or local-file package references.

Useful manual checks: verify the extension loads without manifest errors; monitoring is off on a fresh install; selecting a real conversation shows only its rendered text; new/edited messages and chat switches update the debug page; scrolling removes virtualized messages; the count does not grow from duplicate nodes; switching monitoring off immediately clears the debugging view; closing/reloading the source tab clears it; and there are no outgoing message-content requests or saved chat records.

Chrome API references: [content scripts](https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts), [extension storage](https://developer.chrome.com/docs/extensions/reference/api/storage), [message passing](https://developer.chrome.com/docs/extensions/develop/concepts/messaging), and [Tabs API permission scope](https://developer.chrome.com/docs/extensions/reference/api/tabs).

## Minimal Gmail support

The additional isolated, top-frame content script matches only `https://mail.google.com/*`. No additional API permissions or dependencies are required. Gmail uses the existing observer, Chrome connection, local assessment pipeline and Message Verdict renderer. Its separate `gmailMonitoringEnabled` preference defaults to off; enabling WhatsApp does not enable Gmail. Only boolean preferences persist; email content stays transient.

To try it: run `cd extension && npm run build`, reload the unpacked `extension/dist` extension in Chrome, and reload Gmail. Open an email, open the extension popup, enable monitoring, and select **Click for More Info**. The existing Message Verdict page shows the sender, subject, visible body, links and local assessment. Navigate to another email to check updates; switch monitoring off to clear the results. The popup and page retain their existing design and static WhatsApp-oriented descriptions.

Limitations: Gmail DOM hooks (`[role="main"]`, `h2.hP`, `.adn`, `.gD[email]`, `.a3s`) are unofficial and may change. Only the **last visible expanded email in the open thread** is read, not all emails or inbox previews. CSS-visible content can extend beyond the viewport. Draft composers and hidden content are excluded; visible quoted text may be included. Sender metadata is unverified, direction is `unknown`, and fallback IDs are scoped to the current DOM/session. This minimal integration does not add Gmail inline notes, Courtroom handoff, attachments, iframe contents, spam-folder automation, Gmail-specific detection rules or URL visits. It requires the normal desktop Gmail layout. No live Gmail test is claimed; manual Chrome/Gmail verification remains required.

`tests/gmail.test.mjs` covers extraction scope, headers, URLs, hidden/draft exclusion, multiline content, message/thread changes, opt-in isolation from WhatsApp, the actual popup connection and More Info navigation, local analysis, existing card rendering and disabled cleanup using a fictional Gmail DOM.
