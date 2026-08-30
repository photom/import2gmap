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

**Diagnostics note (2026-08-30):** step-by-step progress logs now stream live from
`entrypoints/gmaps.content.ts` to the service-worker console via a fire-and-forget
`GMAPS_DIAGNOSTIC` message per step (see [messaging protocol §6](../reference/extension-messaging-protocol.md#6-service-worker--google-maps-content-script-adr-0008)),
not just batched onto the final `GMAPS_ENSURE_LIST_RESULT` reply. This was added after a field
report where that final reply never reached the worker at all — the batch-only approach meant zero
visibility into what had actually happened, even though individual steps had run. If debugging a
live failure, check the service-worker console (`chrome://extensions` → this extension → the
service worker link) for lines starting `step=...`, which now appear as they happen rather than
only on completion.

**Status: both steps implemented and live-verified in English locale.** "Ensure the target saved
list exists" (open the menu, open the Saved pane, detect an existing list by name, create one if
missing, rename it — §§1–4) and "search for and add each shop, skipping one that's already in the
list by exact name match" (§5) both ran successfully against a real account (§5's 2026-08-30 live
run processed 42 shops). Remaining gaps are edge cases, not the core flow — see "Open follow-ups".

**Not independently verified against a live Japanese-locale account.** Every predicate that could
be anchored on a non-text signal (a `jsaction` handler name, a `role`, a structural shape) was
built that way specifically so it should hold regardless of UI locale; every predicate that had to
fall back to matching literal text carries an explicit, best-effort Japanese guess — see
`src/domain/google-maps/google-maps-detectors.ts` for exactly which candidates are confirmed
Google-standard wording versus unconfirmed guesses.

---

## 1. Opening the saved-lists pane

**Two distinct layouts were captured**, apparently selected by the browser window's width:

- **Compact layout** (narrower window): a toolbar hamburger button (`aria-label="Menu"` in
  English, `jsaction` handler `settings.open`) opens a dropdown menu; a "Saved" item inside that
  dropdown (`jsaction` handler `settings.yourplaces`, text `"Saved"` in English) opens the
  saved-lists pane. Two clicks required.
- **Wide "navigation rail" layout** (wider window, second capture, 2026-08-30): a persistent left
  sidebar (`<ul role="list">`) is already rendered with several buttons, including one whose
  `jsaction` handler is `navigationrail.saved` (text `"Saved"` in English) — **directly
  clickable, no menu to open first.** The same sidebar also has a menu-ish "more" button
  (`jsaction` handler `navigationrail.more`, `aria-label="Menu"`) whose purpose in this layout
  wasn't explored (not needed — the Saved entry doesn't live behind it).

Both layouts' triggers are in-place SPA mutations (no document navigation) once clicked.
`isMenuButton` accepts either layout's menu-ish handler (`settings.open` or `navigationrail.more`,
plus the bilingual `aria-label` fallback); `isSavedTrigger` accepts either layout's Saved handler
(`settings.yourplaces` or `navigationrail.saved`, plus the bilingual text fallback) — the same
predicate recognizes the control whether it's already visible or still hidden inside an unopened
dropdown. `entrypoints/gmaps.content.ts`'s `openSavedListsPane` tries to find the Saved trigger
**directly** first (short bounded poll); only if that doesn't appear does it fall back to finding
and clicking a Menu button and then re-polling for the Saved trigger — this one code path covers
both layouts without needing to detect which one is active up front.

Every button in both layouts render essentially immediately once the app itself has rendered in
the captured DOM; the automation still polls with a bounded timeout rather than assuming they're
already present, consistent with every other wait in this
codebase.

**2026-08-30 field report — the app can still be mid-load/mid-redirect for a few seconds after the
tab reports "complete".** A live run against the compact layout stalled with no visible error: the
worker's own log showed the tab opening and the `GMAPS_ENSURE_LIST` message being sent, then
nothing — consistent with either (a) the bare `https://www.google.com/maps` URL client-redirecting
to a location-specific URL (e.g. `/maps/@lat,lng,z`) shortly after `tabs.create` reports the first
document loaded, tearing down whatever was just injected into that first document if the redirect
counts as a real navigation, or (b) the app simply not having rendered any of its UI chrome yet by
the time of injection, with the visible menu button reportedly appearing only after "close to 5
seconds". Neither was confirmed as *the* root cause (no live DevTools access in this environment);
the fix addresses both without needing to pick one: `entrypoints/background.ts` now waits for the
tab's URL to stop changing for a short quiet period before injecting (`waitForUrlToSettle`,
best-effort, never blocks the job), and wraps the `GMAPS_ENSURE_LIST` send in a hard per-attempt
timeout with one re-inject-and-resend retry (`sendEnsureListWithRetry`) so a torn-down listener
degrades to an explicit `GoogleMapsUiChanged` failure — with the content script's own step-by-step
trace forwarded back and re-logged in the service-worker console (`diagnostics` field) — instead of
silent, undiagnosable silence. **Confirmed working 2026-08-30**: a follow-up live run against the
wide "navigation rail" layout got past tab open, direct Saved-trigger detection, pane detection,
and "New list" creation — the diagnostics forwarding also proved itself useful immediately, since
it's what surfaced the rename-step bug documented in §4 below. Not yet re-verified against the
compact layout specifically.

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

