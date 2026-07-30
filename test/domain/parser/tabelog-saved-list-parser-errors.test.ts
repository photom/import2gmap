import { describe, expect, it } from 'vitest';
import { TabelogSavedListParser } from '../../../src/domain/parser/tabelog-saved-list-parser';
import { ExtractionError } from '../../../src/domain/errors/extraction-error';
import { loadFixtureDocument } from '../../helpers/load-fixture-document';
import { captureError } from '../../helpers/capture-error';

describe('TabelogSavedListParser error handling', () => {
  it('throws EmptyList when a valid page has zero div.js-bookmark items', () => {
    const doc = loadFixtureDocument('saved-list-empty.html');
    const parser = new TabelogSavedListParser();

    const error = captureError(() => parser.extractPage(doc));

    expect(error).toBeInstanceOf(ExtractionError);
    expect((error as ExtractionError).code).toBe('EmptyList');
  });

  it('throws AddressMissing when the copy textarea is absent', () => {
    const doc = loadFixtureDocument('saved-list-missing-address.html');
    const root = doc.querySelector('div.js-bookmark')!;
    const parser = new TabelogSavedListParser();

    const error = captureError(() => parser.extractShop(root));

    expect(error).toBeInstanceOf(ExtractionError);
    expect((error as ExtractionError).code).toBe('AddressMissing');
  });

  it('throws AddressMissing when the address is empty after sanitization', () => {
    const doc = loadFixtureDocument('saved-list-address-empty-after-sanitize.html');
    const root = doc.querySelector('div.js-bookmark')!;
    const parser = new TabelogSavedListParser();

    const error = captureError(() => parser.extractShop(root));

    expect(error).toBeInstanceOf(ExtractionError);
    expect((error as ExtractionError).code).toBe('AddressMissing');
  });

  it('throws SelectorDrift when the shop name element is missing', () => {
    const doc = loadFixtureDocument('saved-list-selector-drift.html');
    const root = doc.querySelector('div.js-bookmark')!;
    const parser = new TabelogSavedListParser();

    const error = captureError(() => parser.extractShop(root));

    expect(error).toBeInstanceOf(ExtractionError);
    expect((error as ExtractionError).code).toBe('SelectorDrift');
  });
});
