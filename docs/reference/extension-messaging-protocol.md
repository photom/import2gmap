# Extension Messaging Protocol

Typed message contracts between **popup**, **service worker**, and **content scripts** (Tabelog extract; My Maps import prelude only).

Related: [UI spec](extension-ui-specifications.md), [session schema](extension-session-storage-schema.md), [error codes](extension-error-codes.md), [sequences](extension-extract-confirm-sequences.md).

---

## 1. Transport rules

| Rule | Detail |
| :--- | :--- |
| API | `chrome.runtime.sendMessage` / `onMessage`; content ↔ worker may also use `chrome.tabs.sendMessage` after injection |
| Shape | Discriminated union on `type` (string literal). No `any` at boundaries |
| Validation | Every receiver runs a type guard on `unknown`; reject unknown `type` |
| Correlation | Long-running work carries `jobId: string` (UUID). Progress/result/error/cancel must echo the same `jobId` |
| Version | Optional `protocolVersion: 1` on every message (recommended). Mismatch → `ProtocolMismatch` |
| Trust | Never trust sender fields beyond allowlisted shapes; re-validate domain payloads before session write |

Worker is the **orchestrator**. Popup does not talk directly to content scripts in v1.

---

## 2. Shared fragments

```ts
type ProtocolVersion = 1;

type JobId = string; // non-empty UUID

type UiStep =
  | "ready"
  | "wrong_tab"
  | "wrong_tabelog_page"
  | "extracting"
  | "extract_complete"
  | "confirm"
  | "import_starting"
  | "import_succeeded"
  | "error";

type ExtractProgress = {
  shopsCollected: number;
  currentPage?: number; // 1-based when known
  totalPages?: number;
  totalShopsDeclared?: number; // from list chrome “全 N 件” when parsed
};

type ExtensionErrorPayload = {
  code: string; // see extension-error-codes.md
  message: string; // Japanese UI string (may be looked up from code)
  retryStep: "extract" | "import" | "none";
  jobId?: JobId;
};
```

Domain payloads (`ExtractedShop`, `ExtractedSavedList`, `CollectionRef`) match [extraction spec §3.6](tabelog-pc-saved-list-extraction-spec.md).

---

## 3. Popup → Service worker

| `type` | Fields | When |
| :--- | :--- | :--- |
| `GET_UI_STATE` | `{ protocolVersion }` | Popup open / focus — resync |
| `EXTRACT_START` | `{ protocolVersion }` | User taps **抽出する** |
| `EXTRACT_CANCEL` | `{ protocolVersion, jobId }` | User taps **キャンセル** while extracting |
| `UI_STEP_SET` | `{ protocolVersion, uiStep: "confirm" \| "extract_complete" }` | **次へ** / **戻る** (only allowed transitions) |
| `EXTRACT_DISCARD` | `{ protocolVersion }` | **やり直す** — clear successful extract from session |
| `MAP_NAME_SET` | `{ protocolVersion, mapName: string }` | Confirm input change (debounce OK) |
| `IMPORT_START` | `{ protocolVersion, mapName: string }` | **My Maps へインポート** |
| `IMPORT_CANCEL` | `{ protocolVersion, jobId }` | Cancel during `import_starting` (best effort) |
| `ERROR_RETRY` | `{ protocolVersion }` | **再試行** — worker uses last `retryStep` |
| `PERMISSION_REQUEST_PENDING` | `{ protocolVersion, step: "extract" }` or `{ protocolVersion, step: "import", mapName: string }` | Sent (and awaited) immediately **before** `browser.permissions.request(...)`, added 2026-08-04 — see §7a |
| `PERMISSION_REQUEST_CANCELLED` | `{ protocolVersion }` | Sent when `permissions.request()` resolves `false` and the popup survived to see it, added 2026-08-04 |

---

## 4. Service worker → Popup

