# Phase 1 Test Plan (Test List) — Core Domain, Parser, KML & UI Reducer

Phase 1 Test Plan for Canon TDD implementation of the **import2gmap Chrome Extension** (WXT + Vitest).

Related: [ADR-0004](../explanation/adr/0004-extension-implementation-baseline.md), [ADR-0006](../explanation/adr/0006-wxt-framework-adoption.md), [extraction spec](tabelog-pc-saved-list-extraction-spec.md).

---

## Module 1: Tabelog Saved List Parser (`TabelogSavedListParser`)

- [ ] **1.1 Page Detection**
  - [ ] Returns `true` when DOM contains `.js-rvwr-list-main`, `.search-condition--hozon`, and `#js-bookmark-list-view[data-list-view="hozon"]`.
  - [ ] Throws `NotSavedListPage` when given a non-saved-list HTML fixture (`not-saved-list.html`).

- [ ] **1.2 Shop Field Extraction & Sanitization**
  - [ ] Extracts shop name (`a.simple-rvw__rst-name-target`) and strips any internal HTML tags.
  - [ ] Extracts allowlisted HTTPS Tabelog shop URL (rejects non-Tabelog hosts and `javascript:` URLs with `InvalidShopUrl`).
  - [ ] Parses copy textarea for address (discards phone number line and shop name line; joins address lines).
  - [ ] Extracts optional `areaCategory` (`p.simple-rvw__area-catg`).
  - [ ] Truncates fields exceeding maximum allowed lengths (`name`: 200, `address`: 400, `areaCategory`: 300).

- [ ] **1.3 Collections & Catalog Extraction**
  - [ ] Parses `#js-bookmarks-data` JSON and associates `labels` (`id`, `title`) with corresponding shop `data-rst-id`.
  - [ ] Throws `BookmarksDataInvalid` if `#js-bookmarks-data` contains malformed JSON.
  - [ ] Parses page-level `#js-collection` for catalog entries.
  - [ ] Throws `CollectionCatalogInvalid` if `#js-collection` contains malformed JSON.
  - [ ] Automatically unions orphan label IDs seen on shops into `collectionsCatalog`.

- [ ] **1.4 Pagination & Deduplication**
  - [ ] Parses total count and current page range from `.c-page-count`.
  - [ ] Detects presence of next-page arrow (`a.c-pagination__arrow--next[rel="next"]`).
  - [ ] Deduplicates shops by normalized URL across pages; merges `collections` by ID; preserves first encountered shop's text fields.

- [ ] **1.5 Parsing Error Handlers**
  - [ ] Throws `EmptyList` when valid list structure contains zero `div.js-bookmark`.
  - [ ] Throws `AddressMissing` when copy textarea is absent or address is empty after sanitization.
  - [ ] Throws `SelectorDrift` when expected shop name element is missing.

---

## Module 2: KML Generator (`KmlBuilder`)

- [ ] **2.1 Document Root & Metadata**
  - [ ] Generates valid UTF-8 OGC KML 2.2 document header with XML-escaped map title (`<name>`).
  - [ ] Sets fixed product description under `<Document>`.

- [ ] **2.2 Placemark Generation**
  - [ ] Emits one `<Placemark>` per extracted shop in document order.
  - [ ] Places sanitized shop name in `<name>` and sanitized address in `<address>`.
  - [ ] Formats `<description>` inside CDATA with shop URL on line 1 and optional `areaCategory` on line 2.
  - [ ] Ensures no phone numbers, bookmark memos, or `<Style>` tags are emitted in v1 KML.

---

## Module 3: Session Storage Guard (`SessionStorageManager`)

- [ ] **3.1 Storage Operations & Schema Guard**
  - [ ] Writes `StoredExtractResult` to `chrome.storage.session` with `schemaVersion: 1`.
  - [ ] Validates stored payload on read; throws `SessionCorrupt` if schema version or fields are invalid.
  - [ ] Clears `activeJob` and `extractResult` on user cancel or discard.

---

## Module 4: Popup UI State Reducer (`UiStateReducer`)

- [ ] **4.1 Context State Evaluation**
  - [ ] Returns `ready` when active tab is a valid saved list and no extract job is active.
  - [ ] Returns `wrong_tabelog_page` / `wrong_tab` when active tab is not a saved list.
  - [ ] Preserves access to `confirm` state when `extractResult` exists in session, even if active tab is changed away from saved list.

- [ ] **4.2 UI State Transitions**
  - [ ] `ready` + `EXTRACT_START` → `extracting`
  - [ ] `extracting` + `EXTRACT_SUCCEEDED` → `extract_complete`
  - [ ] `extract_complete` + `NEXT` → `confirm`
  - [ ] `confirm` + `BACK` → `extract_complete`
  - [ ] `confirm` + `IMPORT_START` → `import_starting`
