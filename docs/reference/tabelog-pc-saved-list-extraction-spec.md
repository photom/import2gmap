# Tabelog PC Saved List — DOM Extraction Specification

Reference for fixed-selector extraction from the Tabelog **PC (desktop) saved-list** page (`hozon_restaurants` list view) via a Manifest V3 content script.

This document defines selectors, field mapping, pager traversal, sanitization, and failure rules. It does not embed live shop payloads.

---

## 1. Scope & Privacy

| In scope | Out of scope |
| :--- | :--- |
| Shop name, Tabelog shop URL, street address | Ratings, budgets, holiday text, phone numbers |
| Optional short description (area / category line) | Account, profile, cookies, tokens, reviewer identity |
| **Collections (labels)** assigned to each shop | Bookmark memo / comment text, visit counts, degrees |
| Page-level collection catalog (id + name) | Map view, search-filter *application* (reading the filter UI for catalog is OK) |
| Pager discovery and multi-page crawl | |

- Extraction runs only after an **explicit user action**.
- `#js-bookmarks-data` may be read **only** for per-shop `labels` (`id`, `title`). Do **not** read or persist `bookmark_comment*`, reviewer-only URLs, or other blob fields.
- Do **not** persist phone numbers even when they appear in copy-helper markup.
- Selector or structure mismatch → **explicit failure**; partial success is not allowed for a crawl that claimed completeness.
- Collections are extracted now so a **later** My Maps step can color pins per collection; **v1 extraction does not** apply pin colors.

---

## 2. Page Detection

Treat the tab as a PC saved-list page only when **all** of the following hold:

1. Host is `tabelog.com` (or `www.tabelog.com`).
2. Path matches `/rvwr/{rvwrId}/hozon_restaurants/list` (optional trailing slash; query string ignored for detection).
3. List chrome is present: `.js-rvwr-list-main` and `.search-condition--hozon`.
4. At least one of:
   - `#js-bookmark-list-view[data-list-view="hozon"]`
   - `.search-condition__title` text equals `保存リスト`

If detection fails, abort with `NotSavedListPage`.

---

## 3. Item Container & Selectors

### 3.1 Item root

| Role | Selector | Notes |
| :--- | :--- | :--- |
| Item root | `div.js-bookmark` | One shop per node. Attr `data-rst-id` keys into bookmarks JSON for collections. Optional `data-interested-review-id`. |
| Card body | `.js-bookmark .rvw-item.js-rvw-item` | Structural wrapper; do not scrape shop fields from outside the root. |

### 3.2 Required fields

| Field | Selector (scoped to item root) | Extraction |
| :--- | :--- | :--- |
| **name** | `a.simple-rvw__rst-name-target` | `textContent`, then sanitize as plain text. |
| **url** | `a.simple-rvw__rst-name-target` → `href` | Prefer this over fallbacks. Absolute `https` URL. Validate (Section 6). |
| **url (fallback 1)** | `.simple-rvw.js-rst-clickable-area[data-detail-url]` | Use `data-detail-url` if name-target `href` is empty. |
| **url (fallback 2)** | `a.simple-rvw__rst-img[href]` | Last resort for URL only. |
| **address** | `textarea.rst-info-copy__item-txt.js-rst-info-copy__item-txt` | Parse multiline copy payload (Section 4). **Never** use `.simple-rvw__area-catg` as address. |

### 3.3 Optional description source

| Field | Selector | Extraction |
| :--- | :--- | :--- |
| **areaCategory** (optional short description) | `p.simple-rvw__area-catg` | `textContent` (includes the visual `/` between area and category). Sanitize as plain text. Empty/whitespace → omit. |

Do not treat ratings (`.simple-rvw__score-total-val`), budgets (`.simple-rvw__budget`), or holidays (`.simple-rvw__holiday-text`) as description.

### 3.4 Collections (per shop)

List-item chrome (`.rvw-item__bkm-custom.js-hozon-preview`) is often empty in static HTML and filled by page scripts. **Do not** rely on that node for collection names.

| Source | Selector / attr | Use |
| :--- | :--- | :--- |
| Bookmarks blob | `#js-bookmarks-data[data-bookmarks]` | JSON object keyed by restaurant id string |
| Shop key | `div.js-bookmark[data-rst-id]` | Must match a key in the blob |

