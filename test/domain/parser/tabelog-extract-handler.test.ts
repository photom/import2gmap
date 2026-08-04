import { describe, expect, it } from 'vitest';
import {
  handleTabClickNext,
  handleTabExtractPage,
  handleTabGoToFirstPage,
} from '../../../src/domain/parser/tabelog-extract-handler';
import { loadFixtureDocument } from '../../helpers/load-fixture-document';

describe('handleTabExtractPage', () => {
  it('returns TAB_PAGE_RESULT with parsed shops for a saved-list page', () => {
    const doc = loadFixtureDocument('saved-list-single-page.html');

    const result = handleTabExtractPage(doc, 'job-1');

    expect(result.type).toBe('TAB_PAGE_RESULT');
    if (result.type !== 'TAB_PAGE_RESULT') throw new Error('unreachable');
    expect(result.jobId).toBe('job-1');
    expect(result.shops.length).toBeGreaterThan(0);
  });

  it('returns TAB_EXTRACT_FAILED with NotSavedListPage for a non-saved-list page', () => {
    const doc = loadFixtureDocument('not-saved-list.html');

    const result = handleTabExtractPage(doc, 'job-1');

    expect(result).toEqual({
      type: 'TAB_EXTRACT_FAILED',
      protocolVersion: 1,
      jobId: 'job-1',
      code: 'NotSavedListPage',
    });
  });

  it('maps other extraction errors to TAB_EXTRACT_FAILED with the matching code', () => {
    const doc = loadFixtureDocument('saved-list-empty.html');

    const result = handleTabExtractPage(doc, 'job-1');

    expect(result).toMatchObject({ type: 'TAB_EXTRACT_FAILED', code: 'EmptyList' });
  });
});

describe('handleTabClickNext', () => {
  it('returns navigating when a next-page arrow is present', () => {
    const doc = loadFixtureDocument('saved-list-multi-page-pg1.html');

    const result = handleTabClickNext(doc, 'job-1');

    expect(result).toEqual({ type: 'TAB_NEXT_RESULT', protocolVersion: 1, jobId: 'job-1', kind: 'navigating' });
  });

  it('returns no_next when there is no next-page arrow', () => {
    const doc = loadFixtureDocument('saved-list-single-page.html');

    const result = handleTabClickNext(doc, 'job-1');

    expect(result).toEqual({ type: 'TAB_NEXT_RESULT', protocolVersion: 1, jobId: 'job-1', kind: 'no_next' });
  });
});

describe('handleTabGoToFirstPage', () => {
  it('returns TAB_EXTRACT_FAILED with NotSavedListPage for a non-saved-list page', () => {
    const doc = loadFixtureDocument('not-saved-list.html');

    const result = handleTabGoToFirstPage(doc, 'job-1');

    expect(result).toEqual({
      type: 'TAB_EXTRACT_FAILED',
      protocolVersion: 1,
      jobId: 'job-1',
      code: 'NotSavedListPage',
    });
  });

  it('returns already_first when already on page 1', () => {
    const doc = loadFixtureDocument('saved-list-single-page.html');

    const result = handleTabGoToFirstPage(doc, 'job-1');

    expect(result).toEqual({
      type: 'TAB_FIRST_PAGE_RESULT',
      protocolVersion: 1,
      jobId: 'job-1',
      kind: 'already_first',
    });
  });

  it('returns navigating when not on page 1 and the "1" link is present', () => {
    const doc = loadFixtureDocument('saved-list-multi-page-pg2.html');

    const result = handleTabGoToFirstPage(doc, 'job-1');

    expect(result).toEqual({
      type: 'TAB_FIRST_PAGE_RESULT',
      protocolVersion: 1,
      jobId: 'job-1',
      kind: 'navigating',
    });
  });

  it('falls back to the prev arrow (navigating) when pagination is windowed and no "1" link is rendered', () => {
    const doc = loadFixtureDocument('saved-list-pagination-windowed.html');

    const result = handleTabGoToFirstPage(doc, 'job-1');

    expect(result).toEqual({
      type: 'TAB_FIRST_PAGE_RESULT',
      protocolVersion: 1,
      jobId: 'job-1',
      kind: 'navigating',
    });
  });

  it('returns TAB_EXTRACT_FAILED with SelectorDrift when not on page 1 but no navigation link exists', () => {
    const doc = loadFixtureDocument('saved-list-pagination-drift.html');

    const result = handleTabGoToFirstPage(doc, 'job-1');

    expect(result).toEqual({
      type: 'TAB_EXTRACT_FAILED',
      protocolVersion: 1,
      jobId: 'job-1',
      code: 'SelectorDrift',
    });
  });
});