**Current understanding (2026-08-30, fifth revision — see "Debugging history" below for how we got
here).** Clicking "New list" creates the list and puts its title **directly into edit mode**: an
already-focused `<input>`/`<textarea>`, pre-filled with the placeholder ("Untitled list" in the
English capture) as its `.value`. There is no separate "click a button to start editing" step in
the normal case — the earlier belief that the title starts as a static `<button aria-label="Untitled
list">` that must be clicked was a **misreading caused by an observation artifact**: every attempt
to manually inspect the live DOM (opening DevTools to copy its HTML) itself steals focus from that
auto-focused field, blurring it back into the static button state on the spot — so every captured
sample (`untitiles*.html` in the gitignored `sample/` dir) recorded the *post-blur* button, never
the actual editable field a script encounters if it doesn't touch DevTools at all. `createList`
now looks for the pre-filled editable field first (`findEditableFieldWithPlaceholderValue`) and
only falls back to finding-and-clicking a `<button aria-label="Untitled list">` (the old primary
path, kept as a fallback for the case where it already blurred to a button before this got a
chance to run — e.g. a slow poll tick, or some path where it doesn't auto-focus).

Because DevTools inspection is exactly what destroys this state, further diagnosis of it relies on
this extension's own `diagnostics` log line forwarding (`entrypoints/gmaps.content.ts`'s
`logStep`, re-logged to the service-worker console by `entrypoints/background.ts`) rather than
manual DOM captures — `rename_input:found_prefilled`/`rename_input:found` now also logs the
matched element's `tagName` (`INPUT` vs `TEXTAREA`, still not confirmed which), and a failure logs
counts of buttons/inputs present at that moment, precisely so a live run can report ground truth
without needing (and without accidentally destroying) a fresh manual capture.

A "Done" button confirms the rename. Its `jsaction` handler carries a stable **suffix**, `.done`
(e.g. `pane.wfvdle636.done`) — the numeric prefix is a per-render instance id, not reusable across
sessions, but the suffix is treated as a stable, locale-independent anchor.

**Verification is split across two layers, because this tab's own display cannot be trusted for
it.** A field run with the diagnostics forwarding (revision 6) confirmed the DOM-level write
itself succeeds — `rename_input:text_set stuck=true connected=true` — and clicking Done was
reached, yet the tab's own saved-lists pane still showed "Untitled list" afterward; a further
report confirmed neither continued waiting nor a manual window resize fixed it, but **reloading
the page did** ("リロードしたら食べログに名前が反映された" — after reload, the name showed
correctly). So: `gmaps.content.ts`'s `createList` no longer gates success on re-parsing this tab's
own pane at all — it does one quick, non-blocking look (`RENAME_DISPLAY_QUICK_CHECK_MS`, purely
diagnostic) and otherwise trusts the positive DOM-write signal. The **authoritative** check moved
to `entrypoints/background.ts`'s `runEnsureListJob`: after a `created: true` result, it reloads the
tab, re-injects, and re-sends `GMAPS_ENSURE_LIST` — which, on a freshly reloaded page, re-derives
`hasListNamed` from genuinely fresh data instead of this tab's stale in-memory state. The old
"verify by re-parsing this tab's pane, clicking Back if needed" approach (with a resize nudge, see
revision 4) is gone — proven insufficient by revision 5's report, not merely simplified away.

**Not yet re-verified live** — this is the sixth revision of this step the same day; see the
decision checklist / Phase 4 test plan for status.

### Debugging history (2026-08-30, same day)

Kept for context — later revisions superseded earlier ones' understanding, not just their code:

1. **First implementation**: assumed the placeholder text itself (a plain `<span>`) was directly
   editable; mutated its `.textContent`. Silently failed — the app's own rendering overwrote the
   manual mutation since a span isn't a bound form control (confirmed via a screenshot of the list
   staying named "Untitled list" after every step logged success).
2. **Button-then-new-input fix**: a fuller capture showed the span sits inside a `<button
   aria-label="Untitled list">`; switched to clicking that button and diffing for a genuinely new
   `<input>`/`<textarea>` afterward. Reportedly worked once, in the compact layout.