Per shop entry, read only:

```ts
labels: Array<{ id: number | string; title: string; checked?: boolean }>
```

#### Algorithm (per page, then per item)

1. If `#js-bookmarks-data` is absent → every shop on the page gets `collections: []` (do not fail the crawl solely for this).
2. If present: read `data-bookmarks`, HTML-entity-decode once, `JSON.parse`. Failure → `BookmarksDataInvalid`.
3. For each `div.js-bookmark`:
   - Let `rstId = data-rst-id` (string). If missing → `collections: []` for that item.
   - Let `labels = bookmarks[rstId].labels ?? []`.
   - Map each label with non-empty sanitized `title` to `{ id: String(id), name: sanitizedTitle }`.
   - Include all labels in the array (membership list). Ignore unknown extra keys.
4. Deduplicate by `id` within one shop (keep first name).
5. Never copy `bookmark_comment`, `bookmark_comment_preview*`, or other blob fields into the domain record.

### 3.5 Page-level collection catalog

Also extract a catalog for later pin-color mapping (unique id → name):

| Priority | Source |
| :--- | :--- |
| 1 | `#js-collection[data-collection-attributes]` → JSON array of `{ label_id, title }` |
| 2 (fallback) | `select.js-collections-sidebar-selector option[value]:not([value=""])` → `value` = id, `textContent` = name |

Sanitize names; stringify ids. Empty catalog is allowed. Invalid `#js-collection` JSON when the node exists → `CollectionCatalogInvalid` (explicit failure).

Union catalog ids with any ids seen on shops so orphans from pagination still appear after a full crawl (merge catalogs across pages by id).

### 3.6 Output record (logical)

```ts
type CollectionRef = {
  id: string;   // required, sanitized digit string (or opaque id string)
  name: string; // required, sanitized plain text
};

type ExtractedShop = {
  name: string;        // required, sanitized
  url: string;         // required, sanitized allowlisted URL
  address: string;     // required, sanitized
  description: string; // required for KML: URL on first line, optional areaCategory after
  collections: readonly CollectionRef[]; // may be empty
};

type ExtractedSavedList = {
  shops: readonly ExtractedShop[];
  collectionsCatalog: readonly CollectionRef[]; // may be empty; for future pin colors
};
```

`description` assembly (after sanitizing parts) — **collections are not inlined here** (kept structured for later styling):

```text
{url}
{areaCategory?}
```

- Line 1 is always the shop URL.
- If `areaCategory` is non-empty, append a single newline then that text.
- Do not duplicate the URL elsewhere in `description`.

---

## 4. Address Parsing from Copy Helper

The copy helper textarea holds a fixed **four-line plain-text** layout (newline-separated):

```text
{name}
{phone}
{address}
{url}
```

### Algorithm

1. Read `textarea` value as text (not HTML). Decode HTML character references once if the DOM returns entities (e.g. `&amp;` → `&`).
2. Split on `\r\n` / `\n`, trim each line, drop empty lines.
3. Classify lines:
   - **url-line**: matches allowlisted Tabelog shop URL (Section 6).
   - **phone-line**: matches `^[0-9０-９+\-−ー()（）\s]+$` and contains at least one digit; **discard** (do not store).
   - **name-line** (optional aid): equals extracted `name` after Unicode NFKC + whitespace normalize.
   - **address-line**: remaining non-empty line(s) that are not url/phone/name.
4. Join multiple address-lines with a single space if more than one remains.
5. Require non-empty address after sanitize; else fail the item with `AddressMissing`.

### Forbidden address sources

- `.simple-rvw__area-catg` (station / area / genre, not street address)
- Image `alt`, sidebar, header, or pager text

---

## 5. Pager & Multi-Page Crawl

### 5.1 Count chrome

| Role | Selector |
| :--- | :--- |
| Count block | `.rvw-page-count .c-page-count` |
| Numeric fragments | `.c-page-count__num` (each wraps a `<strong>`) |

Interpret three numbers in document order as `from`, `to`, `total` when present (`from`～`to` 件を表示／全 `total` 件). Use `total` only as a progress check, not as a substitute for crawling.

