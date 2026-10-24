# VerdictAI Guardian · Phase 1A

A locally runnable frontend for preliminary financial scam message assessments. Built with Next.js App Router, strict TypeScript, Tailwind CSS, React, and Lucide React. Classic Apple-inspired solid surfaces, a light `#F5F5F7` canvas, and black primary buttons.

## Run locally

Use Node.js 22.18+ (Node 24 LTS recommended) and npm:

```bash
cd /Users/charvitokala/Desktop/agentops
npm install
npm run dev
```

Open http://localhost:3000. No environment variables, API keys, accounts, or database setup are needed.

```bash
npm run lint
npm run typecheck
npm test
npm run build
npm start
```

`npm test` runs deterministic rule and local storage tests using Node's built-in TypeScript stripping and test runner. The tests require no installed dependencies.

## Routes

- `/` — dashboard, metrics derived from the four fictional cases, recent investigations, courtroom preview, future extension information.
- `/demo` — sample selector, editable input, 650ms simulated loading state, actual local rule-based insights, recommended actions, detailed investigation navigation.
- `/investigation/demo-kyc-001` — high-risk KYC example.
- `/investigation/demo-otp-002` — high-risk OTP example.
- `/investigation/demo-investment-003` — medium-risk investment example.
- `/investigation/demo-statement-004` — low-indicator notification; never confirmed safe.
- `/investigation/local-<uuid>` — custom message assessment loaded from this tab's session storage.
- Unknown routes and invalid case IDs show a not-found state. Missing custom records show a separate local-storage explanation.

## Code map

```text
src/app/             App Router pages, layout, error/loading states, design tokens
src/components/      Navigation, analyzer, investigation, reusable presentation components
src/lib/contracts.ts Transport-friendly interfaces for future integrations
src/lib/analysis.ts  Pure deterministic text rules; no network requests
src/lib/demo-cases.ts Four typed fictional cases and derived summary metrics
src/lib/local-investigations.ts Versioned tab-local storage with runtime validation
tests/               Rule, case, and storage behavior checks
```

## Real and simulated behavior

Navigation, text entry, sample selection, local matching rules, expandable sections, and tab-local custom investigations work in the frontend. The 650ms wait demonstrates a loading state; the underlying processing is local and deterministic. Sample dates and message texts are fictional; dashboard counts represent the sample collection, not live user activity.

No Chrome extension, WhatsApp integration, AI agents, backend APIs, database, sender verification, external evidence, citations, analytics, or message uploads are implemented. The four courtroom roles are explicitly marked **Coming in Phase 2**. Notes are generated from text rules and are not community-verified. A low-indicator result is not a safety guarantee.

## Privacy and integration boundaries

Custom content is never placed in URL query parameters. When opening a custom investigation, only the input and timestamp are written to `sessionStorage`; derived results are recomputed from validated input. Storage failures are shown in the analyzer. Reloading in the same retained tab works; closing the tab, clearing storage, or opening a link in a different session may make the record unavailable. Demo cases are always available without storage.

The shared interfaces use stable IDs, explicit statuses, and plain serializable fields. Future extension or backend adapters can produce these contracts without replacing the presentation components. No integration credentials or backend stubs are needed for this phase.

## Validation in the implementation environment

Dependency installation succeeded using a temporary offline cache reconstructed from npm packages already present on this Mac. No GitHub access was used. Strict TypeScript, ESLint, the production build, and all seven rule/storage tests passed. Next.js reports a non-blocking warning because the optional Next-specific ESLint plugin is not installed; the configured TypeScript/JavaScript ESLint rules still run and pass.

The offline-generated lockfile contained incomplete optional native dependencies for other platforms, so it was not retained. Run `npm install` with registry access to generate a complete lockfile on your machine. The project does not depend on the temporary cache after installation.

This environment rejects local port binding with `EPERM`, so `npm run dev` could not listen on port 3000. The in-app browser is also unavailable. Eight production request-handler checks passed in process without a listening server: dashboard, analyzer, all four demo investigations, HTTP 404 for an invalid case, and the initial loading state for a custom case. Rule/storage tests cover custom content preservation and missing records; browser interaction and visual checks remain manual.

## Manual review

Check desktop and mobile widths, keyboard focus, sample and custom analysis, expanding signal/agent descriptions, same-tab refresh, missing local storage, and a deliberately invalid case URL. The development server needs local port binding and Next.js dependencies. In an offline environment, dependency installation or the production build may be unavailable; consult the completion report for checks actually run.
