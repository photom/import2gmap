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

## Out of scope for Phase 2

- My Maps content script (`mymaps.content.ts`) DOM automation — gated by the ADR-0004 spike; only the `IMPORT_START` prelude (Module 7.8) is covered here.
- Full React component rendering/interaction tests (no `@testing-library/react` added yet) — covered indirectly via Module 9's view-model tests plus the Module 10.2 manual smoke test.
