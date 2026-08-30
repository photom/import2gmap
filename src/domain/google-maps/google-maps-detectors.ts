// Pure DOM predicates for the Google Maps native saved-list Web UI automation (see ADR-0008,
// which supersedes the old My Maps import path). Must work under either an English or a Japanese
// browser/account UI locale — see the "locale" note on each predicate below.
//
// Anchor preference, most to least stable across a Google deploy AND across locale:
//   1. `jsaction` handler names (e.g. "settings.open") — internal event-routing identifiers, not
//      translated text. Preferred wherever the real capture showed one.
//   2. `role` / structural shape (e.g. "a button inside a tabpanel whose sibling text contains a
//      middle-dot metadata line") — semantic HTML, locale-independent.
//   3. `data-value` — looks like an internal (non-translated) identifier in the one case observed
//      here ("New list"), by analogy with the old My Maps spike's English-only `CREATE` button.
//      UNCONFIRMED for other locales; treated as a hint, never the sole anchor.
//   4. Bilingual `aria-label` / text-content matching — last resort, since it's the one signal
//      guaranteed to actually change with locale. The Japanese candidates below are best-effort
//      translations of the captured English UI, NOT independently verified against a live
//      Japanese-locale session — see the spike notes doc.

import { hasJsactionHandler, hasJsactionHandlerEndingWith, matchesAnyText, normalizedText } from './dom-helpers';

// Two distinct layouts were captured (see spike notes): a narrow/compact layout with a hamburger
// "Menu" button (`jsaction` handler `settings.open`) that must be opened before a "Saved" menu
// item becomes reachable, and a wider "navigation rail" layout where a persistent left sidebar
// already has its own menu-ish "more" button (`jsaction` handler `navigationrail.more`) *and* a
// directly clickable "Saved" entry (`jsaction` handler `navigationrail.saved`) with no menu to
// open at all. `isMenuButton` recognizes either layout's menu-ish button; `isSavedTrigger`
// recognizes either layout's "open my saved lists" control, whether or not it currently needs a
// menu opened first to be reachable — see entrypoints/gmaps.content.ts for the try-direct-first,
// fall-back-to-menu orchestration this enables.

// locale: "Menu" (en) / "メニュー" (ja, unconfirmed) — jsaction handler is the primary, locale-free anchor.
const MENU_LABELS = ['Menu', 'メニュー'] as const;

export function isMenuButton(el: Element): boolean {
  if (hasJsactionHandler(el, 'settings.open')) return true;
  if (hasJsactionHandler(el, 'navigationrail.more')) return true;
  return matchesAnyText(el.getAttribute('aria-label'), MENU_LABELS);
}

// locale: "Saved" (en) / "保存済み" (ja) — jsaction handler is the primary, locale-free anchor.
const SAVED_TRIGGER_LABELS = ['Saved', '保存済み'] as const;

export function isSavedTrigger(el: Element): boolean {
  if (hasJsactionHandler(el, 'settings.yourplaces')) return true;
  if (hasJsactionHandler(el, 'navigationrail.saved')) return true;
  return matchesAnyText(el.textContent, SAVED_TRIGGER_LABELS);
}

// locale: "New list" (en) / "新しいリスト" (ja, unconfirmed). `data-value="New list"` looked like an
// internal identifier in the single capture available — treated as a hint, not confirmed stable.
const NEW_LIST_LABELS = ['New list', '新しいリスト'] as const;

export function isNewListButton(el: Element): boolean {
  if (el.getAttribute('data-value') === 'New list') return true;
  return matchesAnyText(el.getAttribute('aria-label'), NEW_LIST_LABELS);
}

// locale: "Done" (en) / "完了" (ja). The jsaction handler observed was an instance-scoped id with a
// stable ".done" suffix (e.g. "pane.wfvdle636.done") — the numeric part is not reusable across
// sessions, but the verb suffix is treated as a stable anchor.
const DONE_LABELS = ['Done', '完了'] as const;

export function isDoneButton(el: Element): boolean {
  if (hasJsactionHandlerEndingWith(el, '.done')) return true;
  return matchesAnyText(el.textContent, DONE_LABELS);
}

// locale: "Back" (en) / "戻る" (ja) — jsaction handler is the primary, locale-free anchor.
const BACK_LABELS = ['Back', '戻る'] as const;

export function isBackButton(el: Element): boolean {
  if (hasJsactionHandler(el, 'omnibox.back')) return true;
  return matchesAnyText(el.getAttribute('aria-label'), BACK_LABELS);
}

// locale: "Untitled list" (en) / best-effort ja candidates — the LEAST confident guess of this
// file's bilingual sets; not independently verified. Used only to recognize the freshly created
// list's placeholder title so it can be clicked into edit mode; a live Japanese-locale mismatch
// here degrades to an explicit failure (never a silent wrong click), not a crash.
const UNTITLED_LIST_LABELS = ['Untitled list', '名前のないリスト', '無題のリスト'] as const;

export function isUntitledListPlaceholder(text: string | null | undefined): boolean {
  return matchesAnyText(text, UNTITLED_LIST_LABELS);
}

// Google's saved-list row metadata line ("Private · 12 places" / "Shared · 1 place"). Matched
// structurally — a middle-dot separator plus a digit — rather than on translated words, since the
// dot separator was consistent across every row in the one (English) capture available and is a
// Google Maps convention that is expected, but not confirmed, to hold across locales too.
export function isListMetaLine(text: string | null | undefined): boolean {
  const trimmed = normalizedText(text);
  if (trimmed.length === 0) return false;
  if (!trimmed.includes('·')) return false;
  return /\d/.test(trimmed);
}
