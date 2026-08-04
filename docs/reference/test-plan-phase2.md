# Phase 2 Test Plan (Test List) — Entrypoint Wiring (Popup Entry Point on Tabelog)

Phase 2 Test Plan for Canon TDD implementation of the **import2gmap Chrome Extension** entrypoint layer: the wiring that makes the popup entry point actually appear/work on the Tabelog PC saved-list page, using the Phase 1 domain modules (already implemented) as building blocks.

Related: [ADR-0004](../explanation/adr/0004-extension-implementation-baseline.md), [ADR-0006](../explanation/adr/0006-wxt-framework-adoption.md), [ADR-0007](../explanation/adr/0007-wxt-react-popup-ui-framework.md), [wxt-architecture-design](../explanation/wxt-architecture-design.md), [UI spec](extension-ui-specifications.md), [messaging protocol](extension-messaging-protocol.md), [session schema](extension-session-storage-schema.md), [error codes](extension-error-codes.md), [sequences](extension-extract-confirm-sequences.md), [Phase 1 test plan](test-plan-phase1.md).

Phase 1 covered pure domain logic (parser, KML, session guard, UI reducer). Phase 2 covers the **thin entrypoint wrappers** (`entrypoints/*`) that connect that domain logic to real Chrome APIs, per the "Entrypoints are thin wrappers ... mock `wxt/storage` and `wxt/browser` at the infrastructure boundary" testing strategy in the architecture design.

---

## Module 5: Tab Context Detector (`src/application/tab-context-detector.ts`)