### 5.2 Pagination controls

| Role | Selector |
| :--- | :--- |
| Pager root | `.list-controll .c-pagination` |
| Page list | `ul.c-pagination__list > li.c-pagination__item` |
| Current page | `strong.c-pagination__num.is-current` |
| Other page link | `a.c-pagination__num` |
| Next page | `a.c-pagination__arrow.c-pagination__arrow--next[rel="next"]` |
| Previous page (when present) | `a.c-pagination__arrow.c-pagination__arrow--prev` (may be absent on first page) |

Page index appears in link query as `PG={n}` (1-based).

### 5.2a Return-to-page-1 prelude — added 2026-08-05

The crawl (§5.3) only ever follows the next-page arrow forward from wherever it starts. If the
user presses 抽出する while sitting on page 2+ of the saved list (e.g. from browsing before
extracting), a forward-only crawl collects fewer shops than the declared total and fails with
`IncompleteCrawl` — the crawl needs to be back on page 1 first. This is a **bounded prelude**,
run once before step 1 of §5.3, driven by a new worker ↔ content-script message pair
(`TAB_GO_TO_FIRST_PAGE` / `TAB_FIRST_PAGE_RESULT`, see [messaging protocol §5](extension-messaging-protocol.md#5-service-worker--tabelog-content-script)):

1. **Detect "not on page 1"**: prefer the count chrome's `from` value (§5.1) — `from > 1` is an
   unambiguous semantic signal. When `.c-page-count` is absent, fall back to corroborating
   pagination signals in order: the prev arrow (§5.2) being present, then the current-page
   marker's own text (`strong.c-pagination__num.is-current`) differing from `"1"`. If none of
   these signals is present, default to "already on page 1" — this matches the crawl's
   pre-existing behavior, so an ambiguous page is never a *new* failure mode.
2. **Navigate back to page 1**: prefer clicking the numbered `a.c-pagination__num` link whose
   trimmed text is exactly `"1"` (the link the user pointed at directly in their own DOM
   evidence). On long lists Tabelog **windows** the numbered links (e.g. `… 20 21 22 …`), so that
   link may not be rendered — in that case, fall back to the prev arrow (§5.2), one page at a
   time, re-evaluating step 1 after each navigation until either the "1" link comes into view or
   page 1 is reached. This fallback was chosen over synthesizing a `PG=1` URL (which §5.3 already
   permits for *forward* crawling) because it never anchors on the `PG` query-string shape or a
   positional index — only on a link's own text/class semantics, same as the rest of this spec.
   Bounded by a fixed retry count; exceeding it without reaching page 1 is an explicit failure
   (`ReturnToFirstPageFailed`), never a silent partial crawl.
3. Neither the "1" link nor the prev arrow present, while step 1 says we're not on page 1 → page
   structure has drifted from what this feature depends on; explicit failure (`SelectorDrift`).

### 5.3 Crawl procedure

1. Confirm page detection (Section 2).
2. Parse bookmarks blob + collection catalog for this document (Section 3.4–3.5).
3. Extract all items on the current DOM (Section 3–4); attach collections; append to an in-memory list; dedupe shops by normalized `url` (fallback: `data-rst-id`). When deduping, **merge** `collections` by collection `id`. If text fields (name, address, etc.) differ on duplicates, preserve the first encountered shop's fields.
4. Merge `collectionsCatalog` by `id` across pages.
5. If `a.c-pagination__arrow--next[rel="next"]` exists:
   - Navigate by assigning `location` to that `href` **or** synthesizing the same path with `PG` incremented while preserving other query params.
   - Wait for list settle: item roots present and either `PG` matches or current page number updates.
   - Repeat from step 2.
6. If next link is absent, crawl is complete.
7. Completeness check (when total was parsed): `uniqueShopCount === total`; mismatch → `IncompleteCrawl` (explicit failure).
8. Single-page lists may omit the next arrow; that is success if items extracted and (if total present) counts match.

Do not click sort links or map-view links during crawl.

---

## 6. Sanitization (HTML / CSS / Script Injection)

Apply sanitization to **every** extracted string before domain validation or KML use. Prefer `textContent` / attribute string values over `innerHTML`.

### 6.1 Plain-text fields (`name`, `address`, `areaCategory`, collection `name`)

1. Unicode normalize **NFKC**.
2. Strip all HTML tags if any remain (`/<[^>]*>/g` → empty).
3. Decode HTML entities **once**; if a second decode would introduce `<` or `>`, reject or strip tags again (defense in depth).
4. Remove / replace dangerous substrings case-insensitively:
   - `javascript:`, `vbscript:`, `data:text/html`
   - `<script`, `</script`, `<style`, `</style`, `<iframe`, `<object`, `<embed`, `<link`, `<meta`
   - Inline event-handler prefixes: `onerror=`, `onload=`, `onclick=`, etc.
   - CSS vectors: `expression(`, `-moz-binding`, `behavior:`, `url(javascript`
5. Strip ASCII control chars except `\n` / `\t`; collapse internal whitespace to single spaces for plain fields (keep a single `\n` only when assembling `description`).
6. Trim; reject empty required fields (`name` / `address`; collection entries with empty name after sanitize are dropped).
7. Enforce max lengths: `name` 200, `address` 400, `areaCategory` 300, collection `name` 100, `description` 800, collection `id` 32. Any string exceeding the limit is automatically truncated to the maximum allowed length.

### 6.2 URL field

1. Trim; parse with the URL parser.
2. Allow only `https:` scheme.
3. Allow only hosts `tabelog.com` / `www.tabelog.com`.
4. Path must look like a shop detail path: at least `/…/{digits}/` shop id segment (reject account, setting, login, `javascript:`, protocol-relative tricks).
5. Drop fragment; keep path; ignore tracking-only query unless required for identity (default: strip query for the canonical shop URL stored in the record).
6. Serialize to a single-line absolute URL string; reject on failure (`InvalidShopUrl`).

### 6.3 Collection id

- Prefer decimal digit strings from `label_id` / `labels[].id`.
- Reject ids containing `<`, `>`, `"`, `'`, or whitespace after stringify/trim.

### 6.4 KML / XML emission

When embedding into KML (import phase; pin colors **out of scope for extraction-only**):

- Put text in elements as **escaped XML** (`&`, `<`, `>`, `"`, `'`), or inside `<![CDATA[ ... ]]>` **after** Section 6.1–6.2 sanitization.
- Never assign unsanitized strings to `innerHTML` in the extension UI.
- `description` first line must remain the sanitized URL; following lines are sanitized plain text only (no markup).
- Keep `collections` on the domain object for a future styling pass; do not require KML style URLs in v1 extraction.

---

## 7. Per-Item Validation & Errors

| Code | When |
| :--- | :--- |
| `NotSavedListPage` | Detection failed |
| `ItemNameMissing` | Name empty after sanitize |
| `ItemUrlMissing` / `InvalidShopUrl` | No allowlisted URL |
| `AddressMissing` | Address parse/sanitize failed |
| `BookmarksDataInvalid` | `#js-bookmarks-data` present but JSON/parse failed |
| `CollectionCatalogInvalid` | `#js-collection` present but JSON/parse failed |
| `SelectorDrift` | Expected node missing for an otherwise present item root (name/url/address path) |
| `IncompleteCrawl` | Pager finished but count ≠ unique shops |
| `EmptyList` | Valid page but zero `div.js-bookmark` |

Empty `collections` on a shop is **valid**. Any item-level failure for required fields during a full-list import aborts the batch (no silent skip), unless a future product flag explicitly allows skip-with-report (default: abort).

---

## 8. Fixture & Test Expectations

- Unit-test parsers against **sanitized HTML fixtures** that mirror the selectors above (item root, name target, copy textarea layout, pager, `#js-bookmarks-data` labels, `#js-collection` / sidebar select).
- Fixtures must not include real account identifiers; replace reviewer path segments with placeholders; use fake collection titles.
- Cover: entity-encoded names, ampersands in names, missing next arrow, missing address line, `javascript:` href rejection, area-catg-not-used-as-address, description URL-first ordering, shop with zero labels, shop with multiple labels, invalid bookmarks JSON → `BookmarksDataInvalid`, merge collections on URL dedupe.
