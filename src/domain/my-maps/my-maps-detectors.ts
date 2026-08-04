export function isLoggedOutRedirect(hostname: string): boolean {
  return hostname === 'accounts.google.com';
}

export function hasCreatedNewMap(url: string): boolean {
  const parsed = new URL(url);
  return parsed.pathname.startsWith('/maps/d/') && parsed.searchParams.has('mid');
}

export function hasImportSucceeded(currentTitle: string, defaultTitle: string): boolean {
  const trimmed = currentTitle.trim();
  return trimmed.length > 0 && trimmed !== defaultTitle;
}

export type MapsFrameRole = 'mymaps' | 'picker';

const PICKER_HOSTNAME = 'docs.google.com';

// The KML upload file input lives inside a cross-origin `docs.google.com/picker` iframe, not
// the top `www.google.com` My Maps document — see spike results "The KML upload picker is a
// cross-origin iframe". A content script injected with `allFrames: true` runs once per frame, so
// each execution needs to identify which frame it landed in.
export function detectMapsFrameRole(hostname: string): MapsFrameRole {
  return hostname === PICKER_HOSTNAME ? 'picker' : 'mymaps';
}

// Verifies the map-title-rename dialog's save actually took effect, by comparing the title bar's
// text (back in the top document) against the name we asked for — trimmed, since the DOM text can
// carry incidental whitespace. Used to bound-poll after clicking #update-map's save button; see
// spike results "Rename the map title".
export function hasMapTitleApplied(currentTitle: string, expectedTitle: string): boolean {
  return currentTitle.trim() === expectedTitle.trim();
}

const PICKER_UPLOAD_NAV_LABELS = new Set(['アップロード', 'Upload']);

// The `docs.google.com/picker` iframe has a second observed layout ("picker v2", `data-config`
// containing `"https://docs.google.com/picker/v2/"`): instead of opening directly on the upload
// pane, it renders a left source-nav listbox (`Google ドライブ` / `アルバム` / `アップロード`)
// with Drive preselected, and the file input doesn't exist in the DOM until `アップロード` is
// clicked — see spike results §3 (2026-08-04 addendum). Exact trimmed match, not substring, so a
// label like `アップロード履歴` doesn't false-positive; `Upload` is also accepted since Google
// mixes English into the JA UI elsewhere too (see `DRIVE_CONSENT_TEXT = 'CREATE'`).
export function isPickerUploadNavLabel(text: string): boolean {
  return PICKER_UPLOAD_NAV_LABELS.has(text.trim());
}

// A first picker-v2 fix (nav click, no verification) shipped but did not work in the field: the
// user's live DOM still showed the upload nav option `aria-selected="false"` with the Drive-
// browsing pane still rendered, and the import stalled — see spike results §3 (2026-08-04 second
// addendum). "Was the nav clicked" turned out not to be a trustworthy signal; the option's own
// `aria-selected` is the authoritative one, so this is what `handleFeedKml` now polls after every
// activation attempt instead of assuming a click took effect.
export function isPickerUploadNavSelected(ariaSelected: string | null): boolean {
  return ariaSelected === 'true';
}

// A second field report (2026-08-05, this file's spike results §3 third addendum) showed the
// second picker-v2 fix still stalled: the live DOM snapshot had the upload-nav option at
// `tabindex="0"` (i.e. `option.focus()` had run — that's the only place this flow calls `.focus()`)
// while `aria-selected` stayed `"false"`. A bare `new KeyboardEvent('keydown', {key: 'Enter'})`
// leaves `keyCode`/`which` at `0` (they're not derived from `key`), and Closure/jsaction keydown
// handlers routinely branch on that legacy field — so the keyboard activation strategies were very
// likely no-ops. `code` is included too since some handlers key off it instead of `keyCode`.
export function pickerActivationKeyEventInit(key: 'Enter' | ' '): KeyboardEventInit {
  const keyCode = key === 'Enter' ? 13 : 32;
  const code = key === 'Enter' ? 'Enter' : 'Space';
  return { key, code, keyCode, which: keyCode, bubbles: true, cancelable: true, composed: true };
}

// Whether a `docs.google.com`-hostname frame has actually rendered picker UI yet — used to make
// picker-frame discovery content-aware instead of hostname-only (hypothesis 0.1, spike results §3
// third addendum): the instant a `docs.google.com` frame exists it may still be blank/loading, and
// (defensively) a nested `docs.google.com` frame inside the picker gadget would report the right
// hostname while never rendering either of these. Reuses the same two anchors `handleFeedKml`
// itself already polls for as "the picker is ready".
export function hasPickerFrameContent(hasUploadNavOption: boolean, hasStrictFileInput: boolean): boolean {
  return hasUploadNavOption || hasStrictFileInput;
}

export type MapsFrameDetectionResult = {
  readonly role: MapsFrameRole;
  readonly hasPickerContent: boolean;
};

// Narrows an `executeScript` injection result's `result` field (the content script's `main()`
// return value — see `waitForPickerFrame` in entrypoints/background.ts) to "this is the real,
// ready picker frame". Replaces the old hostname-only `result === 'picker'` check, which could
// latch onto a still-loading or (if Google ever nests one) unrelated `docs.google.com` frame and
// never revisit that choice.
export function isPickerFrameReady(value: unknown): value is { role: 'picker'; hasPickerContent: true } {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as { role?: unknown; hasPickerContent?: unknown };
  return candidate.role === 'picker' && candidate.hasPickerContent === true;
}

// The picker v2 app renders its dialog/nav DOM progressively; a synthetic event dispatched before
// its own event dispatcher has finished wiring up can be silently dropped (hypothesis 0.4, spike
// results §3 third addendum). The loading spinner (`jsname="aZ2wEe"`) was observed carrying
// `data-active="false"` and/or `aria-hidden="true"` once the app has finished loading — either
// marker present means "settled, not spinning". Absence of the spinner element itself is handled
// by the content-script caller (no spinner found = nothing to wait on), not here.
export function isPickerSpinnerActive(dataActive: string | null, ariaHidden: string | null): boolean {
  return dataActive !== 'false' && ariaHidden !== 'true';
}
