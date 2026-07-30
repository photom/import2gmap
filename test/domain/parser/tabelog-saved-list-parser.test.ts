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

describe('TabelogSavedListParser#extractShop', () => {
  it('extracts shop name, stripping internal HTML tag text and preserving ampersands', () => {
    const doc = loadFixtureDocument('saved-list-name-sanitization.html');
    const root = doc.querySelector('div.js-bookmark')!;
    const parser = new TabelogSavedListParser();

    const shop = parser.extractShop(root);

    expect(shop.name).toBe('テスト&店舗3');
  });

  it('extracts an allowlisted https Tabelog shop URL', () => {
    const doc = loadFixtureDocument('saved-list-single-page.html');
    const root = doc.querySelector('div.js-bookmark')!;
    const parser = new TabelogSavedListParser();

    const shop = parser.extractShop(root);

    expect(shop.url).toBe('https://tabelog.com/tokyo/A1301/A130101/10000001/');
  });

  it('rejects a javascript: href with InvalidShopUrl', () => {
    const doc = loadFixtureDocument('saved-list-invalid-url.html');
    const root = doc.querySelectorAll('div.js-bookmark')[0];
    const parser = new TabelogSavedListParser();

    const error = captureError(() => parser.extractShop(root));

    expect(error).toBeInstanceOf(ExtractionError);
    expect((error as ExtractionError).code).toBe('InvalidShopUrl');
  });

  it('rejects a non-Tabelog host href with InvalidShopUrl', () => {
    const doc = loadFixtureDocument('saved-list-invalid-url.html');
    const root = doc.querySelectorAll('div.js-bookmark')[1];
    const parser = new TabelogSavedListParser();

    const error = captureError(() => parser.extractShop(root));

    expect(error).toBeInstanceOf(ExtractionError);
    expect((error as ExtractionError).code).toBe('InvalidShopUrl');
  });

  it('parses the address from the copy textarea, discarding the phone and name lines', () => {
    const doc = loadFixtureDocument('saved-list-single-page.html');
    const root = doc.querySelector('div.js-bookmark')!;
    const parser = new TabelogSavedListParser();

    const shop = parser.extractShop(root);

    expect(shop.address).toBe('東京都中央区銀座1-2-3 テストビル1F');
  });

  it('joins multiple address lines with a single space', () => {
    const doc = loadFixtureDocument('saved-list-multiline-address.html');
    const root = doc.querySelector('div.js-bookmark')!;
    const parser = new TabelogSavedListParser();

    const shop = parser.extractShop(root);

    expect(shop.address).toBe('東京都中央区銀座1-2-7 テストビル3F');
  });
});
