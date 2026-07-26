---
name: web-scraping-dom-parsing
description: Hardcoded DOM extraction for Tabelog smartphone saved lists via WebView, including load-more crawling and address enrichment from shop detail pages. Never extract personal or account information. See docs/reference/tabelog-scraping-extraction-spec.md.
---

# Web Scraping & DOM Parsing Skill (`web-scraping-dom-parsing`)

Extract **店舗名 / 住所 / 食べログ URL** from Tabelog **スマホ版** 保存リスト using **fixed selectors**. Full spec: `docs/reference/tabelog-scraping-extraction-spec.md`.

WebView: mobile UA + initial URL `https://s.tabelog.com/`. User navigates to the saved list; scrape from there.

## Privacy Mandate
Do **not** read/store/transmit account or PII.

## Selectors (summary)
| Role | Selector |
| :--- | :--- |
| Item | `a.p-bkm-cassette.js-bookmark` |
| Name | `.p-bkm-cassette__rst-name` |
| Load more | `a.get-next-items` (click until gone) |
| Address | Not on list — enrich from shop detail (`ShopDetail` selectors) |

Never treat area/genre as address. Collect **all** load-more batches before success.

## Flow
1. Detect smartphone saved-list page.
2. Extract name+url batches; click load-more until exhausted; dedupe by url.
3. Enrich address from each shop detail.
4. Require name+address+url on every shop; otherwise explicit error.
5. Markup drift → update selector tables + unit tests together.
