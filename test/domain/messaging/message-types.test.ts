import { describe, expect, it } from 'vitest';
import {
  isContentToWorkerMessage,
  isGoogleMapsAddShopResultMessage,
  isGoogleMapsDiagnosticMessage,
  isGoogleMapsToWorkerMessage,
  isPopupToWorkerMessage,
  isWorkerToContentMessage,
  isWorkerToGoogleMapsAddShopMessage,
  isWorkerToGoogleMapsMessage,
  isWorkerToPopupMessage,
} from '../../../src/domain/messaging/message-types';

describe('isPopupToWorkerMessage', () => {
  it('accepts GET_UI_STATE with protocolVersion 1', () => {
    expect(isPopupToWorkerMessage({ type: 'GET_UI_STATE', protocolVersion: 1 })).toBe(true);
  });

  it('accepts EXTRACT_START', () => {
    expect(isPopupToWorkerMessage({ type: 'EXTRACT_START', protocolVersion: 1 })).toBe(true);
  });

  it('accepts EXTRACT_CANCEL with a jobId', () => {
    expect(
      isPopupToWorkerMessage({ type: 'EXTRACT_CANCEL', protocolVersion: 1, jobId: 'job-1' }),
    ).toBe(true);
  });

  it('rejects EXTRACT_CANCEL without a jobId', () => {
    expect(isPopupToWorkerMessage({ type: 'EXTRACT_CANCEL', protocolVersion: 1 })).toBe(false);
  });

  it('accepts UI_STEP_SET for confirm or extract_complete', () => {
    expect(
      isPopupToWorkerMessage({ type: 'UI_STEP_SET', protocolVersion: 1, uiStep: 'confirm' }),
    ).toBe(true);
    expect(
      isPopupToWorkerMessage({
        type: 'UI_STEP_SET',
        protocolVersion: 1,
        uiStep: 'extract_complete',
      }),
    ).toBe(true);
  });

  it('rejects UI_STEP_SET with a non-allowed uiStep', () => {
    expect(isPopupToWorkerMessage({ type: 'UI_STEP_SET', protocolVersion: 1, uiStep: 'ready' })).toBe(
      false,
    );
  });

  it('accepts EXTRACT_DISCARD', () => {
    expect(isPopupToWorkerMessage({ type: 'EXTRACT_DISCARD', protocolVersion: 1 })).toBe(true);
  });

  it('accepts IMPORT_START', () => {
    expect(isPopupToWorkerMessage({ type: 'IMPORT_START', protocolVersion: 1 })).toBe(true);
  });

  it('accepts IMPORT_CANCEL with a jobId', () => {
    expect(
      isPopupToWorkerMessage({ type: 'IMPORT_CANCEL', protocolVersion: 1, jobId: 'job-1' }),
    ).toBe(true);
  });

  it('rejects IMPORT_CANCEL without a jobId', () => {
    expect(isPopupToWorkerMessage({ type: 'IMPORT_CANCEL', protocolVersion: 1 })).toBe(false);
  });

  it('accepts ERROR_RETRY', () => {
    expect(isPopupToWorkerMessage({ type: 'ERROR_RETRY', protocolVersion: 1 })).toBe(true);
  });

  it('accepts PERMISSION_REQUEST_PENDING for step extract', () => {
    expect(
      isPopupToWorkerMessage({ type: 'PERMISSION_REQUEST_PENDING', protocolVersion: 1, step: 'extract' }),
    ).toBe(true);
  });

  it('accepts PERMISSION_REQUEST_PENDING for step import', () => {
    expect(
      isPopupToWorkerMessage({ type: 'PERMISSION_REQUEST_PENDING', protocolVersion: 1, step: 'import' }),
    ).toBe(true);
  });

  it('rejects PERMISSION_REQUEST_PENDING with an unknown step', () => {
    expect(
      isPopupToWorkerMessage({ type: 'PERMISSION_REQUEST_PENDING', protocolVersion: 1, step: 'bogus' }),
    ).toBe(false);
  });

  it('accepts PERMISSION_REQUEST_CANCELLED', () => {
    expect(isPopupToWorkerMessage({ type: 'PERMISSION_REQUEST_CANCELLED', protocolVersion: 1 })).toBe(true);
  });

  it('rejects an unknown type', () => {
    expect(isPopupToWorkerMessage({ type: 'NOT_A_REAL_TYPE', protocolVersion: 1 })).toBe(false);
  });

  it('rejects a protocolVersion mismatch', () => {
    expect(isPopupToWorkerMessage({ type: 'GET_UI_STATE', protocolVersion: 2 })).toBe(false);
  });

  it('rejects non-object values', () => {
    expect(isPopupToWorkerMessage(null)).toBe(false);
    expect(isPopupToWorkerMessage('GET_UI_STATE')).toBe(false);
  });
});

