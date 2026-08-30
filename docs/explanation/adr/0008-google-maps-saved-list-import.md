# ADR-0008: Switch Import Target from My Maps to Google Maps' Native Saved List

- **Status**: Accepted
- **Date**: 2026-08-29
- **Authors**: User & Agent
- **Related**: Supersedes the import-path portion of [ADR-0003](0003-chrome-extension-my-maps-web-import.md); supersedes [ADR-0004](0004-extension-implementation-baseline.md) §1 (My Maps / picker host permissions) and §6 (My Maps feasibility spike gate) for the import path. Extraction-phase decisions in ADR-0003 and [ADR-0005](0005-extract-collections-for-future-pin-styling.md) are unaffected. See the [decision checklist](../chrome-extension-decision-checklist.md) for the updated status table.

## Context & Problem Statement

ADR-0003 chose My Maps (a separate Google product for building custom layered maps) as the import target: an in-memory KML file fed into the My Maps Web UI, which always creates a brand-new map. In practice, My Maps is awkward for day-to-day use — pins placed there don't show up in the Google Maps app/site the user actually navigates with day to day, and every run created a throwaway new map rather than accumulating into one place.

The user wants extracted Tabelog shops to land in a **Google Maps saved list** instead — the native "save a place" feature already used for ordinary Google Maps favorites/lists — so the result is usable directly inside Google Maps.

The Tabelog extraction phase (PC saved-list DOM scraping into `ExtractedShop`, with `collections`/`collectionsCatalog` per ADR-0005) is unaffected by this change and remains exactly as ADR-0003/ADR-0005 decided. Only what happens after extraction changes.

## Decision Drivers & Constraints

- Same privacy stance as ADR-0003: user-initiated only, no credential/cookie/OAuth reads, narrowest viable host permissions, explicit failure over silent partial success.
- **Idempotency is now a first-class requirement.** The old My Maps flow always created a fresh map, so duplicate entries across runs were structurally impossible. A persistent saved list is reused across runs, so re-running the extension on an overlapping saved list must not create duplicate entries.
- No official API exists for "create a saved list" or "add a place to a saved list" (same undocumented-UI situation ADR-0003 already accepted for My Maps) — Web UI automation is still the only viable path; no Places API, no Drive API, no OAuth token flow.

## Considered Options

1. **Keep My Maps** — rejected; doesn't solve the usability problem the user raised (a separate product from everyday Google Maps).
2. **Google Maps native saved list** (the same list mechanism behind "お気に入り" / custom lists under 保存済み) — **Chosen**. Matches "保存リスト" as the user described it, and a named list is the natural home for a batch of shops grouped under one Tabelog import.
3. **Google Maps "labels"** (drop a pin, attach a free-text label, no list grouping) — considered but rejected; a list is the closer structural match to "a named collection of places," and keeps room for the ADR-0005 collections idea later (e.g. one list per Tabelog collection) without redesigning the target primitive again.

## Decision Outcome

**Chosen option**: automate the Google Maps Web UI's native saved-list feature instead of the My Maps Web UI.

New import flow, run once per extraction:

1. **Ensure the list exists.** Look for a saved list literally named `食べログ` under the user's Google Maps saved lists. Create it if it doesn't exist yet. This step must be idempotent — a second run must reuse the same list, never create a second `食べログ` list.
2. **Per extracted shop** (name, address, URL, collections — unchanged extraction output):
   - **Check for an existing match** in the `食べログ` list (dedupe check). The exact matching signal (name+address, or the saved Tabelog URL if the list UI exposes a note/description field per item) is an open question for the implementation spike below — not resolved by this ADR.
     - **Match found** → skip; do not add a duplicate.
     - **No match** → **search Google Maps by the shop's address** (the Tabelog address is the most reliable unique locator for a single physical restaurant), resolve to a single place result, and **add that place to the `食べログ` list**.
       - **Search yields nothing, or an ambiguous result the automation cannot safely resolve to one place** → skip that shop as an explicit **per-shop** failure (reported to the user in the run summary), never a guess.
3. No map/layer creation, no KML generation, no `docs.google.com/picker` iframe automation, no map-title rename step — all of that was specific to the old My Maps target and no longer applies to the import path.

**Permissions**: the My Maps + picker optional host patterns from ADR-0004 §1 (`https://www.google.com/maps/*` for My Maps, `https://docs.google.com/picker*`) are replaced by a narrow optional host permission for the native Google Maps UI (candidate pattern: `https://www.google.com/maps/*`, to be confirmed — and possibly narrowed further — during the feasibility spike below; no `docs.google.com/picker*` is needed since there is no file-upload dialog in this flow).

**Feasibility spike required before implementation** (mirrors the ADR-0004 §6 gate): must demonstrate, with sanitized fixtures / manual notes, all of:

1. Detecting whether the user is authenticated in the Google Maps tab; logged out fails with an explicit code, same as the old `MyMapsNotReady` precedent — no credential prompts from the extension.
2. Detecting whether a saved list named `食べログ` already exists, and creating it when it doesn't (idempotent — a second spike pass against the same account must not produce two lists).
3. Detecting whether a specific shop already has an entry in that list (the dedupe check) — this is new; there was no equivalent requirement under the old "always a new map" design.
4. Searching Google Maps by address, resolving to a single place, and adding that place to the list; explicit failure (not a guess) when the search is empty or ambiguous.
5. Any unexpected DOM/UI state → an explicit failure code (successor to `MyMapsUiChanged`) within bounded timeouts; no silent partial success.
6. A short written note on Chrome Web Store / target-site policy risk for automating this UI, same as the My Maps spike's §5 note.

