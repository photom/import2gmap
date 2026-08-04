import { ExtractionError } from '../errors/extraction-error';
import type { ContentToWorkerMessage, JobId } from '../messaging/message-types';
import { TabelogSavedListParser } from './tabelog-saved-list-parser';

const parser = new TabelogSavedListParser();

export function handleTabExtractPage(document: Document, jobId: JobId): ContentToWorkerMessage {
  try {
    const { shops, collectionsCatalog } = parser.extractPage(document);
    const pageCount = parser.parsePageCount(document);
    return {
      type: 'TAB_PAGE_RESULT',
      protocolVersion: 1,
      jobId,
      shops,
      catalogDelta: collectionsCatalog,
      ...(pageCount ? { pageMeta: { totalShopsDeclared: pageCount.total } } : {}),
    };
  } catch (error) {
    if (error instanceof ExtractionError) {
      return { type: 'TAB_EXTRACT_FAILED', protocolVersion: 1, jobId, code: error.code };
    }
    throw error;
  }
}

export function handleTabClickNext(document: Document, jobId: JobId): ContentToWorkerMessage {
  const kind = parser.hasNextPage(document) ? 'navigating' : 'no_next';
  return { type: 'TAB_NEXT_RESULT', protocolVersion: 1, jobId, kind };
}

// Bounded prelude sent once before the forward crawl (see entrypoints/background.ts's
// `returnToFirstPage`), so a crawl that starts on page 2+ doesn't collect fewer shops than the
// page declares and fail with IncompleteCrawl. Mirrors handleTabClickNext's reply-then-navigate
// contract: this function only decides *what* to do; the actual click happens in
// entrypoints/tabelog.content.ts, via resolveFirstPageNavigationLink, only after the reply has
// been sent (a navigation destroys this execution context).
export function handleTabGoToFirstPage(document: Document, jobId: JobId): ContentToWorkerMessage {
  try {
    parser.detectSavedListPage(document);
  } catch (error) {
    if (error instanceof ExtractionError) {
      return { type: 'TAB_EXTRACT_FAILED', protocolVersion: 1, jobId, code: error.code };
    }
    throw error;
  }

  if (!parser.isBeyondFirstPage(document)) {
    return { type: 'TAB_FIRST_PAGE_RESULT', protocolVersion: 1, jobId, kind: 'already_first' };
  }
  if (resolveFirstPageNavigationLink(document) !== undefined) {
    return { type: 'TAB_FIRST_PAGE_RESULT', protocolVersion: 1, jobId, kind: 'navigating' };
  }
  // Pagination chrome says we are not on page 1, but neither the numbered "1" link nor the prev
  // arrow exists to get us there — page structure drifted from what this feature depends on.
  // Reuses SelectorDrift (generic "page structure differs from expectations") rather than adding
  // a narrow one-off code, per KISS.
  return { type: 'TAB_EXTRACT_FAILED', protocolVersion: 1, jobId, code: 'SelectorDrift' };
}

// Shared by handleTabGoToFirstPage (decision) and the content script (the actual click), so the
// "which link resolves page 1" logic — non-trivial text matching, unlike the plain CSS selector
// TAB_CLICK_NEXT's content-script handler duplicates for its (trivial) next-arrow click — lives
// in exactly one place. Prefers the numbered "1" link (the user's own DOM evidence); falls back
// to the prev arrow for windowed pagination on long lists, where the "1" link may not be
// rendered — see test-plan-phase2.md Module 20's design note.
export function resolveFirstPageNavigationLink(document: Document): HTMLAnchorElement | undefined {
  return parser.findFirstPageLink(document) ?? parser.findPrevPageLink(document);
}