describe('isWorkerToContentMessage', () => {
  it('accepts TAB_EXTRACT_PAGE, TAB_GO_TO_FIRST_PAGE, TAB_CLICK_NEXT, TAB_ABORT with a jobId', () => {
    for (const type of ['TAB_EXTRACT_PAGE', 'TAB_GO_TO_FIRST_PAGE', 'TAB_CLICK_NEXT', 'TAB_ABORT']) {
      expect(isWorkerToContentMessage({ type, protocolVersion: 1, jobId: 'job-1' })).toBe(true);
    }
  });

  it('rejects messages without a jobId', () => {
    expect(isWorkerToContentMessage({ type: 'TAB_EXTRACT_PAGE', protocolVersion: 1 })).toBe(false);
  });
});

describe('isContentToWorkerMessage', () => {
  it('accepts TAB_PAGE_RESULT with shops and catalogDelta arrays', () => {
    expect(
      isContentToWorkerMessage({
        type: 'TAB_PAGE_RESULT',
        protocolVersion: 1,
        jobId: 'job-1',
        shops: [],
        catalogDelta: [],
      }),
    ).toBe(true);
  });

  it('accepts TAB_FIRST_PAGE_RESULT with a valid kind', () => {
    expect(
      isContentToWorkerMessage({
        type: 'TAB_FIRST_PAGE_RESULT',
        protocolVersion: 1,
        jobId: 'job-1',
        kind: 'already_first',
      }),
    ).toBe(true);
    expect(
      isContentToWorkerMessage({
        type: 'TAB_FIRST_PAGE_RESULT',
        protocolVersion: 1,
        jobId: 'job-1',
        kind: 'navigating',
      }),
    ).toBe(true);
  });

  it('rejects TAB_FIRST_PAGE_RESULT with an invalid kind', () => {
    expect(
      isContentToWorkerMessage({
        type: 'TAB_FIRST_PAGE_RESULT',
        protocolVersion: 1,
        jobId: 'job-1',
        kind: 'sideways',
      }),
    ).toBe(false);
  });

  it('accepts TAB_NEXT_RESULT with a valid kind', () => {
    expect(
      isContentToWorkerMessage({
        type: 'TAB_NEXT_RESULT',
        protocolVersion: 1,
        jobId: 'job-1',
        kind: 'navigating',
      }),
    ).toBe(true);
    expect(
      isContentToWorkerMessage({
        type: 'TAB_NEXT_RESULT',
        protocolVersion: 1,
        jobId: 'job-1',
        kind: 'no_next',
      }),
    ).toBe(true);
  });

  it('rejects TAB_NEXT_RESULT with an invalid kind', () => {
    expect(
      isContentToWorkerMessage({
        type: 'TAB_NEXT_RESULT',
        protocolVersion: 1,
        jobId: 'job-1',
        kind: 'sideways',
      }),
    ).toBe(false);
  });

  it('accepts TAB_EXTRACT_FAILED with a code', () => {
    expect(
      isContentToWorkerMessage({
        type: 'TAB_EXTRACT_FAILED',
        protocolVersion: 1,
        jobId: 'job-1',
        code: 'NotSavedListPage',
      }),
    ).toBe(true);
  });
});

describe('isWorkerToPopupMessage', () => {
  it('accepts each documented worker-to-popup type', () => {
    const types = [
      'UI_STATE',
      'EXTRACT_PROGRESS',
      'EXTRACT_SUCCEEDED',
      'EXTRACT_FAILED',
      'EXTRACT_CANCELLED',
      'IMPORT_PRELUDE_FAILED',
      'IMPORT_PRELUDE_STARTED',
      'IMPORT_SHOPS_PROGRESS',
      'IMPORT_SUCCEEDED',
      'IMPORT_FAILED',
    ];
    for (const type of types) {
      expect(isWorkerToPopupMessage({ type, protocolVersion: 1 })).toBe(true);
    }
  });

  it('rejects an unknown type', () => {
    expect(isWorkerToPopupMessage({ type: 'NOT_REAL', protocolVersion: 1 })).toBe(false);
  });
});

describe('isGoogleMapsDiagnosticMessage', () => {
  it('accepts a diagnostic with a jobId and line', () => {
    expect(
      isGoogleMapsDiagnosticMessage({
        type: 'GMAPS_DIAGNOSTIC',
        protocolVersion: 1,
        jobId: 'job-1',
        line: 'step=handleEnsureList:start',
      }),
    ).toBe(true);
  });

  it('rejects a diagnostic without a line', () => {
    expect(
      isGoogleMapsDiagnosticMessage({ type: 'GMAPS_DIAGNOSTIC', protocolVersion: 1, jobId: 'job-1' }),
    ).toBe(false);
  });

  it('rejects an unknown type', () => {
    expect(
      isGoogleMapsDiagnosticMessage({ type: 'NOT_REAL', protocolVersion: 1, jobId: 'job-1', line: 'x' }),
    ).toBe(false);
  });
});

