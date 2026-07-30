import { describe, expect, it } from 'vitest';
import { TabelogSavedListParser } from '../../../src/domain/parser/tabelog-saved-list-parser';
import { ExtractionError } from '../../../src/domain/errors/extraction-error';
import { loadFixtureDocument } from '../../helpers/load-fixture-document';
import { captureError } from '../../helpers/capture-error';

describe('TabelogSavedListParser#detectSavedListPage', () => {
  it('returns true when DOM contains the saved-list chrome', () => {
    const doc = loadFixtureDocument('saved-list-single-page.html');
    const parser = new TabelogSavedListParser();

    expect(parser.detectSavedListPage(doc)).toBe(true);
  });

  it('throws NotSavedListPage for a non-saved-list page', () => {
    const doc = loadFixtureDocument('not-saved-list.html');
    const parser = new TabelogSavedListParser();

    const error = captureError(() => parser.detectSavedListPage(doc));

    expect(error).toBeInstanceOf(ExtractionError);
    expect((error as ExtractionError).code).toBe('NotSavedListPage');
  });
});
