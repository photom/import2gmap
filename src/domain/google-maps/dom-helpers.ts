// Shared low-level DOM/text helpers for the Google Maps saved-list automation predicates
// (google-maps-detectors.ts, add-place-search.ts). See those files for the locale/anchor
// preference rationale this supports: jsaction handler names over structural shape over bilingual
// text matching, in that order.

export function jsactionHandlers(el: Element): string[] {
  const raw = el.getAttribute('jsaction');
  if (!raw) return [];
  return raw
    .split(';')
    .map((token) => token.trim())
    .filter((token) => token.length > 0)
    .map((token) => {
      const colonIndex = token.lastIndexOf(':');
      return colonIndex === -1 ? token : token.slice(colonIndex + 1);
    });
}

export function hasJsactionHandler(el: Element, exact: string): boolean {
  return jsactionHandlers(el).includes(exact);
}

export function hasJsactionHandlerEndingWith(el: Element, suffix: string): boolean {
  return jsactionHandlers(el).some((handler) => handler.endsWith(suffix));
}

export function normalizedText(value: string | null | undefined): string {
  return (value ?? '').trim();
}

export function matchesAnyText(value: string | null | undefined, candidates: readonly string[]): boolean {
  const text = normalizedText(value);
  return candidates.some((candidate) => text === candidate);
}
