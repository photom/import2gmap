# Extension Extract → Confirm Sequences

Reference sequences and state diagrams for popup extract/confirm, including **reconnect after popup close** during extract.

Related: [UI spec](extension-ui-specifications.md), [messaging](extension-messaging-protocol.md), [session schema](extension-session-storage-schema.md), [error codes](extension-error-codes.md).

---

## 1. UI step state machine

```mermaid
stateDiagram-v2
  [*] --> ContextCheck: popup_open
  ContextCheck --> ready: saved_list_no_job
  ContextCheck --> extracting: active_extract_job
  ContextCheck --> extract_complete: has_result_step_complete
  ContextCheck --> confirm: has_result_step_confirm
  ContextCheck --> import_starting: active_import_job
  ContextCheck --> error: has_lastError
  ContextCheck --> wrong_tab: no_usable_tab
  ContextCheck --> wrong_tabelog_page: tabelog_not_list

  ready --> extracting: EXTRACT_START
  extracting --> extract_complete: EXTRACT_SUCCEEDED
  extracting --> ready: EXTRACT_CANCELLED
  extracting --> error: EXTRACT_FAILED
  extract_complete --> confirm: UI_STEP_SET_confirm
  extract_complete --> ready: EXTRACT_DISCARD
  confirm --> extract_complete: UI_STEP_SET_complete
  confirm --> import_starting: IMPORT_START
  import_starting --> error: IMPORT_PRELUDE_FAILED
  error --> extracting: ERROR_RETRY_extract
  error --> import_starting: ERROR_RETRY_import
  error --> ready: dismiss_none
```

---

## 2. Happy path — extract through confirm

```mermaid
sequenceDiagram
  participant User
  participant Popup
  participant Worker
  participant Session
  participant Tab as TabelogTab
  participant CS as TabelogContentScript

  User->>Popup: open action
  Popup->>Worker: GET_UI_STATE
  Worker->>Popup: UI_STATE ready
  User->>Popup: 抽出する
  Popup->>Worker: EXTRACT_START
  Worker->>Worker: optional_host_permission
  Worker->>Session: activeJob extract
  Worker->>Tab: scripting.executeScript
  Worker->>CS: TAB_EXTRACT_PAGE
  CS->>Worker: TAB_PAGE_RESULT
  Worker->>Popup: EXTRACT_PROGRESS
  Worker->>CS: TAB_CLICK_NEXT
  CS->>Worker: TAB_NEXT_RESULT navigating
  Note over Tab: location changes to next PG
  Worker->>CS: TAB_EXTRACT_PAGE
  CS->>Worker: TAB_PAGE_RESULT
  Worker->>Popup: EXTRACT_PROGRESS
  Worker->>CS: TAB_CLICK_NEXT
  CS->>Worker: TAB_NEXT_RESULT no_next
  Worker->>Worker: completeness check
  Worker->>Session: extractResult + uiStep extract_complete
  Worker->>Popup: EXTRACT_SUCCEEDED
  User->>Popup: 次へ
  Popup->>Worker: UI_STEP_SET confirm
  Worker->>Session: uiStep confirm
  Worker->>Popup: UI_STATE confirm
```

---

## 3. Popup close during extract — reconnect

**Rule (confirmed):** closing the popup does **not** cancel extract. The worker keeps the job; reopen resyncs.

```mermaid
sequenceDiagram
  participant User
  participant Popup
  participant Worker
  participant Session
  participant CS as TabelogContentScript

  User->>Popup: 抽出する
  Popup->>Worker: EXTRACT_START
  Worker->>Session: activeJob
  Worker->>Popup: EXTRACT_PROGRESS
  User->>Popup: close popup
  Note over Worker,CS: crawl continues
  Worker->>CS: TAB_EXTRACT_PAGE
  CS->>Worker: TAB_PAGE_RESULT
  Worker->>Session: progress update
  User->>Popup: reopen
  Popup->>Worker: GET_UI_STATE
  Worker->>Session: read activeJob
  Worker->>Popup: UI_STATE extracting plus progress
  Worker->>Popup: EXTRACT_PROGRESS
  Worker->>Session: extractResult
  Worker->>Popup: EXTRACT_SUCCEEDED
  Note over Popup: show extract_complete
```

If the job failed while the popup was closed, reopen yields `UI_STATE` with `uiStep: error` and `lastError`.

---

## 4. Cancel extract

```mermaid
sequenceDiagram
  participant User
  participant Popup
  participant Worker
  participant Session
  participant CS as TabelogContentScript

  User->>Popup: キャンセル
  Popup->>Worker: EXTRACT_CANCEL jobId
  Worker->>Session: cancelRequested
  Worker->>CS: TAB_ABORT
  Worker->>Session: clear activeJob no extractResult
  Worker->>Popup: EXTRACT_CANCELLED
  Worker->>Popup: UI_STATE ready
```

No partial `extractResult` is published.

---

## 5. Confirm → import start (prelude only)

```mermaid
sequenceDiagram
  participant User
  participant Popup
  participant Worker
  participant Session
  participant MapsTab

  User->>Popup: edit map name
  Popup->>Worker: MAP_NAME_SET
  Worker->>Session: mapName
  User->>Popup: My Maps へインポート
  Popup->>Worker: IMPORT_START mapName
  Worker->>Session: validate extractResult
  Worker->>Worker: optional_host_permission Maps
  Worker->>Session: activeJob import uiStep import_starting
  Worker->>MapsTab: create_or_focus new map URL
  Worker->>Popup: IMPORT_PRELUDE_STARTED
  Note over Worker,MapsTab: DOM automation after spike
```

---

## 6. Failure while extracting

```mermaid
sequenceDiagram
  participant CS as TabelogContentScript
  participant Worker
  participant Session
  participant Popup

  CS->>Worker: TAB_EXTRACT_FAILED code
  Worker->>Session: lastError clear activeJob no success result
  Worker->>Popup: EXTRACT_FAILED
  Note over Popup: if open show error else on reopen GET_UI_STATE
```

---

## 7. Implementation notes

- Progress events may arrive with no popup listener; that is OK. Session `activeJob.progress` is the reconnect source of truth.
- After navigation (`TAB_NEXT_RESULT navigating`), worker waits for tab `status complete` (or equivalent) before `TAB_EXTRACT_PAGE` again; timeout → `ExtractTimeout` / `TabNavigatedAway` as appropriate.
- Completeness uses extraction spec rules; failure → `IncompleteCrawl`.