describe('isWorkerToGoogleMapsMessage', () => {
  it('accepts GMAPS_ENSURE_LIST with a jobId and listName', () => {
    expect(
      isWorkerToGoogleMapsMessage({
        type: 'GMAPS_ENSURE_LIST',
        protocolVersion: 1,
        jobId: 'job-1',
        listName: '食べログ',
      }),
    ).toBe(true);
  });

  it('rejects GMAPS_ENSURE_LIST without a listName', () => {
    expect(
      isWorkerToGoogleMapsMessage({ type: 'GMAPS_ENSURE_LIST', protocolVersion: 1, jobId: 'job-1' }),
    ).toBe(false);
  });

  it('rejects GMAPS_ENSURE_LIST without a jobId', () => {
    expect(
      isWorkerToGoogleMapsMessage({ type: 'GMAPS_ENSURE_LIST', protocolVersion: 1, listName: '食べログ' }),
    ).toBe(false);
  });
});

describe('isGoogleMapsToWorkerMessage', () => {
  it('accepts an ok:true result with a created boolean', () => {
    expect(
      isGoogleMapsToWorkerMessage({
        type: 'GMAPS_ENSURE_LIST_RESULT',
        protocolVersion: 1,
        jobId: 'job-1',
        ok: true,
        created: false,
      }),
    ).toBe(true);
  });

  it('accepts an ok:true result with an optional diagnostics string array present', () => {
    expect(
      isGoogleMapsToWorkerMessage({
        type: 'GMAPS_ENSURE_LIST_RESULT',
        protocolVersion: 1,
        jobId: 'job-1',
        ok: true,
        created: false,
        diagnostics: ['step=menu:found', 'step=saved:clicked'],
      }),
    ).toBe(true);
  });

  it('rejects an ok:true result missing created', () => {
    expect(
      isGoogleMapsToWorkerMessage({
        type: 'GMAPS_ENSURE_LIST_RESULT',
        protocolVersion: 1,
        jobId: 'job-1',
        ok: true,
      }),
    ).toBe(false);
  });

  it('accepts an ok:false result with a code', () => {
    expect(
      isGoogleMapsToWorkerMessage({
        type: 'GMAPS_ENSURE_LIST_RESULT',
        protocolVersion: 1,
        jobId: 'job-1',
        ok: false,
        code: 'GoogleMapsUiChanged',
      }),
    ).toBe(true);
  });

  it('rejects an ok:false result missing a code', () => {
    expect(
      isGoogleMapsToWorkerMessage({ type: 'GMAPS_ENSURE_LIST_RESULT', protocolVersion: 1, jobId: 'job-1', ok: false }),
    ).toBe(false);
  });

  it('rejects an unknown type', () => {
    expect(isGoogleMapsToWorkerMessage({ type: 'NOT_REAL', protocolVersion: 1, jobId: 'job-1' })).toBe(false);
  });
});

describe('isWorkerToGoogleMapsAddShopMessage', () => {
  const base = {
    type: 'GMAPS_ADD_SHOP',
    protocolVersion: 1,
    jobId: 'job-1',
    listName: '食べログ',
    shopName: 'Example Shop',
    shopAddress: 'Tokyo, Example City, 1-2-3',
  };

  it('accepts a fully-populated message', () => {
    expect(isWorkerToGoogleMapsAddShopMessage(base)).toBe(true);
  });

  it('rejects one missing listName', () => {
    const { listName, ...rest } = base;
    expect(isWorkerToGoogleMapsAddShopMessage(rest)).toBe(false);
  });

  it('rejects one missing shopName', () => {
    const { shopName, ...rest } = base;
    expect(isWorkerToGoogleMapsAddShopMessage(rest)).toBe(false);
  });

  it('rejects one missing shopAddress', () => {
    const { shopAddress, ...rest } = base;
    expect(isWorkerToGoogleMapsAddShopMessage(rest)).toBe(false);
  });
});

