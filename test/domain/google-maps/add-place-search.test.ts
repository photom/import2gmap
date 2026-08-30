import { describe, expect, it } from 'vitest';
import { loadGoogleMapsFixtureDocument } from '../../helpers/load-fixture-document';
import {
  hasPlaceNamed,
  isAddPlaceButton,
  isAddPlaceButtonPressed,
  isAddPlaceSearchInput,
  isSuggestionRow,
  parsePlaceCardNames,
  parseSuggestionRows,
} from '../../../src/domain/google-maps/add-place-search';

function parseElement(html: string): Element {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const el = doc.body.firstElementChild;
  if (!el) throw new Error('fixture html produced no element');
  return el;
}

describe('isAddPlaceButton', () => {
  it('matches via data-value', () => {
    expect(isAddPlaceButton(parseElement('<button data-value="Add a place"></button>'))).toBe(true);
  });

  it('matches English or Japanese aria-label as a fallback', () => {
    expect(isAddPlaceButton(parseElement('<button aria-label="Add a place"></button>'))).toBe(true);
    expect(isAddPlaceButton(parseElement('<button aria-label="場所を追加"></button>'))).toBe(true);
  });

  it('rejects an unrelated button', () => {
    expect(isAddPlaceButton(parseElement('<button aria-label="Share"></button>'))).toBe(false);
  });
});

describe('isAddPlaceButtonPressed', () => {
  it('is true when aria-pressed is "true"', () => {
    expect(isAddPlaceButtonPressed(parseElement('<button aria-pressed="true"></button>'))).toBe(true);
  });

  it('is false when aria-pressed is "false" or absent', () => {
    expect(isAddPlaceButtonPressed(parseElement('<button aria-pressed="false"></button>'))).toBe(false);
    expect(isAddPlaceButtonPressed(parseElement('<button></button>'))).toBe(false);
  });
});

describe('isAddPlaceSearchInput', () => {
  it('matches an input with role=combobox and the expected aria-label', () => {
    const el = parseElement('<input type="text" role="combobox" aria-label="Search for a place to add">');
    expect(isAddPlaceSearchInput(el)).toBe(true);
  });

  it('matches the Japanese aria-label fallback', () => {
    const el = parseElement('<input type="text" role="combobox" aria-label="追加する場所を検索">');
    expect(isAddPlaceSearchInput(el)).toBe(true);
  });

  it('rejects a non-input element', () => {
    expect(isAddPlaceSearchInput(parseElement('<div role="combobox" aria-label="Search for a place to add"></div>'))).toBe(
      false,
    );
  });

  it('rejects an input without role=combobox', () => {
    expect(isAddPlaceSearchInput(parseElement('<input type="text" aria-label="Search for a place to add">'))).toBe(
      false,
    );
  });

  it('rejects an unrelated combobox', () => {
    expect(isAddPlaceSearchInput(parseElement('<input type="text" role="combobox" aria-label="Search Google Maps">'))).toBe(
      false,
    );
  });
});

describe('isSuggestionRow', () => {
  it('matches a row with data-suggestion-index and a jsaction handler ending in .suggestion', () => {
    const el = parseElement('<div role="row" data-suggestion-index="0" jsaction="pane.wfvdle136.suggestion"></div>');
    expect(isSuggestionRow(el)).toBe(true);
  });

  it('rejects a row missing data-suggestion-index', () => {
    const el = parseElement('<div role="row" jsaction="pane.wfvdle136.suggestion"></div>');
    expect(isSuggestionRow(el)).toBe(false);
  });

  it('rejects a non-row element', () => {
    const el = parseElement('<div data-suggestion-index="0" jsaction="pane.wfvdle136.suggestion"></div>');
    expect(isSuggestionRow(el)).toBe(false);
  });
});

describe('parseSuggestionRows', () => {
  it('extracts name/address for every suggestion row, ordered by data-suggestion-index', () => {
    const doc = loadGoogleMapsFixtureDocument('list-detail-pane-with-suggestions.html');
    const rows = parseSuggestionRows(doc);
    expect(rows.map((row) => ({ index: row.index, name: row.name, address: row.address }))).toEqual([
      { index: 0, name: 'Example Shop A', address: 'Tokyo, Example City, 1-2-3' },
      { index: 1, name: 'Example Shop B', address: 'Tokyo, Example City, 4-5-6' },
    ]);
  });

  it('returns an empty array when there are no suggestions', () => {
    const doc = loadGoogleMapsFixtureDocument('list-detail-pane-empty.html');
    expect(parseSuggestionRows(doc)).toEqual([]);
  });
});

describe('parsePlaceCardNames / hasPlaceNamed', () => {
  it('extracts the name of every already-added place card', () => {
    const doc = loadGoogleMapsFixtureDocument('list-detail-pane-with-places.html');
    expect(parsePlaceCardNames(doc)).toEqual(['Example Shop A']);
  });

  it('does not mistake the "List is empty" heading for a place card', () => {
    const doc = loadGoogleMapsFixtureDocument('list-detail-pane-empty.html');
    expect(parsePlaceCardNames(doc)).toEqual([]);
  });

  it('hasPlaceNamed is true only for a name that is actually present', () => {
    const doc = loadGoogleMapsFixtureDocument('list-detail-pane-with-places.html');
    expect(hasPlaceNamed(doc, 'Example Shop A')).toBe(true);
    expect(hasPlaceNamed(doc, 'Example Shop Z')).toBe(false);
  });
});
