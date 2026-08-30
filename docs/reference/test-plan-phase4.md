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

- [x] **19.1 Menu button detection (`isMenuButton`)** — accepts either captured layout (see spike notes §1)
  - [x] Matches via the compact-layout `settings.open` jsaction handler regardless of label text
  - [x] Matches via the wide "navigation rail" layout's `navigationrail.more` jsaction handler
  - [x] Matches the English `aria-label="Menu"` fallback
  - [x] Matches the Japanese `aria-label="メニュー"` fallback (unconfirmed translation, see spike notes)
  - [x] Rejects an unrelated button
- [x] **19.2 Saved trigger detection (`isSavedTrigger`, renamed 2026-08-30 from `isSavedMenuItem`)** — recognizes the control whether it's a compact-layout dropdown menu item or already directly visible in the wide layout's nav rail
  - [x] Matches via the compact-layout `settings.yourplaces` jsaction handler
  - [x] Matches via the wide-layout `navigationrail.saved` jsaction handler
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
  - **2026-08-30 correction**: this predicate itself was always correct; the bug was in
    `entrypoints/gmaps.content.ts` applying it to the wrong element (a display `<span>` instead of
    its wrapping `<button>`) and then mutating that span's `.textContent` directly instead of a
    real `<input>`/`<textarea>` — see spike notes §4 and Module 23.2. Not a unit-testable regression
    (the bug was in DOM-querying/mutation wiring, not a pure predicate), so no new assertion here;
    the fix is exercised by 23.2's manual verification.
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
- [x] **20.4 `findListButtonByName` / `findListDetailPaneRoot` / `detailPaneTitle` / `isListDetailPaneFor`** — added 2026-08-30 for ADR-0008 step 2 (opening a specific list's own detail pane to add shops to it)
  - [x] `findListButtonByName` finds the clickable row for a matching list name; returns `null` when no row matches
  - [x] `findListDetailPaneRoot` finds the detail pane by its title-button + Add-a-place-button shape (no tablist); does not mistake the overview pane (which has a tablist) for one
  - [x] `detailPaneTitle` reads the list name from the title button
  - [x] `isListDetailPaneFor` matches only the expected name

## Module 21: Message Types (`src/domain/messaging/message-types.ts`) — Google Maps additions

- [x] **21.1 `isWorkerToGoogleMapsMessage`**
  - [x] Accepts `GMAPS_ENSURE_LIST` with a `jobId` and `listName`
  - [x] Rejects it without a `listName`
  - [x] Rejects it without a `jobId`
- [x] **21.2 `isGoogleMapsToWorkerMessage`**
  - [x] Accepts an `ok: true` result with a `created` boolean; rejects one missing `created`
  - [x] Accepts an `ok: false` result with a `code`; rejects one missing `code`
  - [x] Accepts an `ok: true` result with an optional `diagnostics` string array present
  - [x] Rejects an unknown `type`
- [x] **21.3 `isGoogleMapsDiagnosticMessage`** — added 2026-08-30 for live-streamed step logging (see spike notes' "Diagnostics note")
  - [x] Accepts a diagnostic with a `jobId` and `line`
  - [x] Rejects one missing `line`
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

- [x] **23.1** `runEnsureListJob` opens a Google Maps tab, waits for its URL to settle
  (`waitForUrlToSettle`, best-effort), injects `gmaps.content.ts`, sends `GMAPS_ENSURE_LIST` with
  `TARGET_SAVED_LIST_NAME` via `sendEnsureListWithRetry`. On `{ok:true, created:false}` (list
  already existed), patches the session to `import_succeeded` directly. On `{ok:true, created:true}`
  (just created), reloads the tab, re-injects, and sends a second `GMAPS_ENSURE_LIST` before
  trusting success (**added 2026-08-30** — see 23.2) — only that second result's outcome is
  patched to `import_succeeded`/`IMPORT_SUCCEEDED`. Any failure (including no reply after
  retrying, at either round) patches to `error` with the returned/inferred code and broadcasts
  `IMPORT_FAILED`. Live-confirmed via field diagnostics (23.2), not a unit test — see Module 23's
  intro for why.
- [ ] **23.2** (manual, needs a live Google account) End-to-end: popup confirm → 保存リストを準備する
  → Google Maps tab opens → 食べログ list is created (first run) or detected as already present
  (second run) → popup shows `import_succeeded`. **2026-08-30, six revisions the same day** (see
  spike notes §4 "Debugging history" for the full account) — landing on two confirmed root causes:
  (a) the list title starts life already in edit mode (an auto-focused, pre-filled
  `<input>`/`<textarea>`), not a static button — every earlier belief otherwise came from DevTools
  inspection itself blurring that field into its post-edit button state, corrupting every manual
  DOM capture taken to debug it; `createList` now looks for the pre-filled field directly. (b) a
  live diagnostics run then confirmed the DOM write itself succeeds
  (`rename_input:text_set stuck=true connected=true`), but this tab's own saved-lists pane display
  does not reliably reflect it afterward — not immediately, not after waiting, not after a real or
  synthetic window resize; only a full page reload does. Verification moved out of
  `gmaps.content.ts` entirely into `runEnsureListJob`'s reload-and-reverify step (23.1). Also added
  this same day: live diagnostic streaming (`GMAPS_DIAGNOSTIC`, Module 21.3) after a run where the
  final reply never arrived and the old batch-only `diagnostics` field therefore showed nothing.
  **The reload-and-reverify fix has not been re-tried live yet.**

## Module 24: Add-Place Search (`src/domain/google-maps/add-place-search.ts`) — added 2026-08-30 for ADR-0008 step 2

Sanitized synthetic fixtures under `test/fixtures/google-maps/list-detail-pane-*.html`.

- [x] **24.1 `isAddPlaceButton`**
  - [x] Matches via `data-value="Add a place"`
  - [x] Matches English/Japanese `aria-label` fallback
  - [x] Rejects an unrelated button
- [x] **24.2 `isAddPlaceButtonPressed`**
  - [x] `true` when `aria-pressed="true"`; `false` when `"false"` or absent
- [x] **24.3 `isAddPlaceSearchInput`**
  - [x] Matches an `<input role="combobox">` with the expected `aria-label` (English or Japanese)
  - [x] Rejects a non-`<input>` element, an input missing `role="combobox"`, and an unrelated combobox (e.g. the top Maps search box)
- [x] **24.4 `isSuggestionRow`**
  - [x] Matches a `role="row"` with `data-suggestion-index` and a jsaction handler ending in `.suggestion`
  - [x] Rejects a row missing `data-suggestion-index`; rejects a non-row element
- [x] **24.5 `parseSuggestionRows`**
  - [x] Extracts name/address for every suggestion row, ordered by `data-suggestion-index`
  - [x] Returns an empty array when there are no suggestions
- [x] **24.6 `parsePlaceCardNames` / `hasPlaceNamed`**
  - [x] Extracts the name of every already-added place card (a `<button>` containing a `[class*="fontHeadlineSmall"]` child)
  - [x] Does not mistake the "List is empty" heading for a place card (same utility class, but not inside a `<button>`)
  - [x] `hasPlaceNamed` is true only for a name actually present

## Module 25: Message Types — `GMAPS_ADD_SHOP` / `GMAPS_ADD_SHOP_RESULT` / `IMPORT_SHOPS_PROGRESS` — added 2026-08-30

- [x] **25.1 `isWorkerToGoogleMapsAddShopMessage`**
  - [x] Accepts a fully-populated message (`jobId`, `listName`, `shopName`, `shopAddress`)
  - [x] Rejects one missing `listName`, `shopName`, or `shopAddress` (three separate cases)
- [x] **25.2 `isGoogleMapsAddShopResultMessage`**
  - [x] Accepts `ok:true` with `status: 'added'` or `'already_present'`; rejects an invalid `status`
  - [x] Accepts `ok:false` with a `code`; rejects one missing a `code`
  - [x] Rejects an unknown `type`
- [x] **25.3 `isWorkerToPopupMessage`** — extended to accept `IMPORT_SHOPS_PROGRESS`

## Module 26: Session Model — `ImportSummary` — added 2026-08-30

- [x] **26.1 `validateSessionRoot`**
  - [x] Accepts a valid `importSummary` (`addedCount`/`skippedCount`/`failedCount`, all numbers)
  - [x] Throws `SessionCorrupt` when any field is non-numeric

## Module 27: Background Orchestration — per-shop loop (`entrypoints/background.ts`) — added 2026-08-30

Not unit-tested, same rationale as Module 23 (browser-API side effects). Verified by `tsc --noEmit`, `vitest run` (Modules 24–26), and `wxt build`.

- [ ] **27.1** (manual) After `GMAPS_ENSURE_LIST` (and its reload-verify, if the list was just created) succeeds, `runEnsureListJob` sends one `GMAPS_ADD_SHOP` per shop in `session.extractResult.shops` via `sendAddShopWithRetry`, tallying `added`/`already_present` (→ `skippedCount`)/failed counts; a per-shop failure is tallied, not job-aborting. Broadcasts `IMPORT_SHOPS_PROGRESS` after every shop and patches `importSummary` into the session before the final `IMPORT_SUCCEEDED`.
- [x] **27.2** (manual) End-to-end: a 食べログ list with extracted shops, some already present under
  the same name — expect `already_present` skips and the rest `added`. **2026-08-30, confirmed
  live**: a 42-shop run added and skipped correctly, `list_detail_pane:already_open` /
  `add_place_search:already_open` confirmed the pane-reuse optimization, and one shop's search
  correctly ran out its bounded timeout rather than a false success. Not yet confirmed: the popup
  completion screen's counts against a real run (only the content-script/worker log trace was
  checked so far), and the search-box-clear speed optimization added after this run.

## Out of scope for Phase 4

- Live verification of Modules 24–27 (the whole per-shop search + add step) against a real account — implemented from DOM structure alone, same caveat as everything else marked "not live-verified" above.
- Handling an empty/no-match search result with a dedicated code (currently falls through to `GoogleMapsUiChanged` like any other missing selector).
- Handling an ambiguous multi-candidate search result (currently always takes `data-suggestion-index="0"` unconditionally, with no address cross-check).
- Japanese-locale live verification of any bilingual text fallback in Modules 19 and 24.

These are the same items ADR-0008 and the decision checklist track as open; a future Phase 5 covers them once their own DOM recon lands.
