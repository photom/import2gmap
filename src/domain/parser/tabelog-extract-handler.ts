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
