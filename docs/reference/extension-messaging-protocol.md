# Extension Messaging Protocol

Typed message contracts between **popup**, **service worker**, and **content scripts** (Tabelog extract; Google Maps saved-list import, [ADR-0008](../explanation/adr/0008-google-maps-saved-list-import.md)).

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
| `IMPORT_START` | `{ protocolVersion }` | **保存リストを準備する** — target list name is the fixed `食べログ` constant, not user input |
| `IMPORT_CANCEL` | `{ protocolVersion, jobId }` | Cancel during `import_starting` (best effort) |
| `ERROR_RETRY` | `{ protocolVersion }` | **再試行** — worker uses last `retryStep` |
| `PERMISSION_REQUEST_PENDING` | `{ protocolVersion, step: "extract" \| "import" }` | Sent (and awaited) immediately **before** `browser.permissions.request(...)`, added 2026-08-04 — see §7a |
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
| `IMPORT_SUCCEEDED` | `{ protocolVersion, jobId }` | The `食べログ` saved list is confirmed to exist (session `uiStep` already `import_succeeded`) — this does **not** yet mean any shop was added to it, see §6 |
| `IMPORT_FAILED` | `{ protocolVersion } & ExtensionErrorPayload` | Maps automation failed after the prelude (e.g. `GoogleMapsUiChanged` on a missing selector or timeout) |

