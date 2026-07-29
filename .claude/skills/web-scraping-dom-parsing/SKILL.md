---
name: web-scraping-dom-parsing
description: Hardcoded DOM extraction for Tabelog PC saved lists via Manifest V3 content scripts, including pager crawl, address parse, collections/labels from bookmarks JSON, optional area/category description, and sanitization. Never extract personal account data or bookmark memos. See docs/reference/tabelog-pc-saved-list-extraction-spec.md.
---

# Web Scraping & DOM Parsing Skill (`web-scraping-dom-parsing`)

Extract **店舗名 / 住所 / 食べログ URL / コレクション** from Tabelog **PC版** 保存リスト using **fixed selectors** in a content script.

Normative spec: `docs/reference/tabelog-pc-saved-list-extraction-spec.md`  
Design rationale: `docs/explanation/pc-saved-list-extraction-design.md`  
Collections ADR: `docs/explanation/adr/0005-extract-collections-for-future-pin-styling.md`

Host scope: `https://tabelog.com/` (PC saved-list path `/rvwr/*/hozon_restaurants/list`).

The user opens the saved list in Chrome; the extension runs extraction after an explicit user action.

## Privacy Mandate
Do **not** read/store/transmit account or PII. Do **not** persist phone numbers. From `#js-bookmarks-data`, read **only** `labels[].id` / `labels[].title` — never memo/comment fields.

## Selectors (summary)
| Role | Selector |
| :--- | :--- |
| Item | `div.js-bookmark` (`data-rst-id` for label join) |
| Name + URL | `a.simple-rvw__rst-name-target` (`textContent` / `href`) |
| Address source | `textarea.rst-info-copy__item-txt.js-rst-info-copy__item-txt` (4-line layout: name, phone, address, url — keep address only) |
| Optional description | `p.simple-rvw__area-catg` (area/category; **not** address) |
| Collections (per shop) | `#js-bookmarks-data[data-bookmarks]` → `labels` for `data-rst-id` |
| Collection catalog | `#js-collection[data-collection-attributes]` or `select.js-collections-sidebar-selector` |
| Next page | `a.c-pagination__arrow.c-pagination__arrow--next[rel="next"]` |
| Current page | `strong.c-pagination__num.is-current` |

Do **not** rely on `.js-hozon-preview` for collection names.

## Description assembly
1. Put sanitized shop URL on the first line.
2. If area/category text exists, append it on the next line.
3. Keep `collections` structured on the shop record (for future pin colors; not inlined into description).

## Flow
1. Detect PC saved-list page.
2. Parse bookmarks labels + catalog; extract all items; sanitize; validate name+address+url.
3. Follow next-page control until absent; dedupe by url (merge collections); merge catalog.
4. If published total is available, require unique count === total.
5. Markup drift → update the reference spec + unit tests together.
