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
| `TAB_EXTRACT_PAGE` | `{ protocolVersion, jobId }` | Parse current document: items + labels + catalog page slice |
| `TAB_CLICK_NEXT` | `{ protocolVersion, jobId }` | Activate next-page control or report no-next |
| `TAB_ABORT` | `{ protocolVersion, jobId }` | Stop cooperating; ignore further work for this job |

### Content → Worker

| `type` | Fields | Meaning |
| :--- | :--- | :--- |
| `TAB_PAGE_RESULT` | `{ protocolVersion, jobId, shops, catalogDelta, pageMeta }` | One page extract |
| `TAB_NEXT_RESULT` | `{ protocolVersion, jobId, kind: "navigating" \| "no_next" }` | After next attempt |
| `TAB_EXTRACT_FAILED` | `{ protocolVersion, jobId, code, detail? }` | Page-level failure |

`pageMeta` may include `{ currentPage?, totalShopsDeclared? }`.  
`catalogDelta` is `CollectionRef[]` for this document.  
Worker merges shops/catalog, drives pagination, enforces completeness, writes session once.

Content scripts must **not** write `chrome.storage.session` in v1.

---

## 6. Service worker ↔ My Maps content script (prelude only)

Full Maps DOM protocol is deferred to a post-spike spec. v1 prelude messages:

| Direction | `type` | Role |
| :--- | :--- | :--- |
| Worker → Maps | `MAPS_PREPARE_IMPORT` | `{ protocolVersion, jobId, mapName }` — page ready check |
| Maps → Worker | `MAPS_PREPARE_RESULT` | `{ protocolVersion, jobId, ok: true }` or failure code |
| Maps → Worker | `MAPS_UI_CHANGED` | Unexpected DOM → `MyMapsUiChanged` |

KML transfer mechanism is defined in the future Maps automation spec.

---

## 7. Forbidden

- Untyped payloads or stringly `action` without `type` union
- Popup → content direct messages (v1)
- Content writing session storage
- Treating partial crawl as `EXTRACT_SUCCEEDED`
- Reusing a `jobId` across different user-started runs