| `type` | Fields | When |
| :--- | :--- | :--- |
| `UI_STATE` | `{ protocolVersion, snapshot: UiStateSnapshot }` | Reply to `GET_UI_STATE`; also push on transitions |
| `EXTRACT_PROGRESS` | `{ protocolVersion, jobId, progress: ExtractProgress }` | During crawl |
| `EXTRACT_SUCCEEDED` | `{ protocolVersion, jobId, shopCount: number, collectionCount: number }` | Full crawl OK (session already written) |
| `EXTRACT_FAILED` | `{ protocolVersion } & ExtensionErrorPayload` | Extract failed |
| `EXTRACT_CANCELLED` | `{ protocolVersion, jobId }` | Cancel completed; no success payload |
| `IMPORT_PRELUDE_FAILED` | `{ protocolVersion } & ExtensionErrorPayload` | Permission / tab open failure before Maps automation |
| `IMPORT_PRELUDE_STARTED` | `{ protocolVersion, jobId }` | Maps tab open/focus + injection kicked off |
| `IMPORT_SUCCEEDED` | `{ protocolVersion, jobId }` | Maps automation confirmed the KML import succeeded (session `uiStep` already `import_succeeded`) |
| `IMPORT_FAILED` | `{ protocolVersion } & ExtensionErrorPayload` | Maps automation failed after the prelude (e.g. `MyMapsUiChanged` on a missing selector or timeout) |

```ts
type UiStateSnapshot = {
  uiStep: UiStep;
  context: "saved_list" | "tabelog_other" | "other";
  jobId?: JobId;
  progress?: ExtractProgress;
  shopCount?: number;
  collectionCount?: number; // collectionsCatalog unique ids
  mapName?: string;
  error?: ExtensionErrorPayload;
};
```

Popup **renders from `UI_STATE` / events**; it does not invent success.

---

## 5. Service worker ↔ Tabelog content script

Injected only for an active extract job.

### Worker → Content

| `type` | Fields | Meaning |
| :--- | :--- | :--- |
| `TAB_GO_TO_FIRST_PAGE` | `{ protocolVersion, jobId }` | **Added 2026-08-05** — bounded prelude, sent once before the first `TAB_EXTRACT_PAGE`: return to page 1 if the crawl didn't start there. See §5a. |
| `TAB_EXTRACT_PAGE` | `{ protocolVersion, jobId }` | Parse current document: items + labels + catalog page slice |
| `TAB_CLICK_NEXT` | `{ protocolVersion, jobId }` | Activate next-page control or report no-next |
| `TAB_ABORT` | `{ protocolVersion, jobId }` | Stop cooperating; ignore further work for this job |

### Content → Worker

| `type` | Fields | Meaning |
| :--- | :--- | :--- |
| `TAB_PAGE_RESULT` | `{ protocolVersion, jobId, shops, catalogDelta, pageMeta }` | One page extract |
| `TAB_FIRST_PAGE_RESULT` | `{ protocolVersion, jobId, kind: "already_first" \| "navigating" }` | **Added 2026-08-05** — reply to `TAB_GO_TO_FIRST_PAGE`. See §5a. |
| `TAB_NEXT_RESULT` | `{ protocolVersion, jobId, kind: "navigating" \| "no_next" }` | After next attempt |
| `TAB_EXTRACT_FAILED` | `{ protocolVersion, jobId, code, detail? }` | Page-level failure |

`pageMeta` may include `{ currentPage?, totalShopsDeclared? }`.  
`catalogDelta` is `CollectionRef[]` for this document.  
Worker merges shops/catalog, drives pagination, enforces completeness, writes session once.

**Navigation constraint**: `TAB_NEXT_RESULT.kind: "navigating"` means the content script is about to click the next-page arrow — it replies *first*, then clicks (the click is the last thing it does), because the resulting page navigation destroys its execution context. Because the reply arrives before the click, the worker cannot tell "navigation done" from "navigation hasn't started yet" using tab status alone (the tab can still report `status: 'complete'` for the *old* page for a brief window right after the reply) — it must capture the tab's URL before sending `TAB_CLICK_NEXT` and then wait for both the URL to change *and* `status: 'complete'`, bounded by a timeout. Only once that navigation is confirmed does the worker **re-inject the content script into the new document** before sending the next `TAB_EXTRACT_PAGE` — a programmatically injected `registration: 'runtime'` content script is not auto-reinjected by WXT after a navigation.

Content scripts must **not** write `chrome.storage.session` in v1.

---

## 5a. Return-to-page-1 prelude — added 2026-08-05

