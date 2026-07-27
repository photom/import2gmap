# Extension Session Storage Schema

Schema for `chrome.storage.session` used between extract, confirm, and import start.

Related: [messaging](extension-messaging-protocol.md), [UI spec](extension-ui-specifications.md), [extraction spec](tabelog-pc-saved-list-extraction-spec.md), [ADR-0004](../explanation/adr/0004-extension-implementation-baseline.md).

---

## 1. Rules

| Rule | Detail |
| :--- | :--- |
| Area | `chrome.storage.session` only for shop lists / UI step / jobs (v1). Not `local` |
| Writer | **Service worker only** |
| Readers | Worker (authoritative); popup via `GET_UI_STATE` / pushed `UI_STATE` (prefer not reading storage directly) |
| Validation | On every read, parse with schema guards; corrupt → clear extract success + `SessionCorrupt` |
| Success atomicity | Publish `extractResult` only after a **complete** successful crawl |
| Cancel / failure | Must not leave a prior in-flight job marked running with a new success; clear `activeJob` appropriately |

---

## 2. Top-level keys

Single root object under key `import2gmap` (recommended) to avoid key sprawl:

```ts
type SessionRoot = {
  schemaVersion: 1;
  uiStep: UiStep;
  mapName: string;
  activeJob?: ActiveJob;
  extractResult?: StoredExtractResult;
  lastError?: StoredError;
};

type UiStep =
  | "ready"
  | "wrong_tab"
  | "wrong_tabelog_page"
  | "extracting"
  | "extract_complete"
  | "confirm"
  | "import_starting"
  | "error";
```

`wrong_*` may be ephemeral (computed on popup open) and need not be persisted; if persisted, overwrite on each `GET_UI_STATE`.

---

## 3. Active job

```ts
type ActiveJob = {
  jobId: string;
  kind: "extract" | "import";
  startedAt: number; // epoch ms
  tabId?: number; // Tabelog or Maps tab being driven
  progress?: {
    shopsCollected: number;
    currentPage?: number;
    totalPages?: number;
    totalShopsDeclared?: number;
  };
  cancelRequested?: boolean;
};
```

- Created on `EXTRACT_START` / `IMPORT_START`.
- Cleared when job reaches success terminal, cancel completed, or failure recorded into `lastError` (and `uiStep` → `error` or `ready`).
- Popup close does **not** clear `activeJob` during extract.

---

## 4. Extract result

```ts
type CollectionRef = {
  id: string;
  name: string;
};

type StoredShop = {
  name: string;
  url: string;
  address: string;
  description: string;
  collections: CollectionRef[];
};

type StoredExtractResult = {
  jobId: string; // job that produced this result
  completedAt: number;
  shops: StoredShop[];
  collectionsCatalog: CollectionRef[];
  shopCount: number; // === shops.length after dedupe
  collectionCount: number; // === unique collectionsCatalog ids
  sourceTabUrl?: string; // optional diagnostics; no account scraping
};
```

Invariants:

- `shopCount === shops.length`
- `collectionCount === collectionsCatalog.length` (catalog already unique by id)
- Strings already sanitized per extraction spec before write
- **やり直す** / `EXTRACT_DISCARD` deletes `extractResult` and sets `uiStep` to `ready` (context permitting)

---

## 5. Map name

- Default when entering `extract_complete` or first `confirm`: `食べログ保存リスト YYYY-MM-DD` (local timezone date).
- Stored in `mapName`; updated by `MAP_NAME_SET`.
- Required non-empty at `IMPORT_START` after sanitize (max 80).

---

## 6. Last error

```ts
type StoredError = {
  code: string;
  message: string;
  retryStep: "extract" | "import" | "none";
  jobId?: string;
  at: number;
};
```

Kept so popup reopen on `error` can show the same code/message. Cleared on successful new extract start or successful discard navigation to `ready`.

---

## 7. uiStep persistence

| Event | `uiStep` |
| :--- | :--- |
| Extract running | `extracting` |
| Extract success | `extract_complete` |
| User **次へ** | `confirm` |
| User **戻る** | `extract_complete` |
| Import prelude | `import_starting` |
| Failure | `error` |
| Discard / cancel to idle | `ready` (or wrong_* on next open) |

Reopen popup: worker returns snapshot from session + live tab context (context may override to `wrong_*` even if `extractResult` exists — user can still open confirm via resume only when product allows; **v1**: if `extractResult` exists and tab is wrong, still allow showing `extract_complete`/`confirm` for import path, with a status note that re-extract needs the list tab).

---

## 8. Size & privacy

- Do not store phones, cookies, tokens, bookmark memos.
- If session quota is approached, fail extract with `SessionQuotaExceeded` rather than truncating shops.

---

## 9. Test expectations

- Guard rejects missing `schemaVersion` / malformed shops.
- Cancel never leaves `extractResult` from a partial job.
- `collectionCount` matches catalog length, not “shops with ≥1 collection”.