## Consequences

- **Positive**: imported shops land directly in the Google Maps surface the user actually uses; a single persistent list accumulates across multiple extraction runs instead of leaving behind a pile of one-off maps.
- **Negative / Trade-offs**:
  - **Superseded and now historical for the import path**: ADR-0003's My Maps import-path decision and ADR-0004 §1's My Maps/picker permissions and §6's spike gate/pass criteria. Extraction-phase decisions in both ADRs are untouched. (2026-08-29: the old My Maps automation code and its spike-results doc have since been deleted outright — see the update below — rather than kept as superseded/historical files.)
  - **New dedup design work.** The old flow never needed a "does this already exist" check; the matching rule (name+address heuristic vs. a stored identifier) still needs to be designed and validated against the real saved-list UI during the spike — this ADR states the requirement, not the algorithm.
  - **Every downstream reference doc that encoded My Maps specifics is now stale for the import path** and needs a follow-up rewrite once the new spike's selectors/flow are known: the messaging protocol, the import-side fields in the session storage schema, the error codes, the import-step screens/sequences in the UI spec / UI design / extract-confirm sequences, quick-start, and the Chrome Web Store permission justifications. These are tracked as open items in the decision checklist — see the update below for what has since actually been rewritten.
  - A new feasibility spike is required before implementation can start, same undocumented-UI risk profile as the original My Maps spike.

## 2026-08-29 update: My Maps deleted, ensure-list-exists step implemented

Per explicit user direction, the superseded My Maps code and documentation have been **deleted**
outright rather than merely marked superseded: `entrypoints/mymaps.content.ts`,
`src/domain/my-maps/`, `src/domain/kml/`, `src/infrastructure/permissions/my-maps-origins.ts`,
their tests, `my-maps-import-spike-results.md`, `kml-data-schema.md`, `test-plan-phase3.md`, and
the `google-my-maps-web-import` skill are gone from this repository. ADR-0003 and ADR-0004 remain
(their extraction-phase decisions are still in effect), each with a superseded-section note
pointing here.

A first real DOM capture against the live Google Maps UI (English locale) allowed implementing and
shipping **step 1 of this ADR's flow — "ensure the `食べログ` list exists"** end to end (open the
saved-lists pane, detect the list by name, create-and-rename it if missing):
`src/domain/google-maps/` (pure detectors + pane parser, unit-tested against sanitized synthetic
fixtures under `test/fixtures/google-maps/`), `entrypoints/gmaps.content.ts` (thin content-script
wrapper), and `entrypoints/background.ts`'s `runEnsureListJob`. See the (sanitized, no personal
data) [spike notes](google-maps-saved-list-spike-notes.md) for the DOM shape this relies on and
what remains unconfirmed (most notably: Japanese-locale text fallbacks, and the exact rename-field
interaction mechanism).

**Still open, not yet implemented** (tracked in the decision checklist): per-shop duplicate
detection against a list's actual contents, address search + single-result resolution, and adding
a resolved place to the list. The popup's import step currently only exercises step 1 above; it
does not yet add any shops to the list. Every downstream reference doc listed as stale above has
now been rewritten to match this partial implementation (see the decision checklist).

## 2026-08-30 update: step 2 (per-shop search + add) implemented

Real DOM captures of the list's own detail pane (opened by clicking its row) allowed implementing
**step 2 of this ADR's flow** end to end: dedupe-check each extracted shop by exact name match
against the list's existing place cards; if absent, open the list's "Add a place" search box,
search `"{name} {address}"`, click the top suggestion, and confirm it was added. New pure modules
(`src/domain/google-maps/add-place-search.ts`, unit-tested against sanitized synthetic fixtures)
and `entrypoints/gmaps.content.ts`'s `handleAddShop`; `entrypoints/background.ts`'s
`runEnsureListJob` now loops one `GMAPS_ADD_SHOP` message per shop after the list is confirmed
ready, tallying added/skipped/failed counts (`ImportSummary`, persisted to the session and shown
on the popup's completion screen) — a per-shop failure is tallied, not a job-aborting failure, per
this ADR's original "skip, don't guess" decision. See the (sanitized) [spike notes §5](google-maps-saved-list-spike-notes.md)
for the DOM shape. **Confirmed working live the same day** against a real account: a batch of 42
extracted shops was processed, correctly adding new ones and skipping an already-present one by
exact name match, with the pane-reuse and search-box-reopen optimizations both engaging correctly
across shops. Still open: no-match/ambiguous search results were never captured (so "always take
the top suggestion" is unvalidated; a zero-result search is currently accepted as a bounded-timeout
skip rather than a dedicated explicit code), and the "added" confirmation, while it worked, races
two signals rather than one (see spike notes §5's 2026-08-30 live-run note) since a single-signal
check felt slow to the user in practice.

With this, both steps of this ADR's decision are implemented **and** live-confirmed for the core
path; the decision checklist tracks the remaining edge-case gaps.
