// Pure DOM predicates/parsers for adding a place to an already-open Google Maps saved list via
// the list's own "Add a place" search box (ADR-0008 step 2 — per-shop search + add). See the
// (sanitized) spike notes for the captured DOM shape this assumes: a single English-locale
// capture, so bilingual text fallbacks below are best-effort, unconfirmed guesses, same caveat as
// google-maps-detectors.ts. Anchor preference follows that file's convention: jsaction handler
// names, then structural shape, then bilingual text as a last resort.

import { hasJsactionHandlerEndingWith, matchesAnyText, normalizedText } from './dom-helpers';

// locale: "Add a place" (en) / "場所を追加" (ja, unconfirmed). `data-value="Add a place"` looked like
// an internal identifier in the one capture available, by analogy with `isNewListButton`'s
// `data-value="New list"` — treated as a hint, not confirmed stable.
const ADD_PLACE_BUTTON_LABELS = ['Add a place', '場所を追加'] as const;

export function isAddPlaceButton(el: Element): boolean {
  if (el.getAttribute('data-value') === 'Add a place') return true;
  return matchesAnyText(el.getAttribute('aria-label'), ADD_PLACE_BUTTON_LABELS);
}

// A toggle button — `aria-pressed="true"` means the search box below it is already showing.
export function isAddPlaceButtonPressed(el: Element): boolean {
  return el.getAttribute('aria-pressed') === 'true';
}

// locale: "Search for a place to add" (en) / best-effort ja guess, unconfirmed.
const ADD_PLACE_SEARCH_INPUT_LABELS = ['Search for a place to add', '追加する場所を検索'] as const;

export function isAddPlaceSearchInput(el: Element): boolean {
  if (!(el instanceof HTMLInputElement)) return false;
  if (el.getAttribute('role') !== 'combobox') return false;
  return matchesAnyText(el.getAttribute('aria-label'), ADD_PLACE_SEARCH_INPUT_LABELS);
}

// Each search-result row's own jsaction handler carries a stable **suffix**, `.suggestion` (e.g.
// `pane.wfvdle136.suggestion`) — the numeric prefix is scoped to that render of the search input
// and not reusable, but the suffix is treated as a stable, locale-independent anchor, the same
// per-instance-prefix-plus-stable-suffix pattern as the rename step's `.done` button.
export function isSuggestionRow(el: Element): boolean {
  if (el.getAttribute('role') !== 'row') return false;
  if (!el.hasAttribute('data-suggestion-index')) return false;
  return hasJsactionHandlerEndingWith(el, '.suggestion');
}

export type SuggestionRow = {
  readonly index: number;
  readonly name: string;
  readonly address: string;
  readonly element: Element;
};

function suggestionIndexOf(el: Element): number {
  const raw = el.getAttribute('data-suggestion-index');
  const parsed = raw === null ? NaN : Number(raw);
  return Number.isFinite(parsed) ? parsed : 0;
}

// Each suggestion row contains one `[role="gridcell"]` holding exactly two `[aria-label]`
// descendants in DOM order: the place name, then its address — matched by role/attribute shape,
// not by the row's own hashed classes (churn-prone, same caution as elsewhere in this codebase).
export function parseSuggestionRows(root: ParentNode): SuggestionRow[] {
  const rows: SuggestionRow[] = [];
  for (const rowEl of root.querySelectorAll('[data-suggestion-index]')) {
    if (!isSuggestionRow(rowEl)) continue;
    const cell = rowEl.querySelector('[role="gridcell"]');
    if (!cell) continue;
    const labeled = [...cell.querySelectorAll('[aria-label]')].map((el) =>
      normalizedText(el.getAttribute('aria-label')),
    );
    const [name, address] = labeled;
    if (!name) continue;
    rows.push({ index: suggestionIndexOf(rowEl), name, address: address ?? '', element: rowEl });
  }
  return rows.sort((a, b) => a.index - b.index);
}

// An already-added place's card in the list pane. Matched structurally — a <button> containing a
// child whose class list includes "fontHeadlineSmall" (one of Google's apparently-stable,
// unminified Material typography utility classes — seen consistently across this codebase's
// captures, e.g. "fontTitleSmall", "fontBodyMedium" — unlike the surrounding hashed classes) — not
// by the card's own hashed classes. Scoped to descendants of <button> specifically so it can never
// match the unrelated "List is empty" heading, which uses the same utility class but isn't inside
// a button.
export function parsePlaceCardNames(root: ParentNode): string[] {
  const names: string[] = [];
  for (const button of root.querySelectorAll('button')) {
    const headline = button.querySelector('[class*="fontHeadlineSmall"]');
    if (!headline) continue;
    const text = normalizedText(headline.textContent);
    if (text.length > 0) names.push(text);
  }
  return names;
}

export function hasPlaceNamed(root: ParentNode, name: string): boolean {
  const target = name.trim();
  return parsePlaceCardNames(root).includes(target);
}
