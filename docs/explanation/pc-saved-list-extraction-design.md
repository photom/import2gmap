# Design: PC Saved-List Extraction for Chrome Extension

## Purpose

Explain why the PC saved-list extractor uses fixed DOM selectors, how fields map into the domain / KML-facing model (including collections), and how pagination and sanitization fit the Manifest V3 content-script architecture.

Normative selector tables and algorithms live in:

- [`docs/reference/tabelog-pc-saved-list-extraction-spec.md`](../reference/tabelog-pc-saved-list-extraction-spec.md)

Collections decision: [`docs/explanation/adr/0005-extract-collections-for-future-pin-styling.md`](adr/0005-extract-collections-for-future-pin-styling.md)

---

## Context

ADR-0003 requires content scripts to collect shop identity fields, build KML in memory, and import via My Maps Web UI. ADR-0005 adds **collections** on extract for a later pin-color design. The PC saved-list view exposes:

- Name and URL on a single anchor (`.simple-rvw__rst-name-target`).
- Street address in a clipboard helper textarea with a stable four-line layout.
- Area / category text (`.simple-rvw__area-catg`) as an optional one-line description (never as address).
- Collection membership via `#js-bookmarks-data` → `labels[]` keyed by `data-rst-id` (card preview DOM is not authoritative).

From that blob, read **only** label id/title. Do not ingest memo/comment fields.

---

## Layering

| Layer | Responsibility |
| :--- | :--- |
| Content script (infrastructure) | Page detect, pager navigation, DOM query, bookmarks/catalog JSON read |
| Pure parsers (domain-adjacent) | Textarea line classification, URL allowlist, sanitizers, description assembly, label mapping |
| Use case | Orchestrate full crawl → `ExtractedSavedList` → session handoff / later KML builder |
| KML builder (later) | Map `name` / `address` / `description`; future: styles from `collections` |

Parsers must be unit-testable without Chrome APIs (feed fixture HTML strings or pre-extracted field strings).

---

## Description Field Contract

KML `<description>` (and the logical `description` property) is assembled as:

1. Sanitized shop URL on the **first line** (always).
2. Optional sanitized area/category text on the following line when present.

**Collections stay structured** on `ExtractedShop.collections` / `collectionsCatalog`. They are not folded into `description`, so a future My Maps step can assign pin colors per collection without parsing free text.

Phone numbers from the copy helper are discarded and never enter domain records.

---

## Collections & Future Pin Colors

- Extraction stores membership now; **pin coloring is out of scope** until a follow-up design.
- Open product questions for that follow-up (not decided here): one collection vs many per shop; default color when empty; whether catalog order defines a palette.

---

## Pager Strategy

The list is page-oriented (`PG` query param) with a standard pagination control (`.c-pagination`). Crawl prefers the **next** control (`a.c-pagination__arrow--next[rel="next"]`), re-reads bookmarks/catalog each page, merges shop collections and catalog by id, then verifies uniqueness against the published total when available.

Aborting on count mismatch avoids silently shipping incomplete maps.

---

## Security Stance

Extracted strings later flow into KML and possibly extension UI. Sanitization therefore assumes **hostile markup inside otherwise trusted pages** (defaced DOM, unexpected entity encoding, forged attributes):

- Prefer `textContent` / attribute values over HTML parsing of inner markup.
- Strip tags and dangerous URI / CSS / event-handler vectors.
- Allowlist `https` + `tabelog.com` shop paths for URLs.
- Treat bookmarks JSON as untrusted input: parse defensively; allowlist label fields only.
- Escape again at XML emission time.

---

## Failure Philosophy

Aligned with ADR-0003: selector drift or incomplete crawl is an **explicit error**. The product must not present a partial list as a successful import of the whole saved list. Empty collections on a shop are success; corrupt bookmarks/catalog JSON is failure.