describe('isGoogleMapsAddShopResultMessage', () => {
  it('accepts an ok:true result with status "added"', () => {
    expect(
      isGoogleMapsAddShopResultMessage({
        type: 'GMAPS_ADD_SHOP_RESULT',
        protocolVersion: 1,
        jobId: 'job-1',
        ok: true,
        status: 'added',
      }),
    ).toBe(true);
  });

  it('accepts an ok:true result with status "already_present"', () => {
    expect(
      isGoogleMapsAddShopResultMessage({
        type: 'GMAPS_ADD_SHOP_RESULT',
        protocolVersion: 1,
        jobId: 'job-1',
        ok: true,
        status: 'already_present',
      }),
    ).toBe(true);
  });

  it('rejects an ok:true result with an invalid status', () => {
    expect(
      isGoogleMapsAddShopResultMessage({
        type: 'GMAPS_ADD_SHOP_RESULT',
        protocolVersion: 1,
        jobId: 'job-1',
        ok: true,
        status: 'bogus',
      }),
    ).toBe(false);
  });

  it('accepts an ok:false result with a code', () => {
    expect(
      isGoogleMapsAddShopResultMessage({
        type: 'GMAPS_ADD_SHOP_RESULT',
        protocolVersion: 1,
        jobId: 'job-1',
        ok: false,
        code: 'GoogleMapsUiChanged',
      }),
    ).toBe(true);
  });

  it('rejects an ok:false result missing a code', () => {
    expect(
      isGoogleMapsAddShopResultMessage({ type: 'GMAPS_ADD_SHOP_RESULT', protocolVersion: 1, jobId: 'job-1', ok: false }),
    ).toBe(false);
  });

  it('rejects an unknown type', () => {
    expect(isGoogleMapsAddShopResultMessage({ type: 'NOT_REAL', protocolVersion: 1, jobId: 'job-1' })).toBe(false);
  });
});

// Security review round 1, F3: replies from content scripts carry page-derived data, so the worker
// validates their full shape before using them.
describe('reply validation from content scripts (F3)', () => {
  const validShop = {
    name: '店名',
    url: 'https://tabelog.com/tokyo/A1301/A130101/13000001/',
    address: '東京都千代田区1-1',
    description: 'https://tabelog.com/tokyo/A1301/A130101/13000001/',
    collections: [{ id: '1', name: 'ラーメン' }],
  };
  const pageResult = (overrides: Record<string, unknown>) => ({
    type: 'TAB_PAGE_RESULT',
    protocolVersion: 1,
    jobId: 'job-1',
    shops: [validShop],
    catalogDelta: [{ id: '1', name: 'ラーメン' }],
    ...overrides,
  });

  it('accepts TAB_PAGE_RESULT with well-formed shops, catalog entries, and pageMeta', () => {
    expect(isContentToWorkerMessage(pageResult({ pageMeta: { totalShopsDeclared: 1 } }))).toBe(true);
  });

  it('rejects TAB_PAGE_RESULT when a shop is missing its url', () => {
    const { url: _url, ...shopWithoutUrl } = validShop;
    expect(isContentToWorkerMessage(pageResult({ shops: [shopWithoutUrl] }))).toBe(false);
  });

  it('rejects TAB_PAGE_RESULT when a shop name is not a string', () => {
    expect(isContentToWorkerMessage(pageResult({ shops: [{ ...validShop, name: 42 }] }))).toBe(false);
  });

  it('rejects TAB_PAGE_RESULT when a shop collection entry is malformed', () => {
    expect(isContentToWorkerMessage(pageResult({ shops: [{ ...validShop, collections: [{ id: 1 }] }] }))).toBe(
      false,
    );
  });

  it('rejects TAB_PAGE_RESULT when a catalog entry is missing its id', () => {
    expect(isContentToWorkerMessage(pageResult({ catalogDelta: [{ name: 'ラーメン' }] }))).toBe(false);
  });

  it('rejects TAB_PAGE_RESULT when pageMeta.totalShopsDeclared is not a number', () => {
    expect(isContentToWorkerMessage(pageResult({ pageMeta: { totalShopsDeclared: '1' } }))).toBe(false);
  });

  it('rejects GMAPS_ENSURE_LIST_RESULT whose diagnostics is not a string array', () => {
    expect(
      isGoogleMapsToWorkerMessage({
        type: 'GMAPS_ENSURE_LIST_RESULT',
        protocolVersion: 1,
        jobId: 'job-1',
        ok: true,
        created: false,
        diagnostics: [{ html: '<b>x</b>' }],
      }),
    ).toBe(false);
  });

  it('rejects GMAPS_ADD_SHOP_RESULT whose diagnostics is not a string array', () => {
    expect(
      isGoogleMapsAddShopResultMessage({
        type: 'GMAPS_ADD_SHOP_RESULT',
        protocolVersion: 1,
        jobId: 'job-1',
        ok: true,
        status: 'added',
        diagnostics: 'step=x',
      }),
    ).toBe(false);
  });
});
