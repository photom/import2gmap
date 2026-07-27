# ADR-0005: Extract Collections for Future Pin Styling

- **Status**: Accepted
- **Date**: 2026-07-28
- **Authors**: User & Agent
- **Related**: [ADR-0003](0003-chrome-extension-my-maps-web-import.md), [extraction spec](../reference/tabelog-pc-saved-list-extraction-spec.md)

## Context & Problem Statement

ADR-0003 limited extracted shop fields to name, address, and Tabelog URL. Users organize saved shops into Tabelog **collections (labels)**. A future My Maps import should color pins per collection. Collection membership is not reliably present in per-card static markup (`.js-hozon-preview` is often empty until hydrated); it lives in the page’s bookmarks JSON `labels` entries.

## Decision Drivers & Constraints

- Extraction-only for this change; pin coloring and KML `<Style>` mapping remain future work.
- Minimize privacy surface: do not ingest bookmark memos/comments from the same JSON blob.
- Keep structured `collections` on the domain model (not only stuffed into `description`).

## Considered Options

1. **Ignore collections until import styling is designed** — blocks forward-compatible extract storage.
2. **Scrape only visible preview DOM** — unreliable on saved-list HTML.
3. **Read `labels` from `#js-bookmarks-data` + catalog from `#js-collection` / sidebar select** — matches how the site associates shops to collections.

## Decision Outcome

- **Chosen Option**: Option 3.
- Each `ExtractedShop` includes `collections: { id, name }[]` (may be empty).
- Crawl result also includes `collectionsCatalog` for id→name (and later color) mapping.
- Allowlisted read of `#js-bookmarks-data`: **`labels[].id` / `labels[].title` only**.
- Pin color rules, My Maps style application, and multi-collection conflict policy are **explicitly deferred**.

## Consequences

- **Positive**: Session/storage handoff can carry collections into a later styling design without re-scraping.
- **Trade-offs**: Couples extraction to an undocumented JSON attribute shape; guarded by parse errors (`BookmarksDataInvalid` / `CollectionCatalogInvalid`) and fixtures.
