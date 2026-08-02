import { describe, expect, it } from 'vitest';
import { handleTabClickNext, handleTabExtractPage } from '../../../src/domain/parser/tabelog-extract-handler';
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
