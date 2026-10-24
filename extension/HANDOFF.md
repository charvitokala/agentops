# Phase 1D · Inline notes and investigation handoff

## Run and load

Start the existing website in one terminal:

```bash
cd /Users/charvitokala/Desktop/agentops
npm install
npm run dev
```

Build the extension in another terminal:

```bash
cd /Users/charvitokala/Desktop/agentops/extension
npm install
npm run typecheck
npm test
npm run build
npm run check:package
```

The default destination is **http://localhost:3000**. Open that exact origin, including its port. For production, build with one HTTPS origin:

```bash
VERDICTAI_WEBSITE_URL=https://guardian.example npm run build
npm run check:package
```

The configured URL must have no credentials, wildcard host, extra path, query or fragment. HTTP is accepted only for `localhost` and `127.0.0.1`. Other origins require HTTPS. Rebuilding changes the website bridge's manifest match and the worker/bridge origin checks together. The website infers its own origin, so no second website configuration or extension ID is needed.

In Chrome, open **chrome://extensions**, enable **Developer mode**, and load or reload **`/Users/charvitokala/Desktop/agentops/extension/dist`**. Then reload WhatsApp Web. After changing the configured origin, reload the extension and both source/destination pages. The built directory contains the MV3 manifest, content script, service worker, website bridge, and existing popup/debug assets.

## Exact manual WhatsApp checks

1. Open `https://web.whatsapp.com/` and one conversation. Open VerdictAI's popup and enable monitoring. Fresh installations remain off by default.
2. Use consenting participants and fictional test content. For a high-risk example, have the conversation contain an incoming message such as: **“Your bank security team needs your OTP immediately.”** For medium risk, use **“Send your OTP.”** Receiving one of these from a consenting test participant is sufficient; the extension never sends messages itself.
3. Confirm a compact, solid white VerdictAI note appears below the correct incoming bubble. Confirm the original message and WhatsApp controls are unchanged. High/medium labels must reflect the debugging view's assessment.
4. Check ordinary incoming text, **“Never share your OTP”**, outgoing messages and unknown-direction layouts. They must not receive warning notes or green Safe badges. No note is a safety guarantee.
5. Click **More Info** on one note. Confirm a **new tab** opens at `http://localhost:3000/investigation/ext-<uuid>`, or the configured production origin. The address must contain only the opaque case ID, with no message text, WhatsApp ID, name, phone number, query, or fragment.
6. In the new tab, compare the exact original message, risk, indicators and safety actions with the selected source/debug entry. Confirm the existing Courtroom is visible with Investigator, Prosecutor, Defender and Judge cards, each still **Coming in Phase 2**. No Judge findings or verified evidence should appear.
7. Refresh this website tab. The same case should load from this tab's sessionStorage. Copying a case URL into an unrelated/new session may instead show an unavailable-case explanation; there is no database-backed case lookup.
8. Return to WhatsApp. Edit a test message, switch chats, receive another test message, and scroll enough to replace rendered nodes. Confirm notes update or disappear, never duplicate, and stay associated with their actual messages.
9. Disable monitoring. Confirm all notes and transient reader/assessment data clear, and new incoming messages do not cause notes. An investigation already explicitly opened remains in its website tab's sessionStorage.
10. Test an unavailable website, cleared/blocked sessionStorage, a copied unknown case URL, and a deliberately expired unclaimed case. Expect a clear retry/unavailable state rather than an unrelated demo investigation. Return to WhatsApp and click More Info again to create a fresh handoff.
11. With developer tools, inspect only fictional data. Confirm no message-content HTTP requests, suspicious-link fetches, or complete chat histories are sent or persisted. `chrome.storage.local` should contain only the monitoring preference. Temporary selected-case records may appear in `chrome.storage.session` until claim/expiry/target-tab closure.

These manual checks are still required on real Chrome/WhatsApp Web. Automated tests use fictional DOM fixtures and mocked Chrome tab/storage APIs; no successful live WhatsApp test is claimed.

## Message association and note lifecycle

The existing `WhatsAppReader` now retains an in-memory binding from each extracted ID to the exact bubble, root and conversation from the same extraction pass. It also retains the raw DOM ID internally for revalidation; that ID is not transferred to the website. There is no second reader.

`resolveMessage()` rechecks connectedness, conversation identity, text, URLs, direction and raw DOM ID. Duplicate native IDs remove their binding, so no arbitrary matching node is chosen. Fallback IDs still use the existing session/conversation-scoped identity model, with the same documented limitations.

`InlineNotes` reconciles only high/medium incoming assessments. Low, insufficient, outgoing and unknown-direction entries are not annotated. Notes use a dedicated Shadow DOM, plain text, an isolated light palette and a native keyboard-accessible button. Synthetic page-script clicks are rejected; tests explicitly inject a mock activation check because JSDOM cannot create trusted user events.

The preferred placement is immediately after the verified bubble in normal block/column flow. A uniquely identified enclosing message row can be used for horizontal bubble wrappers. Grid/unsupported layouts or ambiguous bindings are skipped with fixed diagnostic codes such as `unsupported-message-layout`; diagnostics never contain message text, URLs, contact names or message IDs. No original text is changed or moved.