```ts
type UiStateSnapshot = {
  uiStep: UiStep;
  context: "saved_list" | "tabelog_other" | "other";
  jobId?: JobId;
  progress?: ExtractProgress;
  shopCount?: number;
  collectionCount?: number; // collectionsCatalog unique ids
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

## 6. Service worker ↔ Google Maps content script (ADR-0008)

Selectors and DOM shape come from the (sanitized) [spike notes](../explanation/google-maps-saved-list-spike-notes.md). Unlike the superseded My Maps flow, opening the menu, opening the Saved pane, and creating/renaming a list are all in-place SPA mutations — there is no document navigation to survive and no cross-origin iframe, so a single request gets a single reply from one frame.

| Direction | `type` | Fields | Meaning |
| :--- | :--- | :--- | :--- |
| Worker → Maps | `GMAPS_ENSURE_LIST` | `{ protocolVersion, jobId, listName: string }` — open the app menu, open the Saved pane, check whether a list named `listName` exists; if not, create one via **New list** and rename it. `listName` is always `TARGET_SAVED_LIST_NAME` (`食べログ`, `src/domain/google-maps/constants.ts`) in practice, but is passed explicitly rather than hardcoded in the content script | top (only frame involved) |
| Maps → Worker | `GMAPS_ENSURE_LIST_RESULT` | `{ ok: true, created: boolean }` (list already existed vs. was just created), or `{ ok: false, code }` (`GoogleMapsUiChanged` for any missing selector or bounded timeout at any step); either way carries an optional `diagnostics: string[]` step trace, re-logged by the worker to the service-worker console — a redundant backup for the normal case; see `GMAPS_DIAGNOSTIC` below for the primary mechanism | top |
| Maps → Worker | `GMAPS_DIAGNOSTIC` | `{ protocolVersion, jobId, line: string }` — **added 2026-08-30**, fire-and-forget (no reply expected). Sent immediately as each step happens (`entrypoints/gmaps.content.ts`'s `logStep`), independent of `GMAPS_ENSURE_LIST_RESULT`, and re-logged to the service-worker console the instant it arrives. Exists because a field report showed the final result reply never reaching the worker at all — the batched `diagnostics` field above (the only progress visibility that existed before this) is attached only to that reply, so it never showed anything either, even though the individual steps had actually run | top |

Every missing selector or timeout is an **explicit failure** (`GoogleMapsUiChanged`) — never a silent success (ADR-0003's policy, carried over to this target). When creating a new list, `GMAPS_ENSURE_LIST_RESULT`'s `ok: true` reflects that the DOM write itself verifiably succeeded (see spike notes §4) — **not** a re-read of this tab's own saved-lists pane, which is field-confirmed to stay stale (showing the old placeholder name) until a full page reload; see "Reload-based verification" below for where that check actually happens. For the "list already existed" path (`created: false`), `ok: true` still means a normal, non-stale read of the pane found it.

**Delivery resilience (added 2026-08-30)**: `entrypoints/background.ts`'s `sendEnsureListWithRetry` races each send against a hard per-attempt timeout and retries once (re-injecting first) on no reply at all — `browser.tabs.sendMessage` can otherwise hang indefinitely with no error if the tab's top frame navigated again between injection and send (e.g. the bare `/maps` URL's client redirect), tearing down the listener. `waitForUrlToSettle` (best-effort, never blocks the job) waits for the tab's URL to stop changing before the first injection to reduce how often that race is even hit. See the [spike notes](../explanation/google-maps-saved-list-spike-notes.md) §1 field report this responds to.

**Reload-based verification (added 2026-08-30)**: when `GMAPS_ENSURE_LIST_RESULT` comes back with `created: true`, `runEnsureListJob` reloads the Google Maps tab, waits for it to settle, re-injects the content script, and sends **a second `GMAPS_ENSURE_LIST`** for the same `listName` — on the freshly reloaded page, `hasListNamed` reads genuinely fresh data instead of the originating tab's stale in-memory state. Only this second round's result determines overall success; a failure here (including no reply) is the job's real explicit failure. See the spike notes §4 field report this responds to (waiting longer, and even a real/synthetic window resize, did not fix the staleness — only a reload did).

`GMAPS_ENSURE_LIST` only implements "ensure the list itself exists" — per-shop duplicate detection, search, and add are a separate message pair, §7 below.

---

## 7. Service worker ↔ Google Maps content script — per-shop search + add (ADR-0008 step 2, added 2026-08-30)

Selectors and DOM shape come from the (sanitized) [spike notes §5](../explanation/google-maps-saved-list-spike-notes.md). Sent once per shop, after `GMAPS_ENSURE_LIST` has confirmed the target list exists.

| Direction | `type` | Fields | Meaning |
| :--- | :--- | :--- | :--- |
| Worker → Maps | `GMAPS_ADD_SHOP` | `{ protocolVersion, jobId, listName, shopName, shopAddress }` — open (or reuse, if already open) the named list's own detail pane; if a place with `shopName` is already in it, skip; otherwise open the "Add a place" search box, search `"{shopName} {shopAddress}"`, and click the top suggestion | top |
| Maps → Worker | `GMAPS_ADD_SHOP_RESULT` | `{ ok: true, status: 'added' \| 'already_present' }`, or `{ ok: false, code }` (`GoogleMapsUiChanged` for any missing selector, no search results, or an add that never confirmed); carries the same `diagnostics: string[]` live-streamed-plus-batched pattern as `GMAPS_ENSURE_LIST_RESULT` | top |

`entrypoints/background.ts`'s `runEnsureListJob` sends one `GMAPS_ADD_SHOP` per extracted shop in sequence via `sendAddShopWithRetry` (same per-attempt-timeout-plus-one-retry shape as `sendEnsureListWithRetry`), tallying `added`/`already_present` (`skipped`)/failed counts. **A per-shop failure does not abort the job** — per ADR-0008's "skip, don't guess" policy, it's tallied into `failedCount` and the loop continues to the next shop; only a structural failure earlier (the list itself unreachable) fails the whole job. After every shop, the worker broadcasts `IMPORT_SHOPS_PROGRESS` (`{ jobId, processed, total }` — counts only, never shop names) to the popup, and the final `IMPORT_SUCCEEDED` carries `addedCount`/`skippedCount`/`failedCount`, persisted to the session as `importSummary` (see [session schema](extension-session-storage-schema.md)) so a popup reopen still shows the same summary.

Unlike `GMAPS_ENSURE_LIST`'s freshly-created-list case, no reload-and-reverify step follows a successful add — reloading per shop would be impractical for a list of any size. The `added`/`already_present` confirmation is a direct, live re-check of the pane; it has not been proven immune to the same kind of tab-local display staleness the list-rename step hit (see spike notes §5's open follow-up).

---

## 8. Worker permission-prompt resume (`permissions.onAdded`) — added 2026-08-04

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
   - `step: "import"` → starts the import job exactly like a fresh `IMPORT_START`.
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

## 9. Forbidden

- Untyped payloads or stringly `action` without `type` union
- Popup → content direct messages (v1)
- Content writing session storage
- Treating partial crawl as `EXTRACT_SUCCEEDED`
- Reusing a `jobId` across different user-started runs
