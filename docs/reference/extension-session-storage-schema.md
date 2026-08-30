# Extension Session Storage Schema

Schema for `chrome.storage.session` used between extract, confirm, and import start.

Related: [messaging](extension-messaging-protocol.md), [UI spec](extension-ui-specifications.md), [extraction spec](tabelog-pc-saved-list-extraction-spec.md), [ADR-0008](../explanation/adr/0008-google-maps-saved-list-import.md).

---

## 1. Rules

| Rule | Detail |
| :--- | :--- |
| Area | `chrome.storage.session` accessed via WXT `storage` API (`session:import2gmap`). Not `local` |
| Writer | **Background service worker only** (`entrypoints/background.ts`) |
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
  activeJob?: ActiveJob;
  extractResult?: StoredExtractResult;
  lastError?: StoredError;
  pendingPermission?: PendingPermission;
  importSummary?: ImportSummary; // ADR-0008 step 2 final tally — see §5b
};

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

## 5. Target list name

Fixed per [ADR-0008](../explanation/adr/0008-google-maps-saved-list-import.md): the target Google
Maps saved list is always named `食べログ` (`TARGET_SAVED_LIST_NAME`,
`src/domain/google-maps/constants.ts`), not user-editable per run, so — unlike the superseded My
Maps flow's `mapName` — nothing about it is stored in the session.

---

## 5a. Pending permission (added 2026-08-04)

```ts
type PendingPermission = {
  step: "extract" | "import";
  requestedAt: number; // epoch ms
};
```

Why this exists: Chrome's optional-host-permission confirmation dialog takes focus and destroys
the popup's execution context, so a popup `await`ing `browser.permissions.request(...)` never
gets to send `EXTRACT_START` / `IMPORT_START` once the dialog appears — without this, the user
had to press 抽出する / インポート a second time after granting (see
[messaging protocol](extension-messaging-protocol.md), `PERMISSION_REQUEST_PENDING`).

- **Written by**: the popup, right before calling `browser.permissions.request(...)` — awaited so
  the write has landed before the dialog can kill the popup.
- **Read/consumed by**: the worker's `browser.permissions.onAdded` listener, which resumes the
  recorded step once the grant is confirmed (`routePermissionGranted` in
  `src/application/message-router.ts`). Never acted on for a bare `onAdded` with no recorded
  intent — that also fires for a permission granted by hand from `chrome://extensions`, and
  auto-starting a job from that would violate ADR-0003's "the user explicitly starts extraction
  and import."
- **Cleared** when: the resumed step actually starts a job, the popup itself successfully starts
  the same job (`EXTRACT_START`/`IMPORT_START` always clear it as part of their patch, whether or
  not one was recorded), the popup sends `PERMISSION_REQUEST_CANCELLED` after a denial, or the
  intent is older than a TTL (5 minutes, `PENDING_PERMISSION_TTL_MS`) when `onAdded` fires — see
  `isPendingPermissionFresh` (`src/domain/session/pending-permission.ts`), a pure, unit-tested
  predicate.
- Survives the popup being destroyed; does **not** need to survive a browser restart
  (`chrome.storage.session`, same as the rest of this schema).

---

## 5b. Import summary (added 2026-08-30)

```ts
type ImportSummary = {
  addedCount: number;
  skippedCount: number; // already present in the list, matched by exact shop name
  failedCount: number; // search/add did not confirm — see error-codes §5
};
```

- **Written by**: the worker, once `uiStep` reaches `import_succeeded`, after ADR-0008 step 2
  (`entrypoints/background.ts`'s per-shop `GMAPS_ADD_SHOP` loop) finishes processing every
  extracted shop.
- **Read by**: the popup, to show the final added/skipped/failed counts on the `import_succeeded`
  screen — persisted so a popup reopen after the job finished still shows the same summary, rather
  than only the live `IMPORT_SUCCEEDED` push (which a closed popup would miss).
- Live per-shop progress while the loop is running is **not** persisted to the session — only
  broadcast as `IMPORT_SHOPS_PROGRESS` (see [messaging protocol §7](extension-messaging-protocol.md#7-service-worker--google-maps-content-script--per-shop-search--add-adr-0008-step-2-added-2026-08-30)) for a popup that happens to be open at the time; reopening
  mid-run shows `import_starting` with no live counter, a known gap (see the decision checklist).

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
| Import prelude / automation running | `import_starting` |
| `食べログ` list confirmed to exist and every extracted shop processed (added/skipped/failed — see §5b) | `import_succeeded` |
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