No content-script injection happens just to render the popup ([UI spec §2 implementation note](extension-ui-specifications.md#2-context-detection-on-popup-open)); detection is a pure `tab.url` match against [extraction spec §2](tabelog-pc-saved-list-extraction-spec.md#2-page-detection) steps 1–2 only.

- [ ] **5.1 URL Pattern Matching**
  - [ ] `https://tabelog.com/rvwr/{id}/hozon_restaurants/list` → `ready`
  - [ ] `https://www.tabelog.com/rvwr/{id}/hozon_restaurants/list/` (trailing slash) → `ready`
  - [ ] Same path with query string (e.g. `?PG=2`) → `ready`
  - [ ] `https://tabelog.com/rvwr/{id}/` (Tabelog, not saved-list path) → `wrong_tabelog_page`
  - [ ] `https://example.com/` (non-Tabelog host) → `wrong_tab`
  - [ ] `undefined` / no active tab URL → `wrong_tab`

---

## Module 6: Messaging Type Guards (`src/domain/messaging/message-types.ts`)

Discriminated-union guards per [messaging protocol](extension-messaging-protocol.md). No `any` at message boundaries; unknown `type` and `protocolVersion` mismatch are rejected before any domain logic runs.

- [ ] **6.1 Popup → Worker**
  - [ ] Accepts each documented `type` (`GET_UI_STATE`, `EXTRACT_START`, `EXTRACT_CANCEL`, `UI_STEP_SET`, `EXTRACT_DISCARD`, `MAP_NAME_SET`, `IMPORT_START`, `IMPORT_CANCEL`, `ERROR_RETRY`) with its required fields.
  - [ ] Rejects an unknown `type` string.
  - [ ] Rejects `protocolVersion !== 1` → caller maps to `ProtocolMismatch`.
  - [ ] `EXTRACT_CANCEL` / `IMPORT_CANCEL` require non-empty `jobId`.
- [ ] **6.2 Worker → Content (Tabelog)**
  - [ ] Accepts `TAB_EXTRACT_PAGE`, `TAB_CLICK_NEXT`, `TAB_ABORT` with `jobId`.
  - [ ] Accepts `TAB_PAGE_RESULT`, `TAB_NEXT_RESULT` (`kind: "navigating" | "no_next"`), `TAB_EXTRACT_FAILED`.
- [ ] **6.3 Worker → Popup**
  - [ ] Accepts `UI_STATE`, `EXTRACT_PROGRESS`, `EXTRACT_SUCCEEDED`, `EXTRACT_FAILED`, `EXTRACT_CANCELLED`, `IMPORT_PRELUDE_FAILED`, `IMPORT_PRELUDE_STARTED`.

---

## Module 7: Background Message Router (`src/application/message-router.ts`)

Pure function `route(state: SessionRoot, tabContext, message) → { patch: Partial<SessionRoot>, reply?: WorkerMessage, tabCommand?: TabCommand }`. No direct `chrome.*` calls — `entrypoints/background.ts` is the thin wrapper that calls this and performs the actual storage/scripting/messaging side effects.

- [ ] **7.1 `GET_UI_STATE`**
  - [ ] No session, tabContext `ready` → reply `UI_STATE` with `uiStep: "ready"`.
  - [ ] `activeJob.kind === "extract"` present → reply `UI_STATE` with `uiStep: "extracting"` and current `progress`.
  - [ ] `extractResult` present, `uiStep: "confirm"` → reply `UI_STATE` with `uiStep: "confirm"`, `shopCount`, `collectionCount`.
  - [ ] `lastError` present → reply `UI_STATE` with `uiStep: "error"` and the stored error.
- [ ] **7.2 `EXTRACT_START`**
  - [ ] From `ready` → patch creates `activeJob` (`kind: "extract"`, new `jobId`), returns a `tabCommand` to inject + send `TAB_EXTRACT_PAGE`.
  - [ ] From any other `uiStep` → no-op (ignored; documented transition table only allows `ready` → `extracting`).
- [ ] **7.3 `EXTRACT_CANCEL`**
  - [ ] Clears `activeJob`, does **not** write `extractResult`, replies `EXTRACT_CANCELLED`.
- [ ] **7.4 `TAB_PAGE_RESULT` / `TAB_NEXT_RESULT` (worker-side merge, via content script reply path)**
  - [ ] Merges `shops`/`catalogDelta` into in-memory accumulator, updates `activeJob.progress`.
  - [ ] `kind: "no_next"` + completeness OK → writes `extractResult`, `uiStep: "extract_complete"`, replies `EXTRACT_SUCCEEDED`.
  - [ ] `kind: "no_next"` + count mismatch → `lastError.code = "IncompleteCrawl"`, `uiStep: "error"`, replies `EXTRACT_FAILED`.
- [ ] **7.5 `UI_STEP_SET`**
  - [ ] `extract_complete` → `confirm` allowed.
  - [ ] `confirm` → `extract_complete` allowed (**戻る**).
  - [ ] Any other requested transition → ignored (only the two documented ones are valid).
- [ ] **7.6 `EXTRACT_DISCARD`**
  - [ ] Clears `extractResult`, sets `uiStep: "ready"`.
- [ ] **7.7 `MAP_NAME_SET`**
  - [ ] Updates `mapName` in session patch (sanitized, empty allowed pre-import; enforced at `IMPORT_START`).
- [ ] **7.8 `IMPORT_START`**
  - [ ] No `extractResult` → replies `IMPORT_PRELUDE_FAILED` with `NoExtractResult`.
  - [ ] Empty/whitespace `mapName` after sanitize → replies `IMPORT_PRELUDE_FAILED` with `InvalidMapName`.
  - [ ] Valid → `activeJob` (`kind: "import"`), `uiStep: "import_starting"`, `tabCommand` to open/focus My Maps tab.
- [ ] **7.9 `ERROR_RETRY`**
  - [ ] `lastError.retryStep === "extract"` → routes as a fresh `EXTRACT_START` from `ready`.
  - [ ] `lastError.retryStep === "import"` → routes as a fresh `IMPORT_START`.
  - [ ] `lastError.retryStep === "none"` → transitions to `ready` only.
- [x] **7.10 `IMPORT_START` idempotency guard — added 2026-08-04** (bugfix: the popup permission prompt closes the popup before it can `await` the grant, so a resumed job and a surviving popup's own `IMPORT_START` can both fire; see Module 19)
  - [x] An `IMPORT_START` while `state.activeJob` is already set (either `kind`) → no-op (`{ patch: {} }`), same shape as the existing `EXTRACT_START` guard.
- [x] **7.11 `PERMISSION_REQUEST_PENDING` / `PERMISSION_REQUEST_CANCELLED` — added 2026-08-04** (see Module 19 for why these exist)
  - [x] `PERMISSION_REQUEST_PENDING` with `step: "extract"` → patches `pendingPermission: { step: "extract", requestedAt: now() }`.
  - [x] `PERMISSION_REQUEST_PENDING` with `step: "import", mapName` → patches `pendingPermission: { step: "import", mapName, requestedAt: now() }`.
  - [x] `PERMISSION_REQUEST_CANCELLED` → patches `pendingPermission: undefined`.
  - [x] A successful `EXTRACT_START` or `IMPORT_START` patch always includes `pendingPermission: undefined` (clears any intent that was recorded before the permission prompt), even when no `pendingPermission` was set.

---

## Module 8: Tabelog Content Script Message Handling (`entrypoints/tabelog.content.ts`)

Thin wrapper delegating to the already-tested `TabelogSavedListParser` (Phase 1, Module 1). Uses existing fixtures under `test/fixtures/tabelog/`.

- [ ] **8.1 `TAB_EXTRACT_PAGE`**
  - [ ] On `saved-list-single-page.html` → replies `TAB_PAGE_RESULT` with parsed `shops`, `catalogDelta`, `pageMeta`.
  - [ ] On `not-saved-list.html` → replies `TAB_EXTRACT_FAILED` with `code: "NotSavedListPage"` (no throw across the message boundary).
  - [ ] Any other parser error (`AddressMissing`, `SelectorDrift`, etc.) → mapped 1:1 to `TAB_EXTRACT_FAILED` with the matching code.
- [ ] **8.2 `TAB_CLICK_NEXT`**
  - [ ] Next-page arrow present → replies `TAB_NEXT_RESULT` `{ kind: "navigating" }` and triggers navigation.
  - [ ] Next-page arrow absent → replies `TAB_NEXT_RESULT` `{ kind: "no_next" }`.
  - [ ] **2026-08-02 bugfix note**: this handler already gets the ordering right (`sendResponse` before the navigating click), but `entrypoints/background.ts` was not re-injecting the content script into the new document after the resulting navigation — every `TAB_EXTRACT_PAGE` past page 1 was sent to a torn-down execution context. Multi-page saved lists were broken (not previously caught because only a single-page list had been manually tested). Fixed in `runExtractJob` via `ensureContentScript`, tracked in [Phase 3 test plan Module 17](test-plan-phase3.md#module-17-background-navigation-safe-orchestration-bugfix-entrypointsbackgroundts) since the fix lives in the background entrypoint, not here.
- [ ] **8.3 `TAB_ABORT`**
  - [ ] After abort, the content script does not reply to further messages carrying the same `jobId`.

---

## Module 9: Popup Screen View-Model (`src/application/popup-view-model.ts`)

Per architecture design, the popup (`entrypoints/popup/App.tsx`) stays presentation-only. To keep it testable without adding a component-testing library, the **mapping from `UiStateSnapshot` to renderable screen props** is a pure function, unit-tested directly; the React component itself only renders those props (no independent branching logic to test).

- [ ] **9.1 Screen selection**
  - [ ] `uiStep: "ready"` → screen `ready`, 抽出する enabled.
  - [ ] `uiStep: "wrong_tab" | "wrong_tabelog_page"` → screen `wrong_context`, 抽出する disabled, correct guidance message per code.
  - [ ] `uiStep: "extracting"` → screen `extracting` with progress text (page/total or collected-count-only when total unknown).
  - [ ] `uiStep: "extract_complete"` → screen `extract_complete` with `shopCount` / optional collection subline; no auto-advance flag.
  - [ ] `uiStep: "confirm"` → screen `confirm` with shop count, collection count (`collectionsCatalog` unique ids, not distinct-on-shops), default/editable map name.
  - [ ] `uiStep: "import_starting"` → screen `import_starting`.
  - [ ] `uiStep: "error"` → screen `error` with `code`, `message`, and which primary action (再試行 vs ready) per `retryStep`.
- [ ] **9.2 Non-goals stay inert**
  - [ ] View-model never includes a shop list array, a color picker field, or a KML-download action (v1 non-goals per [UI spec §8](extension-ui-specifications.md#8-non-goals-v1-ui)).

---

## Module 10: `wxt.config.ts` Manifest

Declarative; verified by build/manual load rather than Vitest unit tests (WXT config is not a runtime module under test).

- [ ] **10.1** `npm run build` produces a manifest with `action.default_popup`, `permissions: ["storage", "activeTab", "scripting"]`, and `optional_host_permissions` for Tabelog + Google Maps (checked via `output/*/manifest.json` inspection, not Vitest).
- [ ] **10.2** Manual smoke test: load unpacked build, open a Tabelog PC saved-list tab, confirm the popup shows `ready` and 抽出する is enabled (this is the check that closes the original "動線が出来ていない" report).

---

## Module 19: Permission-Prompt-Kills-Popup Resume — added 2026-08-04

**Bug**: Chrome's optional-host-permission confirmation dialog takes focus and destroys the popup's execution context. `handleExtractStart` / `handleImportStart` in `entrypoints/popup/App.tsx` were `await`ing `browser.permissions.request(...)` and then sending `EXTRACT_START` / `IMPORT_START` — a line that never ran once the popup died, so nothing happened until the user pressed the button again (by which point the permission was already granted and the second press worked, which is exactly the "press it twice" symptom). Fix: the popup records the pending intent in session storage (Module 7.11) **before** calling `permissions.request()`, and the service worker resumes the job itself from `browser.permissions.onAdded`, since the worker survives the popup's death.

Related: [messaging protocol](extension-messaging-protocol.md) (`PERMISSION_REQUEST_PENDING` / `PERMISSION_REQUEST_CANCELLED`), [session schema](extension-session-storage-schema.md) (`pendingPermission`), [UI spec §7](extension-ui-specifications.md#7-permissions-ux), [error codes](extension-error-codes.md) (`NotSavedListPage`, `WrongTab`).

- [x] **19.1 `isPendingPermissionFresh` (`src/domain/session/pending-permission.ts`)** — pure TTL predicate, unit-tested directly.
  - [x] `now - pendingAt <= ttlMs` → `true` (fresh; boundary inclusive).
  - [x] `now - pendingAt > ttlMs` → `false` (expired).
- [x] **19.2 `routePermissionGranted` (`src/application/message-router.ts`)** — pure function called by the worker's `permissions.onAdded` handler; never invoked by a bare `onAdded` with no recorded intent (an unrelated hand-grant from `chrome://extensions` must not auto-start a job, per ADR-0003's explicit-start rule).
  - [x] No `pendingPermission` recorded → no-op (`{ patch: {} }`); the wrapper only calls this once it has already confirmed a pending intent exists and the required origins are `contains()`-satisfied.
  - [x] `pendingPermission` older than the TTL → clears it (`pendingPermission: undefined`), starts nothing.
  - [x] `step: "extract"`, active tab is the Tabelog saved list (`tabContext: "ready"`) → starts the extract job exactly like a fresh `EXTRACT_START` (same `tabCommand`), clears `pendingPermission`.
  - [x] `step: "extract"`, active tab is Tabelog but not the saved list (`tabContext: "wrong_tabelog_page"`) → explicit `error` with `NotSavedListPage`, clears `pendingPermission`. **No silent no-op** (ADR-0003).
  - [x] `step: "extract"`, active tab is not Tabelog at all (`tabContext: "wrong_tab"`) → explicit `error` with `WrongTab`, clears `pendingPermission`.
  - [x] `step: "import"` with a recorded `mapName` → starts the import job exactly like a fresh `IMPORT_START` (same `tabCommand`), clears `pendingPermission`.
  - [x] A job already active (either kind) when the intent resolves → no-op via the same idempotency guards as 7.2/7.10, but `pendingPermission` is still cleared (the intent was consumed, not silently forgotten in storage).
- [x] **19.3 Worker wiring (`entrypoints/background.ts`, thin wrapper — not unit-tested, same convention as Module 17)**
  - [x] Registers `browser.permissions.onAdded`; on fire, reads the session, and only proceeds if `pendingPermission` is set.
  - [x] Re-checks `browser.permissions.contains({ origins: <required for pending.step> })` rather than trusting the event's own `origins` delta (an already-partially-granted origin set can make the delta a strict subset of what the step actually needs).
  - [x] Resolves the active tab the same way `handlePopupMessage` does (`getActiveTab()` → `detectTabContext`) before calling `routePermissionGranted`, so the `NotSavedListPage` / `WrongTab` resume-time check (19.2) has real tab data.
  - [x] Dispatches the resulting `tabCommand` (`runExtractJob` / `runImportJob`) the same way `handlePopupMessage` does; both entry points share one `applyRouteResult` helper.
- [x] **19.4 Idempotent double-fire (manual reasoning check, not separately unit-tested beyond 7.10/19.2)**: if the popup happens to survive the prompt (permission was already granted, no dialog shown) and sends `EXTRACT_START`/`IMPORT_START` itself, and `onAdded` also fires for an unrelated reason, both paths are safe to run — the second one always observes `activeJob` already set and no-ops.

---

## Module 20: Return to Page 1 Before Crawl — added 2026-08-05

**Bug** (user report, real-DOM evidence captured on a failing `PG=3` page): `runExtractJob`'s crawl only follows 「次の20件」 forward from wherever the user's tab happens to be. If the user presses 抽出する while sitting on page 2+ of the saved list, the crawl collects fewer shops than the page's declared total (`.c-page-count`'s `全 N 件`) and fails with `IncompleteCrawl`, even though a full crawl from page 1 would have succeeded. Fix: a bounded prelude that detects "not on page 1" and navigates back to page 1 before the existing forward-crawl loop runs.

- [x] **20.1 `TabelogSavedListParser#isBeyondFirstPage`** — pure decision, unit-tested against jsdom fixtures built from the evidence markup.
  - [ ] `.c-page-count` present with `from > 1` → `true`.
  - [ ] `.c-page-count` present with `from === 1` → `false`.
  - [ ] `.c-page-count` absent, `a.c-pagination__arrow--prev` present → `true` (corroborating signal).
  - [ ] `.c-page-count` absent, no prev arrow, `strong.c-pagination__num.is-current` text `!== '1'` → `true` (second corroborating signal).
  - [ ] `.c-page-count` absent and no corroborating signal at all → `false` — defaults to "assume page 1", matching the crawl's pre-existing behavior (never a new regression when pagination chrome is genuinely absent, e.g. a true single-page list).
- [x] **20.2 `TabelogSavedListParser#findFirstPageLink` / `#findPrevPageLink`** — pure element lookup, unit-tested.
  - [ ] `findFirstPageLink` returns the `a.c-pagination__num` element whose **trimmed text is exactly `'1'`** (never a substring match against e.g. `'10'`, `'21'`).
  - [ ] `findFirstPageLink` returns `undefined` when no such link is rendered (windowed pagination on long lists, e.g. `… 20 21 22 …` — the evidence file's documented caveat).
  - [ ] `findPrevPageLink` returns the `a.c-pagination__arrow--prev` element when present, else `undefined`.
- [x] **20.3 `handleTabGoToFirstPage` (`src/domain/parser/tabelog-extract-handler.ts`)** — pure handler, mirrors `handleTabClickNext`'s reply-then-navigate contract.
  - [ ] Not a saved-list page → `TAB_EXTRACT_FAILED` `code: 'NotSavedListPage'`.
  - [ ] Already on page 1 (`isBeyondFirstPage` false) → `TAB_FIRST_PAGE_RESULT` `{ kind: 'already_first' }`, no click triggered.
  - [ ] Not on page 1, `findFirstPageLink` present → `TAB_FIRST_PAGE_RESULT` `{ kind: 'navigating' }` (worker/content script click the "1" link).
  - [ ] Not on page 1, no "1" link but `findPrevPageLink` present (windowed pagination) → `TAB_FIRST_PAGE_RESULT` `{ kind: 'navigating' }` (falls back to the prev arrow — see design note below).
  - [ ] Not on page 1, neither link present → `TAB_EXTRACT_FAILED` `code: 'SelectorDrift'` (page structure drifted from what this feature depends on; reuses the existing generic "page structure differs" code rather than adding a narrow one-off, per KISS).
- [x] **20.4 Messaging type guards (`src/domain/messaging/message-types.ts`)**
  - [ ] `isWorkerToContentMessage` accepts `TAB_GO_TO_FIRST_PAGE` with a `jobId`.
  - [ ] `isContentToWorkerMessage` accepts `TAB_FIRST_PAGE_RESULT` with `kind: 'already_first' | 'navigating'`; rejects an invalid `kind`.
- [x] **20.5 Content script wiring (`entrypoints/tabelog.content.ts`, thin wrapper, not separately unit-tested — same convention as `TAB_CLICK_NEXT` / Module 8.2)**: on `TAB_GO_TO_FIRST_PAGE`, replies first (§20.3), then — only if `kind: 'navigating'` — clicks the "1" link if present, else the prev arrow.
- [x] **20.6 Worker orchestration (`entrypoints/background.ts`, not unit-tested — same convention as Phase 3 Module 17)**: `runExtractJob` runs a bounded `returnToFirstPage` prelude (reusing `waitForNavigation` / `ensureContentScript`, the same capture-URL-before-send / reply-before-navigate discipline as `TAB_CLICK_NEXT`) before the existing forward-crawl loop; caps at `MAX_RETURN_TO_FIRST_PAGE_STEPS` round trips, failing explicitly with `ReturnToFirstPageFailed` (new code, [error codes](extension-error-codes.md)) if that bound is exceeded without ever reaching `already_first`.

**Design note — windowed-pagination fallback**: on long saved lists Tabelog windows the page-number links (e.g. `… 20 21 22 …`), so the numbered "1" link this feature prefers (per the user's own DOM evidence) is not always rendered. Rather than synthesizing a `PG=1` URL — which the extraction spec already permits for *forward* crawling (§5.3) but which this feature avoids per the project's "never anchor on positional indices or hashed classes" rule, since it would mean guessing at query-string shape instead of reading a link's own semantics — the fallback repeatedly follows the prev arrow, the same click-and-reinject mechanism `TAB_CLICK_NEXT` already uses for forward crawling, one page at a time until either the "1" link comes into view (as the window shifts toward page 1) or `isBeyondFirstPage` reports `false`. Bounded by `MAX_RETURN_TO_FIRST_PAGE_STEPS` so a genuine drift can't loop forever.

## Module 21: Error Screen — Return-to-Tabelog Guidance — added 2026-08-05

User-requested addition: when extraction fails, the popup's error screen should additionally ask the user to open/return to the Tabelog 保存リストページ before retrying — a **message requesting navigation**, not automatic navigation. Scoped to extraction failures only (`retryStep: 'extract'`); an import-step failure must not show it.

- [x] **21.1 `buildScreenViewModel` (`src/application/popup-view-model.ts`)** — the `error` screen view model carries `retryStep` (in addition to the existing derived `canRetry`), so the popup can distinguish an extract failure from an import failure without re-deriving it from the raw code.
- [x] **21.2 `entrypoints/popup/App.tsx` (thin wrapper, not unit-tested — same convention as Module 9's React boundary)**: the `error` screen renders one extra short guidance line only when `view.retryStep === 'extract'`.

---

## Out of scope for Phase 2

- My Maps content script (`mymaps.content.ts`) DOM automation — gated by the ADR-0004 spike; only the `IMPORT_START` prelude (Module 7.8) is covered here.
- Full React component rendering/interaction tests (no `@testing-library/react` added yet) — covered indirectly via Module 9's view-model tests plus the Module 10.2 manual smoke test.
