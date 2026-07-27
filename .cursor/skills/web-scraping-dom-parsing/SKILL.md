---
name: web-scraping-dom-parsing
description: Hardcoded DOM extraction for Tabelog PC saved lists via Manifest V3 content scripts, including pager crawl, address parse from copy-helper textarea, optional area/category description, and sanitization. Never extract personal or account information. See docs/reference/tabelog-pc-saved-list-extraction-spec.md.
---

# Web Scraping & DOM Parsing Skill (`web-scraping-dom-parsing`)

Extract **店舗名 / 住所 / 食べログ URL** from Tabelog **PC版** 保存リスト using **fixed selectors** in a content script.

Normative spec: `docs/reference/tabelog-pc-saved-list-extraction-spec.md`  
Design rationale: `docs/explanation/pc-saved-list-extraction-design.md`

Host scope: `https://tabelog.com/` (PC saved-list path `/rvwr/*/hozon_restaurants/list`).

The user opens the saved list in Chrome; the extension runs extraction after an explicit user action.

## Privacy Mandate
Do **not** read/store/transmit account or PII. Do **not** persist phone numbers. Do **not** parse `#js-bookmarks-data` for shop fields.

## Selectors (summary)
| Role | Selector |
| :--- | :--- |
| Item | `div.js-bookmark` |
| Name + URL | `a.simple-rvw__rst-name-target` (`textContent` / `href`) |
| Address source | `textarea.rst-info-copy__item-txt.js-rst-info-copy__item-txt` (4-line layout: name, phone, address, url — keep address only) |
| Optional description | `p.simple-rvw__area-catg` (area/category; **not** address) |
| Next page | `a.c-pagination__arrow.c-pagination__arrow--next[rel="next"]` |
| Current page | `strong.c-pagination__num.is-current` |

## Description assembly
1. Put sanitized shop URL on the first line.
2. If area/category text exists, append it on the next line.

## Flow
1. Detect PC saved-list page.
2. Extract all items on the page; sanitize; validate name+address+url.
3. Follow next-page control until absent; dedupe by url.
4. If published total is available, require unique count === total.
5. Markup drift → update the reference spec + unit tests together.
