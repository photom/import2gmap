import { describe, expect, it } from 'vitest';
import { TabelogSavedListParser } from '../../../src/domain/parser/tabelog-saved-list-parser';
import { loadFixtureDocument } from '../../helpers/load-fixture-document';

describe('TabelogSavedListParser#isBeyondFirstPage', () => {
  it('returns false when .c-page-count reports from === 1', () => {
    const doc = loadFixtureDocument('saved-list-single-page.html');
    const parser = new TabelogSavedListParser();

    expect(parser.isBeyondFirstPage(doc)).toBe(false);
  });

  it('returns true when .c-page-count reports from > 1', () => {
    const doc = loadFixtureDocument('saved-list-multi-page-pg2.html');
    const parser = new TabelogSavedListParser();

    expect(parser.isBeyondFirstPage(doc)).toBe(true);
  });

  it('falls back to the prev arrow when .c-page-count is absent', () => {
    const doc = loadFixtureDocument('saved-list-no-page-count-prev-arrow.html');
    const parser = new TabelogSavedListParser();

    expect(parser.isBeyondFirstPage(doc)).toBe(true);
  });

  it('falls back to the current-page marker text when .c-page-count and the prev arrow are both absent', () => {
    const doc = loadFixtureDocument('saved-list-no-page-count-current-not-one.html');
    const parser = new TabelogSavedListParser();

    expect(parser.isBeyondFirstPage(doc)).toBe(true);
  });

  it('defaults to false when neither .c-page-count nor any corroborating signal is present', () => {
    const doc = loadFixtureDocument('saved-list-no-page-count-no-signals.html');
    const parser = new TabelogSavedListParser();

    expect(parser.isBeyondFirstPage(doc)).toBe(false);
  });
});

describe('TabelogSavedListParser#findFirstPageLink', () => {
  it('returns the a.c-pagination__num link whose trimmed text is exactly "1"', () => {
    const doc = loadFixtureDocument('saved-list-multi-page-pg2.html');
    const parser = new TabelogSavedListParser();

    const link = parser.findFirstPageLink(doc);
    expect(link?.textContent?.trim()).toBe('1');
    expect(link?.getAttribute('href')).toContain('PG=1');
  });

  it('returns undefined when pagination is windowed and no "1" link is rendered', () => {
    const doc = loadFixtureDocument('saved-list-pagination-windowed.html');
    const parser = new TabelogSavedListParser();

    expect(parser.findFirstPageLink(doc)).toBeUndefined();
  });
});

describe('TabelogSavedListParser#findPrevPageLink', () => {
  it('returns the prev arrow when present', () => {
    const doc = loadFixtureDocument('saved-list-multi-page-pg2.html');
    const parser = new TabelogSavedListParser();

    expect(parser.findPrevPageLink(doc)?.getAttribute('href')).toContain('PG=1');
  });

  it('returns undefined on the first page (no prev arrow)', () => {
    const doc = loadFixtureDocument('saved-list-single-page.html');
    const parser = new TabelogSavedListParser();

    expect(parser.findPrevPageLink(doc)).toBeUndefined();
  });
});