Owned-host mutations are excluded from observation. Stale notes are pruned in the mutation microtask before the debounced rescan, and every real extraction pass updates bindings even if the textual snapshot is unchanged. This allows replacing a bubble with an equivalent DOM node without leaving a stale note. Edits, removed/virtualized nodes, chat changes, disable and disposal reconcile/remove notes. The More Info handler refreshes the existing monitor before selecting the message again.

## Handoff protocol and security assumptions

1. A trusted More Info click requests only the selected message and its associated Phase 1C assessment through internal Chrome runtime messaging. The source controller revalidates its live DOM binding and enabled state.
2. A service-worker broker accepts open requests only from this extension's top-frame WhatsApp content script. It validates the message and exact assessment using the existing Phase 1C engine, generates a random `ext-<uuid>`, and remaps message/assessment IDs to it. Conversation names, unrelated messages and raw WhatsApp identifiers are omitted.
3. The broker creates a new tab at the configured investigation URL. It retains a bounded pending record in **`chrome.storage.session`**, bound to that exact destination tab ID, origin and case path. Pending data survives service-worker suspension, has a two-minute claim lifetime, and is limited to eight explicit selections. It is not written to `storage.local` or any server.
4. An isolated-world website content script runs only on the configured website's investigation paths. The React receiver announces readiness with a per-load nonce. Both ends check `event.source === window`, the exact origin, case ID and nonce. Every `postMessage` has an explicit origin target, never `*`.
5. The bridge claims through internal runtime messaging. The broker checks extension ID, top frame, exact destination tab ID, URL origin/path and expiry. A serialized consume removes the record before returning it, preventing concurrent/repeated claims. The receiver validates the schema, associations and canonical local assessment again, saves it in website sessionStorage and acknowledges receipt. The bridge then clears its temporary copy and listeners.
6. A pure adapter maps the selected payload to the existing `ScamCase`. It preserves exact text, risk, explanations and actions. It uses the existing unexecuted agent-role definitions and unverified evidence statuses. No agent outputs or matched quotations are invented. Website refreshes use the retained session record after the transport TTL has expired; closing/clearing the website session can make the case unavailable.

**Trust boundary:** this design trusts the installed extension code and the configured website origin, including scripts running on that origin. The nonce correlates a page load; it is not a cryptographic signature proving the extension to malicious same-origin JavaScript. An XSS or compromised script on the trusted website could read data delivered there or its sessionStorage. Unrelated origins, tabs, frames, routes, expired claims and altered payloads are rejected. Deploy the website and extension from matching engine versions; schema/assessment mismatches fail closed.

There is no public case-content API, cross-origin localStorage access, externally-connectable extension endpoint, private URL parameter/fragment, backend database, or automatic conversation transfer. The website server sees an opaque route ID and ordinary page requests; case contents are delivered in-browser after the user's click. No suspicious URL is visited.

## Permissions and cleanup

- Existing **`storage`** remains for the opt-in preference and trusted-context pending session records. Chrome's [session storage](https://developer.chrome.com/docs/extensions/reference/api/storage#storage_areas) is in-memory and is not exposed to content scripts by default; this implementation does not widen that access.
- Added **`alarms`** only to expire pending cases across MV3 worker suspension. Records are deleted on consume, destination-tab closure, expiry cleanup and extension/browser session clearing. Claims are rejected immediately after the two-minute deadline even if Chrome [delays an alarm](https://developer.chrome.com/docs/extensions/reference/api/alarms) during sleep/throttling; physical cleanup can therefore occur later than the deadline.
- Added content-script access only to the configured website's investigation paths. Runtime origin checks include the exact port as defense in depth. There are no broad host, cookies, `tabs`, `activeTab`, scripting, or side-panel permissions. See Chrome's [match patterns](https://developer.chrome.com/docs/extensions/develop/concepts/match-patterns) and [messaging](https://developer.chrome.com/docs/extensions/develop/concepts/messaging) documentation.

## Files and validation

Added: `extension/src/content/inline-notes.ts`, `ownership.ts`; `extension/src/background/`; `extension/src/bridge/`; `extension/src/shared/handoff.ts`, `website-config.ts`; `src/components/extension-investigation.tsx`; `src/lib/extension-cases.ts`, `extension-receiver.ts`; and three Phase 1D test files.

Updated: existing reader/monitor/controller association hooks, Chrome API typings, manifest, build/package checks, phase documentation/copy; investigation route data support; shared signal kinds; and the signal component's conditional quotation rendering. No website CSS, main investigation markup, navigation, dashboard, analyzer, agent-card or Courtroom redesign is included.

Automated coverage includes note levels/placement, duplicates, DOM replacement, edits, chat switching, disable cleanup, trusted-click behavior, exact selected-case handoff, new-tab URL privacy, schema and origin rejection, single-use concurrent claims, expiry/retention, worker recreation, blocked/missing storage, actual website investigation rendering and all four existing agent cards. Run the commands above to reproduce tests, type checks and builds.

WhatsApp DOM hooks remain unofficial. New layouts, fixed/virtualized positioning, unsupported flow containers, identical conversation labels and fallback-ID limitations may prevent notes. The extension chooses missing notes over a guessed placement. WhatsApp may remove extension DOM during rerenders; normal subsequent extraction reconciles it. Always reload WhatsApp Web after installing/reloading the extension. Real positioning, keyboard focus, Chrome permission prompts, service-worker lifecycle and live handoff still require the manual checks above.
