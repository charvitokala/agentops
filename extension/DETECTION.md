# Phase 1C · Local BFSI assessments

The engine checks English text and URL patterns locally. It does not establish fraud, verify senders or evidence, visit URLs, or run AI agents. All results say **Preliminary rule-based assessment**.

## Data flow

```text
Existing DOM reader → existing monitor → AssessmentPipeline
  → analyzeMessage({ id, text, urls }) → local extension messaging → debugging view
```

`src/detection/` has no Chrome, DOM, storage, or networking dependencies. Its input is a type-only `Pick` of the existing `ExtractedMessage`. The result contains the original message ID, risk level/score, category, signals, short explanation, recommendations, timestamp, and `analysisMethod: "local_rules"`.

The controller enriches raw snapshots with assessments. The pipeline compares each current message's text and normalized URL set. Unchanged messages, duplicate IDs and URL reordering do not trigger re-analysis. Text/URL edits do. Changing conversations, leaving a supported conversation, virtualizing messages out of the DOM, or disabling monitoring removes corresponding cached results. Reconnecting the debugging view uses the cache. Ordinary monitoring assessments and chat histories are not persisted. Phase 1D temporarily retains only explicitly selected handoff cases as documented in HANDOFF.md.

## Scoring

Weights and thresholds are centralized in `src/detection/rules.ts`.

| Signal                                                   | Weight |
| -------------------------------------------------------- | -----: |
| Explicit private-code/password/card disclosure request   |     45 |
| UPI PIN requested to receive money                       |     45 |
| Account-blocking threat                                  |     25 |
| KYC or bank-account verification request                 |     15 |
| URL features requiring checking, capped once per message |     25 |
| Bank/security-team identity claim                        |     10 |
| Guaranteed or unusually high investment returns          |     35 |
| Risk-free investment promise                             |     25 |
| Upfront loan processing/release payment                  |     35 |
| Guaranteed loan approval                                 |     20 |
| Payment required to receive a refund                     |     40 |
| QR scan or collect approval presented as receiving money |     35 |
| Insurance benefits release fee                           |     35 |
| Immediate policy cancellation threat                     |     25 |
| Pressured insurance renewal payment                      |     20 |
| Additional urgency alongside another indicator           |     10 |

Scores cap at 100. High begins at 60, medium at 30, and low at 1. Zero normally means insufficient evidence. A deliberate exception is a recognizable routine statement notice or protective-code warning: these receive **Low indicators**, score 0, and explicit unverified-safety wording. This exception does not subtract actual indicators in other clauses. Empty, keyword-only and vague banking messages remain insufficient evidence.

Scores are heuristic severity points, **not fraud probabilities**, percentages, calibrated confidence or empirically validated thresholds. A bare OTP disclosure request scores 45 (medium); adding a bank identity claim and urgency gives 65 (high). Merely mentioning bank, KYC, OTP or UPI cannot produce high risk.

Each overlapping group contributes its strongest match once: sensitive requests; KYC/account verification; investment guarantees/risk-free promises; policy pressure; related advance payments; and QR/collect receive-money instructions. QR/collect wording is suppressed when it describes the same PIN-to-receive instruction. Account/policy threats already include pressure, so generic urgency is not added again. Repeated phrases never multiply the same rule's weight. Recommendations are deduplicated.

Categories are `banking`, `kyc`, `credentials`, `upi`, `investment`, `loan`, `insurance`, or `unknown`. The strongest specific mechanism takes precedence over generic banking wording. Categories name matched topics, not proven scams. URL-only results may remain unknown.

## Context and URL checks

- Disclosure rules need a nearby request verb and sensitive term. Negation is checked at each action: “Never share your OTP”, “Don't send your PIN” and “We will not ask you to send your OTP” do not become credential requests. A protective sentence does not hide an actual request in a later clause.
- Credential entry needs a password/card request pointing to a link, form or website. Ordinary instructions to sign into a usual banking app do not count as disclosure requests.
- Loan/refund/insurance fees need a payment instruction and related financial context. QR/collect/PIN rules require receiving-money wording. Generic urgency alone is not scored.
- URLs use the standard parser locally. Features include shortened links, numeric IP hosts, punycode, simple financial-name lookalikes, financial names in subdomains, sign-in/verification bait in domain names, long subdomain chains, and HTTP in financial context. Multiple features/URLs still contribute only 25 points.
- Shortener names and illustrative financial-name cues are pattern vocabulary, **not official-bank or malicious-domain lists**. Unfamiliar domains alone are not flagged. The country-suffix exception is structural, not an authoritative public-suffix/ownership lookup. All URL explanations say the feature is an indicator, not proof of fraud.
- HTTP(S)/`www` links in text supplement the reader's supplied URL list. No link is fetched, resolved, visited, reputation-checked, or automatically opened.

## Checks and manual work

```bash
npm run typecheck
npm test
npm run build
npm run check:package
```

Tests include the requested BFSI cases, protective advice, score boundaries, overlaps, URL features, associations, caching, duplicates, edits, conversation changes, monitoring-off behavior, safe UI rendering, and the actual fixture reader/controller/debugging flow. Existing Phase 1B reader/observer tests remain in the suite.

After building, reload the unpacked extension and WhatsApp Web. Enable monitoring and use the debugging view to check current-message results, edits, chat switches and clearing. Phase 1D now adds inline safety notes and selected-case More Info navigation; see [HANDOFF.md](HANDOFF.md). The rules engine itself is unchanged. Live WhatsApp Web testing remains manual; no successful live test is claimed.

## Limitations and likely false positives

English phrases, short local context windows, static vocabulary and unvalidated weights cannot capture every scam. Other languages, obfuscation, voice/images, context across messages and novel wording can be missed. Reported speech, educational examples, legitimate payment flows, renewal reminders, lawful processing fees, fixed-return products and genuine short/IDN links may trigger false positives. The numerical return cutoffs are initial tuning assumptions, not financial advice.

Negation handling covers common local phrases, not complete grammar or all quoted speech. Phase 1B's DOM, conversation-identity and fallback-ID limitations still apply. Only the rendered window is assessed. No result proves that a sender, claim, domain, loan, investment or policy is legitimate. Low indicators and insufficient evidence are never safety guarantees.
