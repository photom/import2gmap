# ADR-0004: Extension Implementation Baseline

- **Status**: Accepted
- **Date**: 2026-07-28
- **Authors**: User & Agent
- **Related**: [ADR-0003](0003-chrome-extension-my-maps-web-import.md), [decision checklist](../chrome-extension-decision-checklist.md)

## Context & Problem Statement

ADR-0003 chose a desktop Manifest V3 Chrome extension with TypeScript, PC saved-list extraction, in-memory KML, and My Maps Web UI import. Before scaffolding code, the project still needed concrete defaults for permissions, UX, toolchain, data handoff, and the My Maps feasibility gate so implementation does not thrash.

## Decision Drivers & Constraints

- Minimal permissions and user-visible consent (Store / trust).
- Align with existing skills (`chrome-extension-development`, `typescript-webextension`, `tdd-webextension`).
- Canon TDD: pure TypeScript + sanitized fixtures before UI automation.
- Keep the repository extension-only (Android path abandoned).

## Considered Options

1. **Always-on content scripts + static `host_permissions`** — simple, but broader standing access.
2. **Programmatic injection + `optional_host_permissions`** — access granted when the user starts a flow.
3. **One-click extract+import** — fewest clicks, weak confirmation and harder error recovery.
4. **Stepped popup (extract → confirm → import)** — clearer control and progress.

## Decision Outcome

### 1. Permissions & content-script injection

- **Chosen**: Programmatic injection via `chrome.scripting.executeScript` (no always-on `content_scripts` in manifest for v1).
- **Permissions**: `storage`, `activeTab`, `scripting`.
- **Optional hosts** (request when the user starts extract/import): narrow patterns for Tabelog PC site and Google Maps / My Maps Web UI (e.g. `https://tabelog.com/*`, `https://www.google.com/maps/*`). No `cookies`, no `<all_urls>`, no remote code.
- **Not in v1**: `downloads` (no KML file export UI).
- **2026-08-02 addendum (user-approved)**: added `https://docs.google.com/picker*` (path-narrowed, not the whole `docs.google.com` origin) to `optional_host_permissions`. The My Maps KML import dialog turned out to be a cross-origin `docs.google.com/picker` iframe (missed in the original Section 6 spike — see the [spike results addendum](../my-maps-import-spike-results.md)), and `scripting.executeScript` into a frame requires host permission for that frame's origin. Requested together with the existing `https://www.google.com/maps/*` in a single `browser.permissions.request` call at import start. Still no `cookies`, no `downloads`, no Drive API/OAuth — the picker's upload posts directly to My Maps, not a Drive API call.

### 2. UX flow & tab premise

- **Chosen**: Stepped popup — **Extract → Confirm (count / summary) → Import**.
- **Tab premise**: User must already have the PC saved-list page open in a tab; the extension does not invent reviewer URLs or log the user in.
- **Map / layer naming**: Default `食べログ保存リスト YYYY-MM-DD`, editable on the confirm/import step before import runs.
- **Progress**: Show pager crawl progress; support **Cancel** during extract.
- **Failures**: Show stable error code + short message; offer **Retry** for the failed step (extract or import).

### 3. Toolchain & repository shape

- **Package manager & Framework**: npm + **WXT** (`wxt.dev`) for development, bundling, entrypoint management, and testing ([ADR-0006](0006-wxt-framework-adoption.md)).
- **Bundler & Tests**: Vite + Vitest for domain/parsers with sanitized HTML fixtures (Canon TDD). Browser E2E deferred.
- **Distribution**: Load unpacked for development; Web Store packaging deferred.
- **Repository**: Chrome-extension-only. Remove Android/Gradle app scaffold (`app/`, root Gradle wrapper files, Android IDE crumbs as applicable).

### 4. Extracted data handoff

- **Chosen**: Persist extract results in `chrome.storage.session` for the extract → confirm → import path (survives popup close; cleared with the browser session).
- Do not use `chrome.storage.local` for shop lists in v1.
- KML is built in memory from session data at import time; not written to disk by default.

### 5. Pager & messaging (baseline)

- Pager crawl follows the PC extraction spec: same-tab navigation via next-page control / `PG` links; DOM only (no HTML `fetch` scrape).
- Typed message protocol between popup ↔ service worker ↔ content scripts for start / progress / result / error / cancel (see `typescript-webextension`).

### 6. My Maps feasibility spike — pass criteria (gate before import implementation)

Spike passes only if all of the following are demonstrated with sanitized fixtures / manual notes:

1. Detect My Maps Web UI in a user-authenticated session; if logged out, fail with an explicit code (no credential prompts from the extension).
2. Create a **new** map (v1 scope; existing-map picker deferred).
3. Feed in-memory KML into the import UI (e.g. file input / Blob) and observe a bounded success signal.
4. Any unexpected DOM/UI → `MyMapsUiChanged` (or equivalent) within timeouts; no silent partial import marked success.
5. Short written note on Chrome Web Store / target-site policy risk attached to the spike outcome.

**Spike outcome**: Passed 2026-08-02. See [My Maps import spike results](../my-maps-import-spike-results.md) for selectors, detection rules, and the policy note.

## Consequences

- **Positive**: Clear scaffold defaults; smaller permission surface; testable domain layer; explicit My Maps gate.
- **Trade-offs**: Optional-host prompts add a consent step; same-tab pager crawl is slower and must handle navigation races; Android removal discards unused native tree; Store/E2E still future work.
