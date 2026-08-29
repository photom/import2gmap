# Phase 4 Test Plan (Test List) — Google Maps Saved-List Import (ADR-0008)

Phase 4 Test Plan for Canon TDD implementation of the **import2gmap Chrome Extension** Google Maps
native saved-list import path, replacing the deleted My Maps automation (Phase 3, removed).

Related: [ADR-0008](../explanation/adr/0008-google-maps-saved-list-import.md), [spike notes](../explanation/google-maps-saved-list-spike-notes.md), [messaging protocol §6](extension-messaging-protocol.md#6-service-worker--google-maps-content-script-adr-0008), [error codes §5](extension-error-codes.md#5-google-maps-saved-list-import-adr-0008), [Phase 1 plan](test-plan-phase1.md), [Phase 2 plan](test-plan-phase2.md).

Following the Phase 2/3 strategy: pure detection/parsing logic is unit-tested directly against
sanitized synthetic fixtures; `entrypoints/gmaps.content.ts` stays a thin wrapper delegating to it,
since live DOM timing against a real (undocumented, churn-prone) Google UI is not something a
fixture can safely stand in for.

---

## Module 19: Google Maps Detection Helpers (`src/domain/google-maps/google-maps-detectors.ts`)

- [x] **19.1 Menu button detection (`isMenuButton`)**
  - [x] Matches via the `settings.open` jsaction handler regardless of label text
  - [x] Matches the English `aria-label="Menu"` fallback
  - [x] Matches the Japanese `aria-label="メニュー"` fallback (unconfirmed translation, see spike notes)
  - [x] Rejects an unrelated button
- [x] **19.2 Saved menu item detection (`isSavedMenuItem`)**
  - [x] Matches via the `settings.yourplaces` jsaction handler
  - [x] Matches English/Japanese text fallback
  - [x] Rejects an unrelated menu item
- [x] **19.3 New list button detection (`isNewListButton`)**
  - [x] Matches via `data-value="New list"`
  - [x] Matches English/Japanese `aria-label` fallback
  - [x] Rejects an unrelated button
- [x] **19.4 Done button detection (`isDoneButton`)**
  - [x] Matches a jsaction handler ending in `.done` regardless of its per-instance numeric id
  - [x] Matches English/Japanese text fallback
  - [x] Rejects an unrelated button
- [x] **19.5 Back button detection (`isBackButton`)**
  - [x] Matches via the `omnibox.back` jsaction handler
  - [x] Matches English/Japanese `aria-label` fallback
  - [x] Rejects an unrelated button
- [x] **19.6 Untitled-list placeholder detection (`isUntitledListPlaceholder`)**
  - [x] Matches the known English/Japanese placeholder strings (least-confident bilingual guess in this module — see spike notes)
  - [x] Rejects a real list name
- [x] **19.7 List row metadata-line detection (`isListMetaLine`)**
  - [x] Matches a `Private/Shared · N places` middle-dot count line
  - [x] Rejects a plain name with no dot/count
  - [x] Rejects empty/null input

## Module 20: Saved Lists Pane Parser (`src/domain/google-maps/saved-lists-pane.ts`)

Sanitized synthetic fixtures under `test/fixtures/google-maps/` (no real account data — see the
[html-fixture-policy](html-fixture-policy.md) and the spike notes' privacy note).

- [x] **20.1 `findSavedListsPaneRoot`**
  - [x] Finds the pane by its tablist + New-list-button shape
  - [x] Returns `null` when no matching pane is present (a decoy `[role="main"]` alone isn't enough)
- [x] **20.2 `parseSavedListEntries`**
  - [x] Extracts every list row's name, in document order, skipping the New-list button itself
  - [x] Returns an empty array for a pane with no lists yet
- [x] **20.3 `hasListNamed`**
  - [x] `true` when the target list is present
  - [x] `false` when the target list is absent
  - [x] `false` for an empty pane

## Module 21: Message Types (`src/domain/messaging/message-types.ts`) — Google Maps additions

- [x] **21.1 `isWorkerToGoogleMapsMessage`**
  - [x] Accepts `GMAPS_ENSURE_LIST` with a `jobId` and `listName`
  - [x] Rejects it without a `listName`
  - [x] Rejects it without a `jobId`
- [x] **21.2 `isGoogleMapsToWorkerMessage`**
  - [x] Accepts an `ok: true` result with a `created` boolean; rejects one missing `created`
  - [x] Accepts an `ok: false` result with a `code`; rejects one missing `code`
  - [x] Rejects an unknown `type`

## Module 22: Message Router (`src/application/message-router.ts`) — import-step changes

Existing Phase 2 `route`/`routePermissionGranted` tests updated in place (no `mapName` field
anywhere; `IMPORT_START` carries no payload; `TabCommand.kind` is `ensure_saved_list`, not
`open_my_maps`) rather than added as new numbered tests — see `test/application/message-router.test.ts`.

- [x] **22.1** `IMPORT_START` fails with `NoExtractResult` when there is no extract result
- [x] **22.2** `IMPORT_START` starts the `ensure_saved_list` tab command when an extract result exists
- [x] **22.3** `IMPORT_START` is a no-op when a job is already active
- [x] **22.4** `routePermissionGranted` starts the `ensure_saved_list` job for a pending `import` step
- [x] **22.5** `ERROR_RETRY` with `retryStep: 'import'` retries via `ensure_saved_list`

## Module 23: Background Orchestration (`entrypoints/background.ts`, `runEnsureListJob`)

Not unit-tested, consistent with the entrypoint thin-wrapper convention already applied to
`runImportJob`'s predecessor and to `entrypoints/gmaps.content.ts` itself — browser-API side
effects (`tabs.create`, `scripting.executeScript`, `tabs.sendMessage`) aren't something a fixture
can safely stand in for. Verified instead by `tsc --noEmit`, `vitest run` (no regressions in the
pure modules this composes — Modules 19–22), and `wxt build` manifest/bundle inspection.

- [ ] **23.1** (manual) `runEnsureListJob` opens a Google Maps tab, injects `gmaps.content.ts`,
  sends `GMAPS_ENSURE_LIST` with `TARGET_SAVED_LIST_NAME`, and on `{ok:true}` patches the session
  to `import_succeeded` and broadcasts `IMPORT_SUCCEEDED`; on any failure, patches to `error` with
  the returned/inferred code and broadcasts `IMPORT_FAILED`.
- [ ] **23.2** (manual, needs a live Google account) End-to-end: popup confirm → 保存リストを準備する
  → Google Maps tab opens → 食べログ list is created (first run) or detected as already present
  (second run) → popup shows `import_succeeded`.

## Out of scope for Phase 4

- Per-shop duplicate detection against a list's actual contents (only list-level `hasListNamed` is implemented).
- Address search and single-result resolution.
- Adding a resolved place to the list.
- Japanese-locale live verification of any bilingual text fallback in Module 19.

These are the same items ADR-0008 and the decision checklist track as open; a future Phase 5 covers them once their own DOM recon lands.
