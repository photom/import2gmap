# Phase 3 Test Plan (Test List) — My Maps Import Automation

Phase 3 Test Plan for Canon TDD implementation of the **import2gmap Chrome Extension** My Maps import automation, unblocked by the [ADR-0004 spike](../explanation/my-maps-import-spike-results.md) (passed 2026-08-02).

Related: [ADR-0003](../explanation/adr/0003-chrome-extension-my-maps-web-import.md), [ADR-0004](../explanation/adr/0004-extension-implementation-baseline.md), [spike results](../explanation/my-maps-import-spike-results.md), [messaging protocol §6](extension-messaging-protocol.md), [error codes](extension-error-codes.md), [Phase 1 plan](test-plan-phase1.md), [Phase 2 plan](test-plan-phase2.md).

Following the Phase 2 strategy: pure detection/construction logic is unit-tested directly; `entrypoints/mymaps.content.ts` stays a thin wrapper delegating to it, since live DOM timing/`MutationObserver` behavior against a real (undocumented, churn-prone) Google UI is not something a fixture can safely stand in for.

---

## Module 13: My Maps Detection Helpers (`src/domain/my-maps/my-maps-detectors.ts`)

- [ ] **13.1 Logged-out redirect detection**
  - [ ] `isLoggedOutRedirect('accounts.google.com')` → `true`
  - [ ] `isLoggedOutRedirect('www.google.com')` → `false`
- [ ] **13.2 New-map creation detection**
  - [ ] URL with `mid=` under `/maps/d/` (e.g. `https://www.google.com/maps/d/u/0/edit?mid=abc123&ll=...`) → `true`
  - [ ] My Maps home URL without `mid=` (e.g. `https://www.google.com/maps/d/u/0/`) → `false`
- [ ] **13.3 Import success detection**
  - [ ] Layer title equal to the known default (`無題のレイヤ`) → not succeeded
  - [ ] Layer title changed to a non-empty, non-default value (e.g. the uploaded file name) → succeeded
  - [ ] Empty/whitespace-only title after change → not succeeded (defensive; do not treat a blank flicker as success)