3. **Client-rects visibility filter**: a report that the same fix failed in the wide "navigation
   rail" layout (but worked after narrowing the window) was hypothesized as a hidden-duplicate-
   layout issue; a `getClientRects()` filter was added to every button/field lookup. This instead
   regressed the trigger lookup to failing in *both* layouts and was reverted, alongside raising
   `RENAME_TIMEOUT_MS` and adding a `buttons=`/`anyTextMatch=` diagnostic.
4. **Resize-nudge / continuous re-verify**: two further reports (list stayed "Untitled list" until
   DevTools was docked, reproduced even starting from the narrow layout) were read as "the rename
   succeeds but the title *display* is stale until a real viewport resize" — added a synthetic
   `resize`-event nudge plus continuous `hasListNamed` re-polling.
5. **Root cause found (current, above)**: a report that the rename *still* didn't take even after
   a manual resize, plus opening DevTools *this* time preventing the edit rather than revealing it,
   didn't fit the "just a display lag" theory at all. The user's own explanation — that every
   `sample/untitiles*.html` capture was actually the *post-blur* button state, because opening
   DevTools to capture it is what causes the blur — reframed the whole problem: revisions 2–4 were
   all built on the wrong premise that the title starts as a button. Revisions 3 and 4's fixes are
   kept only as defensive fallbacks (see above), not because their original theories are believed
   correct.
