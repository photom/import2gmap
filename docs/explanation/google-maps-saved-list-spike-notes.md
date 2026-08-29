# Google Maps Native Saved List — Spike Notes

Records the DOM shape behind the [ADR-0008](adr/0008-google-maps-saved-list-import.md) automation
(`entrypoints/gmaps.content.ts`, `src/domain/google-maps/*`). Findings come from a single
English-UI-locale manual capture of the live Google Maps Web UI (`www.google.com/maps`) — not from
a published spec, since this UI is undocumented and Google-internal, same situation as the
superseded My Maps spike.

**Privacy note**: the source captures contained the account's own personal saved lists and search
history. Nothing from their actual content (list names, place names, counts) is reproduced here or
anywhere else in this repository — only the generic structural shape (tag names, `role`/`jsaction`/
`data-*` attributes, and the general layout) is recorded. Raw local captures, if kept at all for
reference, belong only under the gitignored `sample/` directory (see
[html-fixture-policy.md](../reference/html-fixture-policy.md)) — never committed.

**Status: partial.** This covers only "ensure the target saved list exists" (open the menu, open
the Saved pane, detect an existing list by name, create one if missing, rename it). It does
**not** cover per-shop duplicate detection against real list contents, address search, or adding a
place to a list — those still need their own recon pass before implementation (see "Open
follow-ups" below and the decision checklist).

**Not independently verified against a live Japanese-locale account.** Every predicate that could
be anchored on a non-text signal (a `jsaction` handler name, a `role`, a structural shape) was
built that way specifically so it should hold regardless of UI locale; every predicate that had to
fall back to matching literal text carries an explicit, best-effort Japanese guess — see
`src/domain/google-maps/google-maps-detectors.ts` for exactly which candidates are confirmed
Google-standard wording versus unconfirmed guesses.

---

## 1. Opening the saved-lists pane

Two clicks, both in-place SPA mutations (no document navigation):

1. A toolbar button (`aria-label="Menu"` in English) opens the app menu. Its `jsaction` attribute
   includes the handler `settings.open`, which is the anchor `isMenuButton` prefers — non-text, so
   expected to hold in any locale.
2. A menu item opens the saved-lists pane. Its `jsaction` includes the handler
   `settings.yourplaces` — again preferred over its label text (`"Saved"` in English).

Both buttons render immediately in the captured DOM; the automation still polls with a bounded
timeout rather than assuming they're already present, consistent with every other wait in this
codebase.

## 2. The saved-lists pane shape

The pane that opens is a `[role="main"]` element containing:

- A `[role="tablist"]` with (at least) three tabs; the first is the default active one.
- Inside the active `[role="tabpanel"]`: a "New list" trigger button, followed by one button per
  existing saved list.

`findSavedListsPaneRoot` requires **both** the tablist and the New-list button to be present under
a `[role="main"]` candidate, rather than trusting the pane's own `aria-label` text (English in the
capture; Japanese wording unconfirmed) — this makes the detector locale-independent.

The "New list" button carries `data-value="New list"` in the capture. Whether this is a
non-translated internal value (like the My Maps spike's `CREATE` button) or happens to just match
the English locale is **unconfirmed** — treated as a hint, with a bilingual `aria-label` fallback.

## 3. Existing-list rows

Each list row is a button whose accessible content is, in DOM order: an icon, the list's name, and
a metadata line shaped like `"Private · 12 places"` (English capture; visibility word and unit
word are locale-dependent, but the middle-dot separator and the digit are expected to hold).
`parseSavedListEntries` matches rows structurally — the first leaf text node before a leaf that
looks like a metadata line (dot + digit) is taken as the name — rather than depending on Google's
actual (hashed, deploy-churn-prone) class names for "the name element" and "the metadata element".

## 4. Creating and renaming a new list

Clicking "New list" reveals an editable title, pre-filled with a placeholder ("Untitled list" in
the English capture). **The exact interaction mechanism was not confirmed**: the captured markup
showed only a plain `<span>` holding that text, not an `<input>` — it is unknown whether this span
is itself `contenteditable`, or whether clicking it swaps in a real form control. The
implementation (`createList` in `entrypoints/gmaps.content.ts`) handles both possibilities
defensively: it clicks the placeholder element once if it isn't already an `<input>`/`<textarea>`,
re-polls briefly in case that swapped in a real control, then sets the value (or `textContent`) and
dispatches both `input` and `change` events — the same "set value, then dispatch both events"
pattern the old My Maps spike found necessary for Closure-compiled apps.

A "Done" button confirms the rename. Its `jsaction` handler carries a stable **suffix**,
`.done` (e.g. `pane.wfvdle636.done`) — the numeric prefix is a per-render instance id, not reusable
across sessions, but the suffix is treated as a stable, locale-independent anchor.

After Done, the flow does **not** assume it landed back on the list pane — it polls for the pane
directly, and if that doesn't appear quickly, looks for a "Back" button (`jsaction` handler
`omnibox.back`) and clicks it once before polling again. Success is only ever declared after
re-parsing the pane and finding the target list name actually present — never from the click
sequence alone, the same "verify, don't assume" lesson the My Maps automation learned repeatedly.

---

## 5. Chrome Web Store / target-site policy risk note

Same posture as the superseded My Maps automation: this scripts an undocumented, internal,
Closure-compiled Google UI that can change at any time without notice. Every step above fails
explicitly (`GoogleMapsUiChanged`) on a missing selector or timeout rather than guessing. The
extension only acts after an explicit user action, never touches Google's login form, cookies, or
OAuth, and is scoped to the single user's own authenticated session — consistent with ADR-0003's
privacy stance, now applied to this target instead of My Maps.

---

## Open follow-ups (blocking further ADR-0008 implementation)

- **Duplicate detection against real shops.** `hasListNamed` only answers "does a list with this
  name exist" — it does not yet look *inside* a list to check whether a specific shop is already
  saved there. That needs its own recon pass against an opened list's contents.
- **Address search and single-result resolution.** Not captured at all yet — need a recon pass on
  the Google Maps search box (`input[name="q"][role="combobox"]`, `jsaction` handlers under the
  `omnibox.*` namespace, per a quick structural check of the regular Maps home page) and on
  whatever UI appears for an ambiguous vs. single search result.
- **Adding a place to a specific list.** Not captured — likely a "Save" control on a place's detail
  panel with its own list-picker UI; needs its own recon pass.
- **Japanese-locale verification.** Every bilingual text fallback in
  `src/domain/google-maps/google-maps-detectors.ts` is a best-effort, unconfirmed translation.
- **Logged-out detection.** Unlike the old My Maps flow's `accounts.google.com` redirect check, no
  equivalent detection has been captured yet for the regular Google Maps UI; a logged-out account
  currently just falls through to `GoogleMapsUiChanged` via the ordinary menu/pane timeout, without
  a dedicated diagnostic code.
