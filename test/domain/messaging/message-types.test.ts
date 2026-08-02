import { describe, expect, it } from 'vitest';
import {
  isContentToWorkerMessage,
  isPopupToWorkerMessage,
  isWorkerToContentMessage,
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

  it('accepts MAP_NAME_SET with a mapName string', () => {
    expect(
      isPopupToWorkerMessage({ type: 'MAP_NAME_SET', protocolVersion: 1, mapName: '食べログ保存リスト' }),
    ).toBe(true);
  });

  it('accepts IMPORT_START with a mapName string', () => {
    expect(
      isPopupToWorkerMessage({ type: 'IMPORT_START', protocolVersion: 1, mapName: 'マップ' }),
    ).toBe(true);
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
  it('accepts TAB_EXTRACT_PAGE, TAB_CLICK_NEXT, TAB_ABORT with a jobId', () => {
    for (const type of ['TAB_EXTRACT_PAGE', 'TAB_CLICK_NEXT', 'TAB_ABORT']) {
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