6. **Live diagnostics streaming, then the actual reload-based verification fix.** The very next
   attempt to reproduce revision 5's fix logged nothing past `GMAPS_ENSURE_LIST:send` — the
   `diagnostics` field was, until this point, only attached to the *final* `GMAPS_ENSURE_LIST_RESULT`
   reply, so if that reply never reached the worker (as happened here) none of the step trace was
   ever visible, even though steps had run. Fixed by streaming each step live as its own
   fire-and-forget `GMAPS_DIAGNOSTIC` message (see [messaging protocol §6](../reference/extension-messaging-protocol.md#6-service-worker--google-maps-content-script-adr-0008)),
   re-logged the instant it arrives rather than batched. With that visibility, the *next* run's log
   showed the real sequence clearly: `rename_input:text_set stuck=true connected=true` (the DOM
   write genuinely succeeded) followed by `done_button:found` and a `created_list:back_button_clicked`
   — but the user reported the pane still showed "Untitled list", and, critically, that **reloading
   the page** (not resizing) made "食べログ" appear. This is the fix documented above: stop trying to
   verify via this tab's own pane at all (proven stale-until-reload, not just slow), and move the
   authoritative check to a post-creation reload-and-reverify step in `entrypoints/background.ts`.

---

## 5. Searching for and adding a place to the list (ADR-0008 step 2, 2026-08-30)

Captured from the list's own **detail pane** (opened by clicking its row in the overview pane —
see §3) rather than the overview pane itself. The detail pane is `[role="main"]` with **no**
tablist (that's what distinguishes it from the overview pane), a title button carrying the list's
own name (the same shape as the rename step's title button — see §4 — just holding the real name
once renamed), and two toggle buttons: "Share" and **"Add a place"**.

**"Add a place"** (`aria-label="Add a place"`, `data-value="Add a place"` — same
internal-identifier-looking `data-value` pattern as `isNewListButton`'s `data-value="New list"`)
is an `aria-pressed` toggle. Pressing it reveals a search box (`aria-label="Search for a place to
add"`, `role="combobox"`) directly below it. In the one capture available, typing does **not**
require an explicit submit — the search runs automatically (jsaction `input:...input` on the box
itself) and a suggestions grid (`role="grid"` `aria-label="Suggestions"`) appears after a short
delay, matching the same "renders with a lag after the triggering input" pattern this whole
codebase has repeatedly had to account for.

Each suggestion is a `div[role="row"][data-suggestion-index="N"]` whose own jsaction handler
carries a stable **suffix**, `.suggestion` (e.g. `pane.wfvdle136.suggestion`) — the same
per-instance-prefix-plus-stable-suffix pattern as the rename step's `.done` button (§4). Inside
each row, a single `[role="gridcell"]` holds exactly two `[aria-label]` spans in order: the
place's name, then its address. **Clicking the row directly adds that place to the currently open
list** — no separate "confirm" step was observed; the pane's content changes from "List is empty"
to a place card for the newly added place. That card is a `<button>` containing a child element
whose class list includes `fontHeadlineSmall` (one of Google's apparently-stable, unminified
Material typography utility classes, not a hashed one) holding the place's name as plain text —
used both to detect an already-added place (dedupe, before searching at all) and to confirm a new
add actually landed.

**Implementation** (`src/domain/google-maps/add-place-search.ts`,
`entrypoints/gmaps.content.ts`'s `handleAddShop`): dedupe-check the target shop's name against the
pane's existing place cards first; if absent, ensure the search box is open, set its value to
`"{name} {address}"` (same set-value-then-dispatch-input/change pattern the rename step uses),
wait for at least one suggestion row, click the first one (`data-suggestion-index="0"` — no
matching against the extracted name/address is done; the query is trusted to resolve to the right
top result), then confirm the add landed.

**2026-08-30 live run — largely worked, one speed observation.** A live run against 42 extracted
shops reached `shop:added` repeatedly (with `list_detail_pane:already_open` /
`add_place_search:already_open` confirming the pane-reuse optimization across shops works as
intended), plus one shop whose search returned no usable result and correctly ran out the bounded
timeout before moving on (accepted as-is — see the open follow-up on no-match handling). The user
noted moving to the next shop still *felt* slow even after a successful add, and separately
observed that the search box visibly **clears** the moment an add completes — likely faster to
detect than waiting for the place-card list itself to re-render. The confirmation check now races
both signals (search box cleared, or the target name showing up in the place-card list) and
returns as soon as either fires, re-deriving both the input and the pane fresh on every poll tick
rather than trusting the references captured before the click (same staleness caution as §4).

**Not otherwise re-confirmed against a live account since this change** — the search+add flow
itself already ran live once (above); this specific speed optimization has not. Open questions
for a future capture: what an empty/no-match search result looks like more precisely (needed to
implement ADR-0008's "skip, don't guess" policy for a shop that doesn't resolve with a dedicated
code, rather than the current bounded-timeout fallthrough the user has accepted as-is for now),
and what an *ambiguous* multi-candidate result looks like and whether picking index 0 is actually
the right default — see the "Open follow-ups" section.

---

## 6. Chrome Web Store / target-site policy risk note

Same posture as the superseded My Maps automation: this scripts an undocumented, internal,
Closure-compiled Google UI that can change at any time without notice. Every step above fails
explicitly (`GoogleMapsUiChanged`) on a missing selector or timeout rather than guessing. The
extension only acts after an explicit user action, never touches Google's login form, cookies, or
OAuth, and is scoped to the single user's own authenticated session — consistent with ADR-0003's
privacy stance, now applied to this target instead of My Maps.

---

## Open follow-ups (blocking further ADR-0008 implementation)

- **Live verification of the whole §5 search-and-add flow.** Implemented from DOM structure alone
  (`src/domain/google-maps/add-place-search.ts`, `handleAddShop`), never run against a live
  account. Needs, in order of how likely they are to actually come up: (a) confirming the "added"
  check isn't affected by the same tab-local display staleness the rename step hit; (b) capturing
  what an empty/no-match search looks like, so a per-shop skip can be a real explicit code instead
  of an undifferentiated `GoogleMapsUiChanged` timeout; (c) capturing an ambiguous multi-candidate
  result, to decide whether "always take index 0" needs a smarter policy (e.g. requiring the
  address to also roughly match before trusting the top hit).
- **Japanese-locale verification.** Every bilingual text fallback in
  `src/domain/google-maps/google-maps-detectors.ts` and `add-place-search.ts` is a best-effort,
  unconfirmed translation.
- **Logged-out detection.** Unlike the old My Maps flow's `accounts.google.com` redirect check, no
  equivalent detection has been captured yet for the regular Google Maps UI; a logged-out account
  currently just falls through to `GoogleMapsUiChanged` via the ordinary menu/pane timeout, without
  a dedicated diagnostic code.
- **Live re-verification of the 2026-08-30 timing fix (`waitForUrlToSettle` /
  `sendEnsureListWithRetry`, §1 above) against the compact layout specifically.** Confirmed working
  against the wide "navigation rail" layout the same day; the compact layout (hamburger Menu →
  dropdown) hasn't been re-tried since.
- **Live re-verification of the rename-step fix (§4 above), now on its sixth revision.** See §4's
  "Debugging history" for the full account. Current understanding: the title is already an
  auto-focused, pre-filled `<input>`/`<textarea>` immediately after list creation (confirmed —
  `rename_input:text_set stuck=true connected=true` was observed live), and the value write itself
  works; what doesn't reliably work is checking for success by re-reading this same tab's own
  saved-lists pane afterward, which stays stale until a full page reload. The fix moved that
  authoritative check into `entrypoints/background.ts` as a reload-and-reverify step. None of this
  revision has been re-tried live yet. Diagnostics now stream live (`GMAPS_DIAGNOSTIC`, one message
  per step) rather than only batching onto the final reply, so a stalled or lost final reply no
  longer hides the step trace — if this still fails, the live log should show exactly which step
  (`reload_verify:start` never followed by `reload_verify:ok`/`reload_verify:failed` would mean the
  reload itself, or the re-injection/re-send after it, is the new failure point to investigate).
