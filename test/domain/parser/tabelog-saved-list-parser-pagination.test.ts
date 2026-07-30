import { describe, expect, it } from 'vitest';
import { TabelogSavedListParser } from '../../../src/domain/parser/tabelog-saved-list-parser';
import { loadFixtureDocument } from '../../helpers/load-fixture-document';

describe('TabelogSavedListParser#parsePageCount', () => {
  it('parses from/to/total for a single page listing all shops', () => {
    const doc = loadFixtureDocument('saved-list-single-page.html');
    const parser = new TabelogSavedListParser();

    expect(parser.parsePageCount(doc)).toEqual({ from: 1, to: 2, total: 2 });
  });

  it('parses from/to/total for the first page of a multi-page listing', () => {
    const doc = loadFixtureDocument('saved-list-multi-page-pg1.html');
    const parser = new TabelogSavedListParser();

    expect(parser.parsePageCount(doc)).toEqual({ from: 1, to: 1, total: 2 });
  });
});

describe('TabelogSavedListParser#hasNextPage', () => {
  it('returns true when a next-page arrow is present', () => {
    const doc = loadFixtureDocument('saved-list-multi-page-pg1.html');
    const parser = new TabelogSavedListParser();

    expect(parser.hasNextPage(doc)).toBe(true);
  });

  it('returns false when no next-page arrow is present', () => {
    const doc = loadFixtureDocument('saved-list-single-page.html');
    const parser = new TabelogSavedListParser();

    expect(parser.hasNextPage(doc)).toBe(false);
  });

  it('returns false on the last page (prev arrow only)', () => {
    const doc = loadFixtureDocument('saved-list-multi-page-pg2.html');
    const parser = new TabelogSavedListParser();

    expect(parser.hasNextPage(doc)).toBe(false);
  });
});