- [x] **13.4 Frame role detection (`detectMapsFrameRole`) — added 2026-08-02** for the cross-origin picker iframe fix (see spike results addendum / Module 15.2, Module 17.4):
  - [x] `detectMapsFrameRole('docs.google.com')` → `'picker'`
  - [x] `detectMapsFrameRole('www.google.com')` → `'mymaps'`
  - [x] `detectMapsFrameRole('accounts.google.com')` → `'mymaps'` (defensive default — anything that isn't the picker host is treated as the top My Maps frame)
- [x] **13.5 Map title applied detection (`hasMapTitleApplied`) — added 2026-08-02** for the map-title rename automation (see spike results §2b, Module 15.3, Module 17.5):
  - [x] Trimmed title bar text equal to the requested map name → `true`
  - [x] Equal only after trimming incidental surrounding whitespace → `true`
  - [x] Title bar still shows the pre-rename default (e.g. `無題の地図`) → `false`
  - [x] Empty title bar text (dialog/save still in flight) → `false`
- [x] **13.6 Picker upload-nav label detection (`isPickerUploadNavLabel`) — added 2026-08-04** for the picker v2 source-nav layout bugfix (see spike results addendum / Module 15.2):
  - [x] `isPickerUploadNavLabel('アップロード')` → `true`
  - [x] `isPickerUploadNavLabel('  アップロード  ')` → `true` (trimmed)
  - [x] `isPickerUploadNavLabel('Upload')` → `true` (Google mixes English into the JA UI here too, same as `DRIVE_CONSENT_TEXT = 'CREATE'`)
  - [x] `isPickerUploadNavLabel('Google ドライブ')` → `false`
  - [x] `isPickerUploadNavLabel('アルバム')` → `false`
  - [x] `isPickerUploadNavLabel('')` → `false`
  - [x] `isPickerUploadNavLabel('アップロード履歴')` → `false` (exact trimmed match, not substring)
- [x] **13.7 Picker upload-nav selected-state detection (`isPickerUploadNavSelected`) — added 2026-08-04** for the picker-v2 activation-verification bugfix: the field report showed the nav option still `aria-selected="false"` (Drive pane still rendered) after the Module 13.6 fix shipped, so "was the nav clicked" is no longer trustworthy — the authoritative signal is the nav option's own `aria-selected`, checked after every activation attempt (see spike results §3 second addendum / Module 15.2):
  - [x] `isPickerUploadNavSelected('true')` → `true`
  - [x] `isPickerUploadNavSelected('false')` → `false`
  - [x] `isPickerUploadNavSelected(null)` → `false` (attribute absent / option not found)
- [x] **13.8 Picker activation keyboard event init (`pickerActivationKeyEventInit`) — added 2026-08-05** for the picker-v2 stall reported live (see spike results §3 third addendum): the user's own DOM snapshot showed the upload-nav option reaching `tabindex="0"` (focus moved) while `aria-selected` stayed `"false"` — exactly the signature of a keyboard activation whose synthetic `KeyboardEvent` left `keyCode`/`which` at `0`, which Closure/jsaction keydown handlers commonly branch on:
  - [x] `pickerActivationKeyEventInit('Enter')` → `{ key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true, composed: true }`
  - [x] `pickerActivationKeyEventInit(' ')` → `{ key: ' ', code: 'Space', keyCode: 32, which: 32, ... }`
- [x] **13.9 Picker frame content presence (`hasPickerFrameContent`) — added 2026-08-05** for content-aware picker-frame discovery (see Module 17.4 third update, hypothesis 0.1): whether a `docs.google.com`-hostname frame actually has rendered picker UI yet, not just the right hostname.
  - [x] Upload-nav option present → `true`
  - [x] Strict KML file input present → `true`
  - [x] Neither present (still-loading frame, or an unrelated `docs.google.com` frame) → `false`
- [x] **13.10 Picker frame readiness guard (`isPickerFrameReady`) — added 2026-08-05**, narrows an `executeScript` injection result's `main()` return value to "this is the real, ready picker frame" — role **and** content, replacing the old hostname-only `result === 'picker'` check that could latch onto a still-loading or unrelated `docs.google.com` frame:
  - [x] `{ role: 'picker', hasPickerContent: true }` → `true`
  - [x] `{ role: 'picker', hasPickerContent: false }` → `false`
  - [x] `{ role: 'mymaps', hasPickerContent: false }` → `false`
  - [x] `undefined` / the old bare `'picker'` string shape → `false` (confirms the hostname-only shape is no longer accepted)
- [x] **13.11 Picker loading-spinner state (`isPickerSpinnerActive`) — added 2026-08-05** for the "act before the app has finished wiring up" gap (hypothesis 0.4): the picker v2 app renders progressively, and a synthetic event dispatched before its event dispatcher is installed can be silently dropped. Observed finished-state markers on the spinner element (`jsname="aZ2wEe"`) are `data-active="false"` and `aria-hidden="true"`; absence of the element itself is handled by the content-script caller, not this function.
  - [x] `isPickerSpinnerActive('false', null)` → `false`
  - [x] `isPickerSpinnerActive(null, 'true')` → `false`
  - [x] `isPickerSpinnerActive(null, null)` → `true` (neither finished-state marker present — still loading)

## Module 14: KML File Construction (`src/domain/my-maps/build-kml-file.ts`)

- [ ] **14.1** Builds a `File` from a KML string and file name, with a KML-appropriate MIME type, whose content round-trips back to the original string.

## Module 15: My Maps Content Script Message Handling (`entrypoints/mymaps.content.ts`)

Thin wrapper delegating to Modules 13–14; exercised via the same "handler function takes a fake DOM/location, returns a reply message" pattern used for `tabelog-extract-handler.ts` (Phase 2, Module 8), rather than testing `defineContentScript` itself.

- [ ] **15.1 `MAPS_PREPARE_IMPORT` handling**
  - [ ] Logged-out `location.hostname` → replies `MAPS_PREPARE_RESULT` `{ ok: false, code: 'MyMapsNotReady' }` without attempting to click anything.
  - [ ] Create-map control (`div[aria-label="新しい地図を作成"]`) missing → replies `{ ok: false, code: 'MyMapsUiChanged' }`.
  - [ ] Happy path (control present, authenticated) → replies `{ ok: true }` **first**, then (only after the reply has been sent) clicks the control and best-effort dismisses the optional Google Drive upload consent dialog if it appears (`[data-id="t0O6ic"]` / button text `CREATE`, bounded ~5s poll, not a failure if absent).
  - [ ] **2026-08-02 bugfix**: the click on the create-map control causes a full document navigation, which destroys this content script's execution context. The handler previously clicked, then waited for `mid=` in the URL and the import link, and only replied afterward — the navigation killed the script before `sendResponse` could ever fire, so the worker's `await` on `MAPS_PREPARE_RESULT` hung until the message port closed and surfaced a bare `InternalError`, even though the map itself had been created (the reported bug: "map created but import never starts"). Fixed by moving the click (and Drive-consent dismissal) to run strictly after the reply, mirroring the already-correct `TAB_CLICK_NEXT` ordering in `tabelog.content.ts` (Module 8.2). Detecting that the map was actually created (formerly `hasCreatedNewMap` polled in-content) moved to the worker — see Module 17 — since the content script cannot survive the navigation to observe it itself.
- [ ] **15.2 KML import handling — split across two frames (2026-08-02 bugfix, superseding the single `MAPS_IMPORT_KML` design)**. Root cause: the KML upload dialog is a cross-origin `docs.google.com/picker` iframe, not more DOM in the top My Maps document — the file input is unreachable from the top frame (`document.querySelector('input[type="file"][accept*="KML"]')` from the top frame returns `null`; confirmed by a live user after the prepare/navigation bugfix above got the flow this far). See the [spike results addendum](../explanation/my-maps-import-spike-results.md) and [messaging protocol §6](extension-messaging-protocol.md#6-service-worker--my-maps-content-script). Replaced by three messages, each handled by whichever frame the relevant DOM actually lives in:
  - [ ] **`MAPS_OPEN_IMPORT_DIALOG` (top frame)**: import link (`#ly0-layerview-import-link`) missing → replies `{ ok: false, code: 'MyMapsUiChanged' }`. Present → clicks it (this is what starts the picker iframe loading) and replies `{ ok: true }`. This absorbs the post-navigation DOM readiness race documented in the spike results ("DOM readiness race after map creation") the same way the old handler did — same bounded-poll `waitForElement`, just scoped to only the top-frame half of the old handler.
  - [ ] **`MAPS_FEED_KML` (picker frame only — `mymaps.content.ts` injected with `detectMapsFrameRole(location.hostname) === 'picker'`)**: builds the KML file (Module 14), assigns it via `DataTransfer`, dispatches `change`, replies `{ ok: true }` once a file input is found. Does not poll for the success signal itself (that selector is back in the top frame). **Updated 2026-08-04 — picker v2 source-nav layout (see Module 13.6, spike results addendum)**: the picker iframe has two observed layouts, layout 1 (file input present immediately) and layout 2 ("picker v2", `data-config` containing `"https://docs.google.com/picker/v2/"`, a left source-nav listbox with `Google ドライブ` preselected and no file input in the DOM until `アップロード`/`Upload` is activated). **Second update 2026-08-04 — the first picker-v2 fix (nav click, no verification) did not work in the field** (see spike results §3 second addendum): the nav option was still `aria-selected="false"` with the Drive pane still rendered, because (a) `findKmlFileInput`'s bare `input[type="file"]` fallback could match a stray hidden upload input already present in the Drive-browsing pane (`data-target="itemUploadDrop"` drag-and-drop tiles), making the handler wrongly conclude "already on the upload pane" and skip the nav click entirely, and/or (b) a plain synthetic `.click()` may not trigger the container's delegated `jsaction` handler. Both are addressed; which was the actual cause in the field was not confirmed. Corrected handler logic:
    1. Bounded-poll (`PREPARE_TIMEOUT_MS`) until the upload-nav option (Module 13.6) exists **or** the strict file input (`input[type="file"][accept*="KML"]`) exists. Neither ever appearing → `{ ok: false, code: 'MyMapsUiChanged' }`.
    2. If the nav option exists and its `aria-selected` (Module 13.7, `isPickerUploadNavSelected`) is not `"true"`, activate it — **regardless of whether a file input was already found**, closing the H1 misfire above — via an ordered escalation, each step followed by a bounded re-check of `aria-selected`/file-input-appearing before trying the next: (i) plain `.click()`; (ii) a bubbling pointer/mouse sequence (`pointerdown`, `mousedown`, `pointerup`, `mouseup`, `click`) dispatched on the option, since the listbox's `jsaction` is delegated on the container and needs bubbling events, not just a bare `.click()`; (iii) `option.focus()` + a bubbling `keydown` of `Enter`; (iv) `option.focus()` + a bubbling `keydown` of `' '` (Space) — a genuinely different path, since the listbox also has `keydown:I481le`. None of the four flipping `aria-selected` to `"true"` and no file input appearing → `{ ok: false, code: 'MyMapsUiChanged' }`, never a silent continue (ADR-0003).
    3. Only then poll for the file input (strict selector, falling back to the bare `input[type="file"]` selector) and feed the KML as before. The bare fallback is now scoped so it can only ever be reached once the upload pane is confirmed active (no nav option ever existed — a single-pane layout 1 — or the nav's `aria-selected` is now `"true"`) — never used as the test for "are we already on the upload pane", which is what let it misfire against the Drive pane's own upload input in the first place.
  - [ ] **Third update 2026-08-05 — the second picker-v2 fix still stalled in the field (live DOM re-captured); addressed jointly with a coordinator-supplied hypothesis 0** (see spike results §3 third addendum): the option reached `tabindex="0"` (focus moved by `option.focus()`) while `aria-selected` stayed `"false"` — evidence the keyboard strategies ran but didn't register as an activation — and the user also reported no `logStep` output in the *service worker* console despite the flow demonstrably reaching the picker. Four changes, all in `activateUploadPaneNav` / the readiness poll unless noted:
    1. **Keyboard events now carry `keyCode`/`which`/`code`** (Module 13.8, `pickerActivationKeyEventInit`) — a bare `new KeyboardEvent('keydown', {key:'Enter'})` leaves `keyCode` at `0`, which Closure/jsaction keydown handlers commonly branch on.
    2. **The pointer/mouse strategy dispatches fuller, hover-preceded events** (`pointerover`/`mouseover`/`mousemove` before the press sequence) with `view`, `detail`, `button`/`buttons`, and pointer-specific fields (`pointerId`, `pointerType`, `isPrimary`) set, targeting the option's innermost child element rather than the `role="option"` div itself.
    3. **Activation cycles through all four strategies repeatedly until an overall deadline (`ACTIVATION_OVERALL_TIMEOUT_MS`), not one-shot per strategy** — addresses the possibility that jsaction's event dispatcher isn't wired up yet the instant the nav option first appears (a late dispatcher silently drops early synthetic events); a single pass through all four strategies could land entirely inside that dead window.
    4. **The pre-activation readiness poll also requires the picker's loading spinner (`jsname="aZ2wEe"`) to not be active** (Module 13.11, `isPickerSpinnerActive`), not just "the nav option exists in the DOM" — the app can render the nav listbox before it's finished settling.
    5. **Picker-frame diagnostics (`logStep` inside `handleFeedKml`/`activateUploadPaneNav`) are now attached to the `MAPS_FEED_KML_RESULT` reply's `diagnostics` field and re-logged by `entrypoints/background.ts` on receipt**, so they actually reach the service-worker console — the content script's own `console.log` only ever reached the picker frame's own (invisible-to-the-user) console, despite a stale comment claiming otherwise. See Module 17.4 for the corresponding `waitForPickerFrame` / send-retry changes.
  - [ ] **`MAPS_AWAIT_IMPORT_RESULT` (top frame)**: polls Module 13.3 (`hasImportSucceeded` against `#ly0-layer-header .pbTTYe-r4nke`) until success or a bounded timeout; replies `MAPS_IMPORT_RESULT` accordingly (reply type name unchanged from the old design to minimize churn).
  - [ ] A single content script instance only registers the handler(s) for its own frame's role (`registerMymapsFrameListener` vs `registerPickerFrameListener`), guarded by a `window`-attached flag (`__import2gmapMymapsRegistered`) so repeated re-injection during frame discovery (Module 17.4) doesn't accumulate duplicate `runtime.onMessage` listeners in the top frame.
- [ ] **15.3 `MAPS_SET_MAP_TITLE` handling (top frame only) — added 2026-08-02**, closing the former "map title rename was not captured" follow-up (see spike results §2b). Registered in `registerMymapsFrameListener`, not the picker listener.
  - [ ] Map title bar trigger (`#map-title-desc-bar .i4ewOd-r4nke`) missing → replies `{ ok: false, code: 'MyMapsUiChanged' }` without attempting to click anything.
  - [ ] Present → clicks it, then `waitForElement`s the rename dialog's title input (`#update-map input[type="text"]`) — **bounded poll, not a single `querySelector`**: the dialog renders with the same lag as the picker iframe and the post-navigation layer panel (third recurrence of this pattern; see spike results "rendering-lag rule"). Missing after timeout → `{ ok: false, code: 'MyMapsUiChanged' }`.
  - [ ] Present → sets `input.value = mapName`, dispatches **both** `input` and `change` events (Closure app; a bare value assignment doesn't register), then `waitForElement`s and clicks the save button (`#update-map button[name="save"]`). Missing save button after timeout → `{ ok: false, code: 'MyMapsUiChanged' }`.
  - [ ] After clicking save, polls Module 13.5 (`hasMapTitleApplied` against `#map-title-desc-bar .i4ewOd-r4nke`) until the title bar shows the new name or a bounded timeout elapses; replies `MAPS_SET_MAP_TITLE_RESULT` accordingly.
  - [ ] Description `<textarea>` is left untouched (nothing to put there; ADR-0003 minimalism).

## Module 17: Background Navigation-Safe Orchestration (bugfix, `entrypoints/background.ts`)

Root cause: a content script injected via `browser.scripting.executeScript` has its execution context destroyed on navigation, and WXT's `registration: 'runtime'` scripts are not auto-reinjected. The worker was injecting each content script exactly once per job and never re-injecting after a navigation, which broke both the My Maps prepare step (Module 15.1 above) and multi-page Tabelog crawls (latent — not yet surfaced because only a single-page list had been manually tested). Not unit-tested, consistent with the entrypoint thin-wrapper convention already applied to Modules 8/15's parent files (browser-API side effects and real navigation timing aren't something a fixture/mock can safely stand in for); verified instead by `tsc --noEmit`, `vitest run` (no regressions in the pure modules this composes — Modules 6, 13), and `wxt build` manifest inspection. End-to-end behavior against a live Tabelog/My Maps session still needs a manual browser check.

- [ ] **17.1** `ensureContentScript(tabId, file)` re-injects a content script after every navigation, before the next message is sent to that tab:
  - [ ] Tabelog: after `TAB_CLICK_NEXT` returns `kind: "navigating"` and `waitForNavigation` resolves, before the next `TAB_EXTRACT_PAGE`.
  - [ ] My Maps: once before `MAPS_PREPARE_IMPORT` (unchanged), and again after the worker confirms the `mid=` URL, before `MAPS_OPEN_IMPORT_DIALOG`.
- [ ] **17.2** `waitForMapCreatedUrl(tabId, timeoutMs)` polls `browser.tabs.get(tabId).url` against `hasCreatedNewMap` (Module 13.2, reused unchanged) with a bounded timeout; timeout → `IMPORT_FAILED` with `MyMapsUiChanged`.
- [ ] **17.3** Two distinct waits, split out because they have different safe assumptions — do not merge them back into a single "wait for complete" helper:
  - [ ] `waitForTabLoaded(tabId)` — for a tab's first load only (right after `browser.tabs.create`, e.g. opening the My Maps tab). Checks `browser.tabs.get(tabId).status` first and resolves immediately if already `"complete"`; only safe here because there is no prior document to confuse the short-circuit with. Falls back to the `browser.tabs.onUpdated` listener with the existing 15s timeout.
  - [ ] `waitForNavigation(tabId, previousUrl)` — for waiting on a navigation away from a document the worker was already on (Tabelog `TAB_CLICK_NEXT`). **2026-08-02 bugfix**: an earlier version of this fix reused the status-only short-circuit here too, which raced — `tabelog.content.ts` replies `{kind:'navigating'}` *before* clicking the next-page link, so by the time the worker's `await` resolves, the tab can still report `status:'complete'` for the OLD page; the short-circuit returned instantly, `ensureContentScript` re-injected into the OLD document, and the next `TAB_EXTRACT_PAGE` silently re-parsed the same page (dedupe hid the duplicate shops; could also spin or produce a bogus `IncompleteCrawl`) — a silent wrong result, which ADR-0003 forbids. Fixed: the worker now captures `tab.url` immediately before sending `TAB_CLICK_NEXT`, then polls (`NAVIGATION_POLL_INTERVAL_MS`) until `browser.tabs.get(tabId)` reports both `status:'complete'` AND a `url` different from the captured one, bounded by `TAB_NAVIGATION_TIMEOUT_MS`; timeout throws (explicit failure via the existing catch → `EXTRACT_FAILED`), never continues silently. `tab.url` can be `undefined` (permission timing) — treated as "not navigated yet", not as a vacuous match.
- [ ] **17.4 Two-frame KML import orchestration — added 2026-08-02** (see Module 15.2, spike results addendum, messaging protocol §6):
  - [ ] `sendToMapsTab(tabId, message, frameId)` always targets an explicit `frameId` (`TOP_FRAME_ID = 0` for `MAPS_PREPARE_IMPORT` / `MAPS_OPEN_IMPORT_DIALOG` / `MAPS_AWAIT_IMPORT_RESULT`; the discovered picker `frameId` for `MAPS_FEED_KML`) — never an untargeted broadcast, which would reach every frame's listener in the tab.
  - [ ] `waitForPickerFrame(tabId, timeoutMs)` polls by re-injecting `mymaps.content.ts` with `{ target: { tabId, allFrames: true } }` and checking each `InjectionResult.result` (the content script's `main()` return value — a WXT feature, not a custom protocol); returns that result's `frameId`, or `undefined` on timeout → `IMPORT_FAILED` with `MyMapsUiChanged`. Frames the extension lacks host permission for (anything other than `www.google.com` and now `docs.google.com/picker*`) are silently skipped by `executeScript`, so unrelated third-party iframes on the page never produce a false match. **Updated 2026-08-05 (hypothesis 0.1)**: `main()` now returns `{ role, hasPickerContent }` (Module 13.9) instead of a bare role string, and frame selection uses `isPickerFrameReady` (Module 13.10) — hostname alone (`role === 'picker'`) is no longer sufficient, since the instant a `docs.google.com` frame exists it may still be blank/loading, or (defensively) a nested `docs.google.com` frame inside the picker gadget that will never render the nav/file input at all.
  - [ ] `runImportJob` sequence after `waitForMapCreatedUrl` succeeds: re-inject → `MAPS_OPEN_IMPORT_DIALOG` (top) → `waitForPickerFrame` → `MAPS_FEED_KML` (picker `frameId`) → `MAPS_AWAIT_IMPORT_RESULT` (top). Any step's failure (missing selector, frame never found, no reply) → explicit `IMPORT_FAILED`, never a silent continue (ADR-0003).
  - [ ] **Added 2026-08-05 (hypothesis 0.2) — `sendFeedKmlWithRetry`**: the picker frame discovered by `waitForPickerFrame` can still have its execution context torn down (progressive render swapping documents, or a further internal navigation) before `MAPS_FEED_KML` is delivered — `browser.tabs.sendMessage` then rejects or resolves `undefined`, and (unlike an explicit `{ok:false,code}` from a still-alive content script) that is indistinguishable from "nothing ever ran", matching a field report of zero `handleFeedKml` log lines despite the flow reaching the import dialog. Fix: wrap frame discovery + send in a loop bounded by an overall `FEED_KML_RETRY_TIMEOUT_MS` deadline — on no reply at all, rediscover (re-inject) and resend; on any actual reply (ok or explicit failure), stop and return it immediately, never retrying past an explicit content-script-observed failure.
  - [ ] **Added 2026-08-05** — diagnostics forwarding: when the `MAPS_FEED_KML_RESULT` reply carries a `diagnostics` field (the content script's own `logStep` lines, collected per-job — see Module 15.2 third update), `runImportJob` re-logs each line via the worker's own `logStep`/`console.log` so it's visible in the service-worker console, which is the only place field reports are actually read from.
- [ ] **17.5 Map title rename sequencing — added 2026-08-02** (see Module 15.3, spike results §2b, messaging protocol §6):
  - [ ] `runImportJob` sends `MAPS_SET_MAP_TITLE` (top frame) immediately after the post-map-creation re-inject, and **before** `MAPS_OPEN_IMPORT_DIALOG` — renaming first means the two modal dialogs (title edit, then KML import) never interleave.
  - [ ] A rename failure (`ok: false`, or no reply) is an **explicit hard failure** (`failImport(jobId, 'MyMapsUiChanged')` or the returned code) that aborts before the import dialog ever opens — not a best-effort skip. Rationale: `import_succeeded` (UI spec §3.6b) renders 「{mapName}」に{shopCount}件の店舗をインポートしました; if the rename silently failed, that text would assert a map name that doesn't exist, which is exactly the "no silent false success" ADR-0003 forbids.

## Module 16: `import_succeeded` wiring (filled a UI-spec gap during this phase)

The original UI spec deferred import success/failure screens to "a later spec" (ADR-0004 §2). Since Phase 3 implements real automation, that gap was closed in the same pass — see [UI spec §3.6b](extension-ui-specifications.md#36b-import_succeeded--インポート完了) and [messaging protocol §4](extension-messaging-protocol.md#4-service-worker--popup) (`IMPORT_SUCCEEDED` / `IMPORT_FAILED`).

- [x] **16.1** `UiStep` includes `import_succeeded`; `message-router`'s `GET_UI_STATE` preserves it (not collapsed into `extract_complete`) when `extractResult` exists.
- [x] **16.2** `popup-view-model` maps `import_succeeded` to a screen carrying `shopCount` and `mapName`.
- [ ] **16.3** (manual) Popup renders the completion screen and **完了** returns to `ready` via `EXTRACT_DISCARD` — not unit-tested (React rendering, same boundary as Module 9).

## Module 18: My Maps Message Type Guards (`src/domain/messaging/message-types.ts`) — added 2026-08-02

`isWorkerToMapsMessage` / `isMapsToWorkerMessage`, extended for the two-frame KML import split (Module 15.2). See `test/domain/messaging/my-maps-message-types.test.ts`.

- [x] **18.1 `isWorkerToMapsMessage`**
  - [x] Accepts `MAPS_PREPARE_IMPORT` with a `jobId` (unchanged).
  - [x] Accepts `MAPS_OPEN_IMPORT_DIALOG` with a `jobId`.
  - [x] Accepts `MAPS_FEED_KML` with `kml` and `fileName`; rejects it without `kml`.
  - [x] Accepts `MAPS_AWAIT_IMPORT_RESULT` with a `jobId`.
  - [x] Rejects the retired `MAPS_IMPORT_KML` type (confirms the old single-message shape is gone, not just replaced alongside it).
  - [x] Rejects an unknown `type`.
  - [x] **Added 2026-08-02 (map title rename, Module 15.3)**: accepts `MAPS_SET_MAP_TITLE` with a non-empty `mapName`; rejects it without `mapName` and with an empty-string `mapName`.
- [x] **18.2 `isMapsToWorkerMessage`**
  - [x] Accepts `MAPS_PREPARE_RESULT` ok:true / ok:false+code (unchanged).
  - [x] Accepts `MAPS_OPEN_IMPORT_DIALOG_RESULT` ok:true / ok:false+code.
  - [x] Accepts `MAPS_FEED_KML_RESULT` ok:true; rejects ok:false without a code.
  - [x] Accepts `MAPS_IMPORT_RESULT` ok:true (unchanged type name — still the reply to the final "await success" step).
  - [x] Accepts `MAPS_UI_CHANGED` with a code (unchanged).
  - [x] **Added 2026-08-02**: accepts `MAPS_SET_MAP_TITLE_RESULT` ok:true / ok:false+code; rejects ok:false without a code.
  - [x] **Added 2026-08-05** (diagnostics forwarding, Module 17.4): accepts `MAPS_FEED_KML_RESULT` ok:true with an optional `diagnostics` string array present.

## Out of scope for Phase 3

- Existing-map / multi-layer import (v1 targets a freshly created map only, per the decision checklist).
- Parsing Google's specific error-toast markup — bounded timeout is the single failure signal (see spike results §4).

~~Applying the user's chosen map name to the My Maps document title~~ — **resolved 2026-08-02** (`MAPS_SET_MAP_TITLE`, Module 15.3 / 17.5); no longer out of scope.
