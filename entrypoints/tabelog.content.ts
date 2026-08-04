import {
  handleTabClickNext,
  handleTabExtractPage,
  handleTabGoToFirstPage,
  resolveFirstPageNavigationLink,
} from '@/src/domain/parser/tabelog-extract-handler';
import { isWorkerToContentMessage } from '@/src/domain/messaging/message-types';

export default defineContentScript({
  registration: 'runtime',
  main() {
    const abortedJobIds = new Set<string>();

    browser.runtime.onMessage.addListener((rawMessage, _sender, sendResponse) => {
      if (!isWorkerToContentMessage(rawMessage)) {
        return undefined;
      }

      if (abortedJobIds.has(rawMessage.jobId) && rawMessage.type !== 'TAB_ABORT') {
        return undefined;
      }

      if (rawMessage.type === 'TAB_ABORT') {
        abortedJobIds.add(rawMessage.jobId);
        return undefined;
      }

      if (rawMessage.type === 'TAB_EXTRACT_PAGE') {
        sendResponse(handleTabExtractPage(document, rawMessage.jobId));
        return undefined;
      }

      if (rawMessage.type === 'TAB_GO_TO_FIRST_PAGE') {
        const result = handleTabGoToFirstPage(document, rawMessage.jobId);
        sendResponse(result);
        if (result.type === 'TAB_FIRST_PAGE_RESULT' && result.kind === 'navigating') {
          resolveFirstPageNavigationLink(document)?.click();
        }
        return undefined;
      }

      if (rawMessage.type === 'TAB_CLICK_NEXT') {
        const result = handleTabClickNext(document, rawMessage.jobId);
        sendResponse(result);
        if (result.type === 'TAB_NEXT_RESULT' && result.kind === 'navigating') {
          const nextLink = document.querySelector<HTMLAnchorElement>(
            'a.c-pagination__arrow.c-pagination__arrow--next[rel="next"]',
          );
          nextLink?.click();
        }
        return undefined;
      }

      return undefined;
    });
  },
});
