import { describe, expect, it } from 'vitest';
import { TabelogSavedListParser } from '../../../src/domain/parser/tabelog-saved-list-parser';
import { ExtractionError } from '../../../src/domain/errors/extraction-error';
import { loadFixtureDocument } from '../../helpers/load-fixture-document';
import { captureError } from '../../helpers/capture-error';

describe('TabelogSavedListParser#extractPage collections', () => {
  it('associates bookmarks-data labels with the matching shop by data-rst-id', () => {
    const doc = loadFixtureDocument('saved-list-single-page.html');
    const parser = new TabelogSavedListParser();

    const page = parser.extractPage(doc);

    expect(page.shops[0]!.collections).toEqual([{ id: '101', name: '行きたいお店' }]);
    expect(page.shops[1]!.collections).toEqual([
      { id: '101', name: '行きたいお店' },
      { id: '102', name: 'お気に入り' },
    ]);
  });

  it('throws BookmarksDataInvalid for malformed #js-bookmarks-data JSON', () => {
    const doc = loadFixtureDocument('saved-list-invalid-bookmarks.html');
    const parser = new TabelogSavedListParser();

    const error = captureError(() => parser.extractPage(doc));

    expect(error).toBeInstanceOf(ExtractionError);
    expect((error as ExtractionError).code).toBe('BookmarksDataInvalid');
  });

  it('parses the page-level #js-collection catalog', () => {
    const doc = loadFixtureDocument('saved-list-single-page.html');
    const parser = new TabelogSavedListParser();

    const page = parser.extractPage(doc);

    expect(page.collectionsCatalog).toEqual([
      { id: '101', name: '行きたいお店' },
      { id: '102', name: 'お気に入り' },
    ]);
  });

  it('throws CollectionCatalogInvalid for malformed #js-collection JSON', () => {
    const doc = loadFixtureDocument('saved-list-invalid-collection-catalog.html');
    const parser = new TabelogSavedListParser();

    const error = captureError(() => parser.extractPage(doc));

    expect(error).toBeInstanceOf(ExtractionError);
    expect((error as ExtractionError).code).toBe('CollectionCatalogInvalid');
  });

  it('unions orphan label ids seen on shops into collectionsCatalog', () => {
    const doc = loadFixtureDocument('saved-list-orphan-collection-label.html');
    const parser = new TabelogSavedListParser();

    const page = parser.extractPage(doc);

    expect(page.collectionsCatalog).toEqual([
      { id: '101', name: '行きたいお店' },
      { id: '102', name: '限定コレクション' },
    ]);
  });
});
