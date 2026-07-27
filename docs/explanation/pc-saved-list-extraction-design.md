# Design: PC Saved-List Extraction for Chrome Extension

## Purpose

Explain why the PC saved-list extractor uses fixed DOM selectors, how fields map into the KML-facing model, and how pagination and sanitization fit the Manifest V3 content-script architecture.

Normative selector tables and algorithms live in:

- [`docs/reference/tabelog-pc-saved-list-extraction-spec.md`](../reference/tabelog-pc-saved-list-extraction-spec.md)

---

## Context

ADR-0003 requires content scripts to collect **name**, **address**, and **Tabelog URL**, build KML in memory, and import via My Maps Web UI. The PC saved-list view exposes those fields without opening each shop detail page:

- Name and URL sit on a single anchor (`.simple-rvw__rst-name-target`).
- Street address is not shown as a labeled address node; it is embedded in a clipboard helper textarea with a stable four-line layout.
- Area / category text (`.simple-rvw__area-catg`) is a useful optional one-line description, but must never be treated as an address.

Hidden JSON (`#js-bookmarks-data`) is intentionally ignored: it lacks address, may include private memo/label data, and couples the extension to an undocumented blob schema.

---

## Layering

| Layer | Responsibility |
| :--- | :--- |
| Content script (infrastructure) | Page detect, pager navigation, DOM query, raw string read |
| Pure parsers (domain-adjacent) | Textarea line classification, URL allowlist, sanitizers, description assembly |
| Use case | Orchestrate full crawl → `ExtractedShop[]` → hand off to KML builder |
| KML builder | Map `name` / `address` / `description` into placemarks |

Parsers must be unit-testable without Chrome APIs (feed fixture HTML strings or pre-extracted field strings).

---

## Description Field Contract

KML `<description>` (and the logical `description` property) is assembled as:

1. Sanitized shop URL on the **first line** (always).
2. Optional sanitized area/category text on the following line when present.

This keeps the URL machine-findable at a fixed position while still surfacing a short human-readable hint in My Maps.

Phone numbers from the copy helper are discarded and never enter domain records.

---

## Pager Strategy

The list is page-oriented (`PG` query param) with a standard pagination control (`.c-pagination`). Crawl prefers the **next** control (`a.c-pagination__arrow--next[rel="next"]`) so the extension follows the same links the site exposes, then verifies uniqueness against the published total when available.

Aborting on count mismatch avoids silently shipping incomplete maps.

---

## Security Stance

Extracted strings later flow into KML and possibly extension UI. Sanitization therefore assumes **hostile markup inside otherwise trusted pages** (defaced DOM, unexpected entity encoding, forged attributes):

- Prefer `textContent` / attribute values over HTML parsing of inner markup.
- Strip tags and dangerous URI / CSS / event-handler vectors.
- Allowlist `https` + `tabelog.com` shop paths for URLs.
- Escape again at XML emission time.

---

## Failure Philosophy

Aligned with ADR-0003: selector drift or incomplete crawl is an **explicit error**. The product must not present a partial list as a successful import of the whole saved list.