Root cause this section fixes: the crawl in §5 only ever follows the next-page arrow **forward**
from whatever page the tab was on when 抽出する was pressed. A user sitting on page 2+ of the
saved list (e.g. from browsing before extracting) would get fewer shops than the page's declared
total and an explicit `IncompleteCrawl` — see [extraction spec §5.2a](tabelog-pc-saved-list-extraction-spec.md#52a-return-to-page-1-prelude--added-2026-08-05)
for the full detection/navigation design (including the windowed-pagination fallback).

`runExtractJob` (`entrypoints/background.ts`) runs a bounded `returnToFirstPage` loop immediately
after the first `ensureContentScript`, before the existing forward-crawl loop:

1. Send `TAB_GO_TO_FIRST_PAGE`.
2. `kind: "already_first"` → prelude done; proceed to the normal crawl (§5).
3. `kind: "navigating"` → same **reply-first-then-navigate** discipline as `TAB_CLICK_NEXT`: the
   content script has already clicked (or is about to click) a pagination link by the time this
   reply is observed, so the worker captures the tab's URL **before** sending the message, then
   `waitForNavigation` + re-injects, then repeats from step 1.
4. `TAB_EXTRACT_FAILED` (`NotSavedListPage` from the pre-check, or `SelectorDrift` when pagination
   chrome says "not page 1" but no navigable link exists) → explicit `EXTRACT_FAILED`, prelude
   aborts, crawl never starts.
5. Steps 1–3 repeat at most `MAX_RETURN_TO_FIRST_PAGE_STEPS` times (worker-side constant); if page
   1 still isn't reached, explicit `EXTRACT_FAILED` with `ReturnToFirstPageFailed` — never a silent
   partial crawl (ADR-0003).

---

## 6. Service worker ↔ My Maps content script

Selectors and detection rules come from the ADR-0004 spike: [My Maps import spike results](../explanation/my-maps-import-spike-results.md).

**Navigation constraint**: clicking **新しい地図を作成** causes a full document navigation, which destroys a programmatically-injected content script's execution context (`registration: 'runtime'` scripts are not auto-reinjected by WXT). So the content script never observes the result of that click — it can only reply *before* triggering it. The worker owns everything that happens after the navigation: it polls the tab's own URL for the `mid=` marker and re-injects a fresh content script into the new document before proceeding. See "Open follow-ups" in the spike results doc.

**Rendering-lag rule (established after the fourth recurrence, 2026-08-04)**: every dialog/panel in this flow — the post-navigation layer panel, the KML picker iframe, the title-rename dialog, and now the picker v2 upload-nav click — renders with a **lag after the click that triggers it**. Every DOM lookup in `mymaps.content.ts` that follows a click or navigation must use the bounded `waitForElement`/`pollUntil` poll, never a single synchronous `querySelector`; a timeout is always an explicit `MyMapsUiChanged` failure, never a silent continue. See spike results, top-of-doc addenda.

**Two-frame constraint (2026-08-02)**: the KML upload dialog opened by 「インポート」 is a **cross-origin `docs.google.com/picker` iframe**, not more DOM in the top My Maps document — see the spike results' "cross-origin picker iframe" finding. Concretely:

| Selector | Lives in |
| :--- | :--- |
| `div[aria-label="新しい地図を作成"]` (create map) | top frame (`www.google.com`) |
| `#map-title-desc-bar .i4ewOd-r4nke` (map title bar, trigger + verification) | top frame |
| `#update-map` (title-rename dialog) | top frame |
| `#ly0-layerview-import-link` (「インポート」) | top frame |
| `input[type="file"][accept*="KML"]` (strict; the only selector allowed to decide "the file input exists"), falling back to any `input[type="file"]` in the frame — **fallback only reachable once the upload nav's `aria-selected` is confirmed `"true"` (or no nav ever existed — layout 1)**; a first version used the bare fallback (and file-input presence generally) as the "already on the upload pane" test, which could match a stray upload input in the still-rendered Drive pane and misfired in the field — see spike results §3 (2026-08-04 second addendum) | **picker iframe** (`docs.google.com/picker...`) |
| `div[role="option"]` whose trimmed text is `アップロード`/`Upload` — activated (not just clicked) via an escalation: `.click()`, then a bubbling pointer/mouse sequence (`pointerdown`/`mousedown`/`pointerup`/`mouseup`/`click`), then keyboard (`focus()` + `keydown` `Enter`, then `focus()` + `keydown` `' '`), verifying the option's own `aria-selected` (`isPickerUploadNavSelected`) after each step rather than assuming a plain `.click()` took effect (**2026-08-04 second addendum**) | **picker iframe** |
| `#ly0-layer-header .pbTTYe-r4nke` (success signal) | top frame |

No single content-script handler can span both frames, so the worker sequences three messages instead of one `MAPS_IMPORT_KML`, targeting each at a specific `frameId` via `browser.tabs.sendMessage(tabId, msg, { frameId })` — never an untargeted broadcast, which would reach every frame's listener and make it ambiguous which reply is "the" reply. `mymaps.content.ts` is injected with `{ allFrames: true }` for this phase of the flow; each injected instance calls `detectMapsFrameRole(location.hostname)` and returns `'mymaps' | 'picker'` as its `main()` result. WXT surfaces content-script `main()` return values in the `browser.scripting.executeScript` result array (one entry per frame, each carrying its `frameId`), which is how the worker (`waitForPickerFrame` in `entrypoints/background.ts`) discovers the picker iframe's `frameId` — the iframe doesn't exist until after the import-dialog click and loads asynchronously, so this is a bounded poll (re-injecting each tick), not a single lookup. This avoids needing the `webNavigation` permission.

| Direction | `type` | Role | Frame |
| :--- | :--- | :--- | :--- |
| Worker → Maps | `MAPS_PREPARE_IMPORT` | `{ protocolVersion, jobId }` — check the tab is authenticated (not redirected to `accounts.google.com`) and that the **新しい地図を作成** control is present; reply *before* clicking anything | top (`frameId: 0`) |
| Maps → Worker | `MAPS_PREPARE_RESULT` | `{ protocolVersion, jobId, ok: true }` once the create-map control was found (the content script then clicks it, and best-effort dismisses the optional Drive consent dialog, immediately after replying), or `{ ok: false, code }` (`MyMapsNotReady` when logged out, `MyMapsUiChanged` when the create-map control is missing) | top |
| *(worker-only, no message)* | — | After `ok: true`, the worker polls `browser.tabs.get(tabId).url` for a `mid=`-bearing `/maps/d/` URL (bounded timeout; `MyMapsUiChanged` on timeout), then re-injects the content script into the new document | — |
| Worker → Maps | `MAPS_SET_MAP_TITLE` | `{ protocolVersion, jobId, mapName: string }` — click the map title bar (`#map-title-desc-bar .i4ewOd-r4nke`), wait for the rename dialog (`#update-map`), set the title input, save, and poll for the title bar text to match `mapName`. Runs before `MAPS_OPEN_IMPORT_DIALOG` so the two modal dialogs never interleave | top |
| Maps → Worker | `MAPS_SET_MAP_TITLE_RESULT` | `{ ok: true }` once the title bar shows the new name, or `{ ok: false, code: 'MyMapsUiChanged' }` if any selector in the sequence is missing or the title never changes within a bounded timeout. Treated as a **hard failure** that aborts the import (see spike results §2b) — never best-effort — since the eventual `import_succeeded` popup text asserts the map name | top |
| Worker → Maps | `MAPS_OPEN_IMPORT_DIALOG` | `{ protocolVersion, jobId }` — click `#ly0-layerview-import-link`; this is what starts the picker iframe loading | top |
| Maps → Worker | `MAPS_OPEN_IMPORT_DIALOG_RESULT` | `{ ok: true }`, or `{ ok: false, code: 'MyMapsUiChanged' }` if the import link never appears | top |
| *(worker-only, no message)* | — | The worker polls (`waitForPickerFrame`, bounded timeout) for an injection result whose `main()` returned `'picker'`, capturing its `frameId`; `MyMapsUiChanged` on timeout | — |
| Worker → Maps | `MAPS_FEED_KML` | `{ protocolVersion, jobId, kml: string, fileName: string }` — wait for either the strict file input or (picker v2, 2026-08-04) the upload-nav option; if the nav option exists and isn't `aria-selected="true"`, activate it (escalating `.click()` → pointer/mouse sequence → keyboard `Enter` → keyboard Space, re-checking `aria-selected`/file-input after each step — **2026-08-04 second addendum**, replacing a first fix that assumed a plain click worked) regardless of whether a file input was already found elsewhere; only then look up the file input (falling back to the bare selector, now safe since the upload pane is confirmed active) and build the KML `File`, assign via `DataTransfer`, dispatch `change` | **picker** (discovered `frameId`) |
| Maps → Worker | `MAPS_FEED_KML_RESULT` | `{ ok: true }`, or `{ ok: false, code: 'MyMapsUiChanged' }` if the file input never appears | picker |
| Worker → Maps | `MAPS_AWAIT_IMPORT_RESULT` | `{ protocolVersion, jobId }` — poll the layer title for the success signal | top |
| Maps → Worker | `MAPS_IMPORT_RESULT` | `{ protocolVersion, jobId, ok: true }` once the layer title changes away from its default, or `{ ok: false, code }` (`MyMapsUiChanged`) if that doesn't happen within a bounded timeout | top |
| Maps → Worker | `MAPS_UI_CHANGED` | Unsolicited: unexpected DOM detected outside a specific request/reply | either |

Every missing selector or timeout above is an **explicit failure** (`MyMapsUiChanged` / `MyMapsNotReady`) — never a silent success (ADR-0003), including "no frame ever reported `'picker'`" and "no frame replied at all."

Renaming the My Maps document itself to the user's chosen map name **is automated** (`MAPS_SET_MAP_TITLE`, above; resolved 2026-08-02 — see [spike results §2b](../explanation/my-maps-import-spike-results.md)). It runs before the KML import dialog opens.

---

## 7. Worker permission-prompt resume (`permissions.onAdded`) — added 2026-08-04

Root cause this section fixes: Chrome's optional-host-permission confirmation dialog takes focus
and **destroys the popup's execution context**. `handleExtractStart` / `handleImportStart` in
`entrypoints/popup/App.tsx` used to `await browser.permissions.request(...)` and only send
`EXTRACT_START` / `IMPORT_START` afterward — that line never ran once the dialog appeared, so
nothing happened until the user pressed the button again (by which point the permission was
already granted, so the second press worked without a dialog — the reported "press it twice" bug).

The service worker survives the popup's death, so it resumes the flow itself:

1. Before calling `permissions.request(...)`, the popup sends `PERMISSION_REQUEST_PENDING`
   (§3) and **awaits the reply**, guaranteeing the intent is written to
   `chrome.storage.session` (`pendingPermission`, [session schema §5a](extension-session-storage-schema.md#5a-pending-permission-added-2026-08-04))
   before the dialog can kill the popup.
2. The worker registers `browser.permissions.onAdded`. On fire, it:
   - Reads the session; if there is no `pendingPermission`, it does nothing (a bare grant from
     `chrome://extensions` must not auto-start a job — ADR-0003).
   - Re-checks `browser.permissions.contains({ origins: <required for pending.step> })` rather
     than trusting the event's own `origins` delta.
   - Resolves the active tab the same way `handlePopupMessage` does (`getActiveTab()` →
     `detectTabContext`).
   - Calls the pure `routePermissionGranted(state, tabContext, deps)` (`src/application/message-router.ts`)
     and applies its `patch`/`tabCommand` exactly like a popup-originated message.
3. `routePermissionGranted`:
   - No-ops if the intent is missing or older than a TTL (`PENDING_PERMISSION_TTL_MS`, 5 minutes;
     see `isPendingPermissionFresh`).
   - `step: "extract"` with the active tab still the saved list → starts the extract job exactly
     like a fresh `EXTRACT_START`.
   - `step: "extract"` with the wrong tab → **explicit** `error` (`NotSavedListPage` /
     `WrongTab`, per [error codes](extension-error-codes.md)), never a silent no-op (ADR-0003).
   - `step: "import"` → starts the import job exactly like a fresh `IMPORT_START`, using the
     `mapName` recorded in `pendingPermission`.
   - Always clears `pendingPermission` once it acts (or once expiry is detected).
4. If the popup instead survives the prompt (permission was already granted, so Chrome shows no
   dialog), its own `EXTRACT_START` / `IMPORT_START` still runs. Both paths are idempotent: an
   `EXTRACT_START`/`IMPORT_START` while a job is already active for that step is a no-op
   (`routeImportStart`'s `state.activeJob` guard mirrors the existing `routeExtractStart` one),
   and both success paths clear `pendingPermission` regardless of which path actually started the
   job.
5. If `permissions.request()` resolves `false` (denial) and the popup survived to see it, the
   popup sends `PERMISSION_REQUEST_CANCELLED` to clear the now-stale intent.

Net effect for the user: reopening the popup after granting the permission lands on `extracting`
/ `import_starting` — no second button press required. See
[UI spec §7](extension-ui-specifications.md#7-permissions-ux).

---

## 8. Forbidden

- Untyped payloads or stringly `action` without `type` union
- Popup → content direct messages (v1)
- Content writing session storage
- Treating partial crawl as `EXTRACT_SUCCEEDED`
- Reusing a `jobId` across different user-started runs
