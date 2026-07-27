# Tabelog PC Saved List — DOM Extraction Specification

Reference for fixed-selector extraction from the Tabelog **PC (desktop) saved-list** page (`hozon_restaurants` list view) via a Manifest V3 content script.

This document defines selectors, field mapping, pager traversal, sanitization, and failure rules. It does not embed live shop payloads.

---

## 1. Scope & Privacy

| In scope | Out of scope |
| :--- | :--- |
| Shop name, Tabelog shop URL, street address | Ratings, budgets, holiday text, phone numbers |
| Optional short description (area / category line) | Account, profile, cookies, tokens, reviewer identity |
| Pager discovery and multi-page crawl | Map view, search filters, sidebar collections |

- Extraction runs only after an **explicit user action**.
- Do **not** read `#js-bookmarks-data` or other hidden JSON blobs for shop fields (may contain private memo / label data and lacks address).
- Do **not** persist phone numbers even when they appear in copy-helper markup.
- Selector or structure mismatch → **explicit failure**; partial success is not allowed for a crawl that claimed completeness.

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
| Item root | `div.js-bookmark` | One shop per node. Optional attrs: `data-rst-id`, `data-interested-review-id` (use `data-rst-id` only as dedupe key if URL missing). |
| Card body | `.js-bookmark .rvw-item.js-rvw-item` | Structural wrapper; do not scrape from outside the root. |

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

### 3.4 Output record (logical)

```ts
type ExtractedShop = {
  name: string;       // required, sanitized
  url: string;        // required, sanitized allowlisted URL
  address: string;    // required, sanitized
  description: string; // required for KML: URL on first line, optional areaCategory after
};
```

`description` assembly (after sanitizing parts):

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

### 5.3 Crawl procedure

1. Confirm page detection (Section 2).
2. Extract all items on the current DOM (Section 3–4); append to an in-memory list; dedupe by normalized `url` (fallback: `data-rst-id`).
3. If `a.c-pagination__arrow--next[rel="next"]` exists:
   - Navigate by assigning `location` to that `href` **or** synthesizing the same path with `PG` incremented while preserving other query params.
   - Wait for list settle: item roots present and either `PG` matches or current page number updates.
   - Repeat from step 2.
4. If next link is absent, crawl is complete.
5. Completeness check (when total was parsed): `uniqueShopCount === total`; mismatch → `IncompleteCrawl` (explicit failure).
6. Single-page lists may omit the next arrow; that is success if items extracted and (if total present) counts match.

Do not click sort links or map-view links during crawl.

---

## 6. Sanitization (HTML / CSS / Script Injection)

Apply sanitization to **every** extracted string before domain validation or KML use. Prefer `textContent` / attribute string values over `innerHTML`.

### 6.1 Plain-text fields (`name`, `address`, `areaCategory`)

1. Unicode normalize **NFKC**.
2. Strip all HTML tags if any remain (`/<[^>]*>/g` → empty).
3. Decode HTML entities **once**; if a second decode would introduce `<` or `>`, reject or strip tags again (defense in depth).
4. Remove / replace dangerous substrings case-insensitively:
   - `javascript:`, `vbscript:`, `data:text/html`
   - `<script`, `</script`, `<style`, `</style`, `<iframe`, `<object`, `<embed`, `<link`, `<meta`
   - Inline event-handler prefixes: `onerror=`, `onload=`, `onclick=`, etc.
   - CSS vectors: `expression(`, `-moz-binding`, `behavior:`, `url(javascript`
5. Strip ASCII control chars except `\n` / `\t`; collapse internal whitespace to single spaces for `name` / `address` / `areaCategory` (keep a single `\n` only when assembling `description`).
6. Trim; reject empty required fields.
7. Enforce max lengths (suggested): `name` 200, `address` 400, `areaCategory` 300, `description` 800.

### 6.2 URL field

1. Trim; parse with the URL parser.
2. Allow only `https:` scheme.
3. Allow only hosts `tabelog.com` / `www.tabelog.com`.
4. Path must look like a shop detail path: at least `/…/{digits}/` shop id segment (reject account, setting, login, `javascript:`, protocol-relative tricks).
5. Drop fragment; keep path; ignore tracking-only query unless required for identity (default: strip query for the canonical shop URL stored in the record).
6. Serialize to a single-line absolute URL string; reject on failure (`InvalidShopUrl`).

### 6.3 KML / XML emission

When embedding into KML:

- Put text in elements as **escaped XML** (`&`, `<`, `>`, `"`, `'`), or inside `<![CDATA[ ... ]]>` **after** Section 6.1–6.2 sanitization.
- Never assign unsanitized strings to `innerHTML` in the extension UI.
- `description` first line must remain the sanitized URL; following lines are sanitized plain text only (no markup).

---

## 7. Per-Item Validation & Errors

| Code | When |
| :--- | :--- |
| `NotSavedListPage` | Detection failed |
| `ItemNameMissing` | Name empty after sanitize |
| `ItemUrlMissing` / `InvalidShopUrl` | No allowlisted URL |
| `AddressMissing` | Address parse/sanitize failed |
| `SelectorDrift` | Expected node missing for an otherwise present item root |
| `IncompleteCrawl` | Pager finished but count ≠ unique shops |
| `EmptyList` | Valid page but zero `div.js-bookmark` |

Any item-level failure during a full-list import aborts the batch (no silent skip), unless a future product flag explicitly allows skip-with-report (default: abort).

---

## 8. Fixture & Test Expectations

- Unit-test parsers against **sanitized HTML fixtures** that mirror the selectors above (item root, name target, copy textarea layout, pager).
- Fixtures must not include real account identifiers; replace reviewer path segments with placeholders.
- Cover: entity-encoded names, ampersands in names, missing next arrow, missing address line, `javascript:` href rejection, area-catg-not-used-as-address, description URL-first ordering.
