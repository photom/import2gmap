import { describe, expect, it } from 'vitest';
import { loadGoogleMapsFixtureDocument } from '../../helpers/load-fixture-document';
import {
  detailPaneTitle,
  findListButtonByName,
  findListDetailPaneRoot,
  findSavedListsPaneRoot,
  hasListNamed,
  isListDetailPaneFor,
  parseSavedListEntries,
} from '../../../src/domain/google-maps/saved-lists-pane';

describe('findSavedListsPaneRoot', () => {
  it('finds the pane by its tablist + New list button shape', () => {
    const doc = loadGoogleMapsFixtureDocument('saved-lists-pane-with-target.html');
    expect(findSavedListsPaneRoot(doc)).not.toBeNull();
  });

  it('returns null when no matching pane is present', () => {
    const doc = new DOMParser().parseFromString('<div role="main">unrelated content</div>', 'text/html');
    expect(findSavedListsPaneRoot(doc)).toBeNull();
  });
});

describe('parseSavedListEntries', () => {
  it('extracts every list row name, skipping the New list button itself', () => {
    const doc = loadGoogleMapsFixtureDocument('saved-lists-pane-with-target.html');
    const pane = findSavedListsPaneRoot(doc);
    expect(pane).not.toBeNull();
    const entries = parseSavedListEntries(pane!);
    expect(entries.map((entry) => entry.name)).toEqual(['食べログ', 'Example List A']);
  });

  it('returns an empty array for a pane with no lists yet', () => {
    const doc = loadGoogleMapsFixtureDocument('saved-lists-pane-empty.html');
    const pane = findSavedListsPaneRoot(doc);
    expect(pane).not.toBeNull();
    expect(parseSavedListEntries(pane!)).toEqual([]);
  });
});

describe('hasListNamed', () => {
  it('is true when the target list is present', () => {
    const doc = loadGoogleMapsFixtureDocument('saved-lists-pane-with-target.html');
    const pane = findSavedListsPaneRoot(doc)!;
    expect(hasListNamed(pane, '食べログ')).toBe(true);
  });

  it('is false when the target list is absent', () => {
    const doc = loadGoogleMapsFixtureDocument('saved-lists-pane-without-target.html');
    const pane = findSavedListsPaneRoot(doc)!;
    expect(hasListNamed(pane, '食べログ')).toBe(false);
  });

  it('is false for an empty pane', () => {
    const doc = loadGoogleMapsFixtureDocument('saved-lists-pane-empty.html');
    const pane = findSavedListsPaneRoot(doc)!;
    expect(hasListNamed(pane, '食べログ')).toBe(false);
  });
});

describe('findListButtonByName', () => {
  it('finds the clickable row for a matching list name', () => {
    const doc = loadGoogleMapsFixtureDocument('saved-lists-pane-with-target.html');
    const pane = findSavedListsPaneRoot(doc)!;
    expect(findListButtonByName(pane, '食べログ')).not.toBeNull();
  });

  it('returns null when no row matches', () => {
    const doc = loadGoogleMapsFixtureDocument('saved-lists-pane-without-target.html');
    const pane = findSavedListsPaneRoot(doc)!;
    expect(findListButtonByName(pane, '食べログ')).toBeNull();
  });
});

describe('findListDetailPaneRoot / detailPaneTitle / isListDetailPaneFor', () => {
  it('finds the detail pane by its title button + Add-a-place button shape (no tablist)', () => {
    const doc = loadGoogleMapsFixtureDocument('list-detail-pane-empty.html');
    expect(findListDetailPaneRoot(doc)).not.toBeNull();
  });

  it('does not mistake the overview pane (which has a tablist) for a detail pane', () => {
    const doc = loadGoogleMapsFixtureDocument('saved-lists-pane-with-target.html');
    expect(findListDetailPaneRoot(doc)).toBeNull();
  });

  it('reads the list name from the title button', () => {
    const doc = loadGoogleMapsFixtureDocument('list-detail-pane-empty.html');
    const pane = findListDetailPaneRoot(doc)!;
    expect(detailPaneTitle(pane)).toBe('食べログ');
  });

  it('isListDetailPaneFor matches only the expected name', () => {
    const doc = loadGoogleMapsFixtureDocument('list-detail-pane-empty.html');
    const pane = findListDetailPaneRoot(doc)!;
    expect(isListDetailPaneFor(pane, '食べログ')).toBe(true);
    expect(isListDetailPaneFor(pane, 'Something Else')).toBe(false);
  });
});
