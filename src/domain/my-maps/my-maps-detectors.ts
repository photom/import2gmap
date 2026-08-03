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
