// Parses the Google Maps "Your places" saved-lists pane (the one opened via Menu -> Saved) to
// answer: does a list with this exact name already exist? Pure, DOM-in/data-out — no clicking or
// waiting here; see entrypoints/gmaps.content.ts for the timed automation that drives the UI to
// this pane and then calls into this module. See ADR-0008 and the (sanitized) spike notes doc for
// the DOM shape this assumes.

import { isAddPlaceButton } from './add-place-search';
import { isListMetaLine, isNewListButton } from './google-maps-detectors';
import { normalizedText } from './dom-helpers';

export type SavedListEntry = {
  readonly name: string;
  readonly element: Element;
};

// The pane observed in the wild is `[role="main"]` and contains both a tablist (Lists / Labeled /
// Maps) and the "New list" button — checked together, rather than trusting the pane's own
// (locale-dependent, unconfirmed-in-Japanese) aria-label text.
export function findSavedListsPaneRoot(root: ParentNode): Element | null {
  const candidates = root.querySelectorAll('[role="main"]');
  for (const candidate of candidates) {
    const hasTablist = candidate.querySelector('[role="tablist"]') !== null;
    const hasNewListButton = [...candidate.querySelectorAll('button')].some(isNewListButton);
    if (hasTablist && hasNewListButton) {
      return candidate;
    }
  }
  return null;
}

// Only the active tabpanel (the first / "Lists" tab is the default and the only one ADR-0008
// needs) — scoping here avoids picking up buttons from the "Labeled" or "Maps" tabs if they were
// ever rendered into the same DOM subtree.
function findActiveListsTabPanel(paneRoot: Element): Element {
  return paneRoot.querySelector('[role="tabpanel"]') ?? paneRoot;
}

// Each saved-list row is a button containing several leaf (no-element-children) text nodes: an
// icon (empty text), a name, and a "Private/Shared · N places" metadata line, in that structural
// order — matched by shape (the metadata line's own middle-dot + digit pattern), not by the
// hashed classes Google actually ships, which are expected to churn across deploys (see the old
// My Maps spike's equivalent caution). A row without a recognizable metadata line (e.g. the "New
// list" button itself, which has no place count) is not a saved-list entry and is skipped.
export function parseSavedListEntries(paneRoot: ParentNode): SavedListEntry[] {
  const tabPanel = findActiveListsTabPanel(paneRoot as Element);
  const entries: SavedListEntry[] = [];

  for (const button of tabPanel.querySelectorAll('button')) {
    if (isNewListButton(button)) continue;

    const leaves = [...button.querySelectorAll('*')].filter(
      (el) => el.children.length === 0 && (el.textContent ?? '').trim().length > 0,
    );
    if (leaves.length === 0) continue;

    const metaIndex = leaves.findIndex((el) => isListMetaLine(el.textContent));
    if (metaIndex <= 0) continue; // no recognizable metadata line, or nothing before it to be the name

    const name = (leaves[metaIndex - 1].textContent ?? '').trim();
    if (name.length > 0) {
      entries.push({ name, element: button });
    }
  }

  return entries;
}

export function hasListNamed(paneRoot: ParentNode, name: string): boolean {
  const target = name.trim();
  return parseSavedListEntries(paneRoot).some((entry) => entry.name === target);
}

// The clickable row for a given list name, to open its own detail pane (see
// `findListDetailPaneRoot` below) — e.g. to then search for and add places to it.
export function findListButtonByName(paneRoot: ParentNode, name: string): Element | null {
  const target = name.trim();
  return parseSavedListEntries(paneRoot).find((entry) => entry.name === target)?.element ?? null;
}

// A single list's own detail pane (opened by clicking its row in the overview pane above) — also
// `[role="main"]`, but with no tablist (that's what distinguishes it from the overview pane) and,
// instead, a title button carrying the list's own name as its `aria-label` (the same "title
// button" shape the rename step's "Untitled list" trigger uses — see
// google-maps-detectors.ts's `isUntitledListPlaceholder` — just with the real name once renamed)
// plus an "Add a place" toggle (add-place-search.ts's `isAddPlaceButton`).
export function findListDetailPaneRoot(root: ParentNode): Element | null {
  const candidates = root.querySelectorAll('[role="main"]');
  for (const candidate of candidates) {
    if (candidate.querySelector('[role="tablist"]') !== null) continue;
    const hasTitleButton = candidate.querySelector('h1 button[aria-label]') !== null;
    const hasAddPlaceButton = [...candidate.querySelectorAll('button')].some(isAddPlaceButton);
    if (hasTitleButton && hasAddPlaceButton) {
      return candidate;
    }
  }
  return null;
}

export function detailPaneTitle(paneRoot: Element): string | null {
  const titleButton = paneRoot.querySelector('h1 button[aria-label]');
  return titleButton ? normalizedText(titleButton.getAttribute('aria-label')) : null;
}

export function isListDetailPaneFor(paneRoot: Element, name: string): boolean {
  return detailPaneTitle(paneRoot) === name.trim();
}
