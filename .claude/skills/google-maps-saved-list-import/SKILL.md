---
name: google-maps-saved-list-import
description: Automate adding places to a user's native Google Maps saved list (not My Maps) from a Manifest V3 Chrome extension, including duplicate-checking before add. Use when implementing or spiking Google Maps saved-list creation, existing-entry duplicate detection, address search, or add-to-list UI automation.
---

# Google Maps Saved List Import

Supersedes `google-my-maps-web-import` for the import path — see [ADR-0008](../../../docs/explanation/adr/0008-google-maps-saved-list-import.md).

- Google Maps' native saved lists have no public "create list" or "add place to list" API; automate only the Web UI (`www.google.com/maps`) in the user's authenticated Chrome session.
- Never read credentials, cookies, or tokens.
- **Ensure the `食べログ` list exists**: detect it among the user's saved lists; create it only if missing. This must be idempotent — re-running the flow must never create a second `食べログ` list.
- **Duplicate check before add**: for each shop, detect whether it already has a matching entry in the `食べログ` list before doing anything else. Skip on a match instead of adding a duplicate. (Unlike the old My Maps flow, which always created a brand-new map, this list persists across runs, so this check is required, not optional.)
- **Search by address, resolve to one place**: when no existing match is found, search Google Maps using the shop's address (the most reliable unique locator for a single physical restaurant), and add the place to the `食べログ` list only when the search resolves to a single, unambiguous result.
- An empty or ambiguous search result is an explicit **per-shop** skip/failure — report it, never guess which place was meant.
- Version selectors, use bounded timeouts, and raise an explicit UI-changed failure code for any unexpected DOM state — no silent partial success.
- Require a feasibility spike (mirroring the My Maps spike gated by ADR-0004 §6) covering: list-exists/create, duplicate-detection, address search + resolve, and add-to-list — before full implementation. See [ADR-0008](../../../docs/explanation/adr/0008-google-maps-saved-list-import.md) for the pass criteria.
- Inject the Google Maps content script programmatically after the optional host permission (candidate: `https://www.google.com/maps/*`, to be confirmed during the spike) is granted.
