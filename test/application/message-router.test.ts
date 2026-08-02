import { describe, expect, it } from 'vitest';
import { route } from '../../src/application/message-router';
import type { SessionRoot } from '../../src/domain/models/session';

const deps = { newJobId: () => 'job-1', now: () => 1000 };

function baseSession(overrides: Partial<SessionRoot> = {}): SessionRoot {
  return { schemaVersion: 1, uiStep: 'ready', mapName: '食べログ保存リスト 2026-08-02', ...overrides };
}

describe('route GET_UI_STATE', () => {
  it('replies ready when there is no session data and the tab is a valid saved list', () => {
    const result = route(baseSession(), 'ready', { type: 'GET_UI_STATE', protocolVersion: 1 }, deps);
    expect(result.reply).toEqual({
      type: 'UI_STATE',
      protocolVersion: 1,
      snapshot: { uiStep: 'ready', context: 'saved_list' },
    });
  });

  it('replies extracting with progress when an extract job is active', () => {
    const state = baseSession({
      uiStep: 'extracting',
      activeJob: { jobId: 'job-1', kind: 'extract', startedAt: 1, progress: { shopsCollected: 3 } },
    });
    const result = route(state, 'ready', { type: 'GET_UI_STATE', protocolVersion: 1 }, deps);
    expect(result.reply?.type).toBe('UI_STATE');
    expect(result.reply).toMatchObject({
      snapshot: { uiStep: 'extracting', jobId: 'job-1', progress: { shopsCollected: 3 } },
    });
  });

  it('replies confirm with counts when extractResult exists and uiStep is confirm', () => {
    const state = baseSession({
      uiStep: 'confirm',
      extractResult: {
        jobId: 'job-1',
        completedAt: 1,
        shops: [],
        collectionsCatalog: [],
        shopCount: 5,
        collectionCount: 2,
      },
    });
    const result = route(state, 'wrong_tab', { type: 'GET_UI_STATE', protocolVersion: 1 }, deps);
    expect(result.reply).toMatchObject({
      snapshot: { uiStep: 'confirm', shopCount: 5, collectionCount: 2 },
    });
  });

  it('replies import_succeeded when uiStep is import_succeeded and extractResult exists', () => {
    const state = baseSession({
      uiStep: 'import_succeeded',
      extractResult: {
        jobId: 'job-1',
        completedAt: 1,
        shops: [],
        collectionsCatalog: [],
        shopCount: 3,
        collectionCount: 1,
      },
    });
    const result = route(state, 'ready', { type: 'GET_UI_STATE', protocolVersion: 1 }, deps);
    expect(result.reply).toMatchObject({
      snapshot: { uiStep: 'import_succeeded', shopCount: 3, collectionCount: 1 },
    });
  });

  it('replies error with the stored error', () => {
    const state = baseSession({
      uiStep: 'error',
      lastError: { code: 'IncompleteCrawl', message: 'x', retryStep: 'extract', at: 1 },
    });
    const result = route(state, 'ready', { type: 'GET_UI_STATE', protocolVersion: 1 }, deps);
    expect(result.reply).toMatchObject({
      snapshot: { uiStep: 'error', error: { code: 'IncompleteCrawl', retryStep: 'extract' } },
    });
  });
});

describe('route EXTRACT_START', () => {
  it('starts an extract job from ready and requests tab injection', () => {
    const result = route(baseSession(), 'ready', { type: 'EXTRACT_START', protocolVersion: 1 }, deps);
    expect(result.patch.uiStep).toBe('extracting');
    expect(result.patch.activeJob).toEqual({ jobId: 'job-1', kind: 'extract', startedAt: 1000 });
    expect(result.tabCommand).toEqual({ kind: 'start_extract', jobId: 'job-1' });
  });

  it('is a no-op when the tab is not a valid saved list', () => {
    const result = route(baseSession(), 'wrong_tab', { type: 'EXTRACT_START', protocolVersion: 1 }, deps);
    expect(result.patch).toEqual({});
    expect(result.tabCommand).toBeUndefined();
  });
});

describe('route EXTRACT_CANCEL', () => {
  it('clears the active job without writing extractResult', () => {
    const state = baseSession({
      uiStep: 'extracting',
      activeJob: { jobId: 'job-1', kind: 'extract', startedAt: 1 },
    });
    const result = route(state, 'ready', { type: 'EXTRACT_CANCEL', protocolVersion: 1, jobId: 'job-1' }, deps);
    expect(result.patch.activeJob).toBeUndefined();
    expect(result.patch.extractResult).toBeUndefined();
    expect(result.patch.uiStep).toBe('ready');
    expect(result.reply).toEqual({ type: 'EXTRACT_CANCELLED', protocolVersion: 1, jobId: 'job-1' });
  });
});

describe('route UI_STEP_SET', () => {
  it('allows extract_complete -> confirm', () => {
    const state = baseSession({ uiStep: 'extract_complete' });
    const result = route(
      state,
      'ready',
      { type: 'UI_STEP_SET', protocolVersion: 1, uiStep: 'confirm' },
      deps,
    );
    expect(result.patch.uiStep).toBe('confirm');
  });

  it('allows confirm -> extract_complete', () => {
    const state = baseSession({ uiStep: 'confirm' });
    const result = route(
      state,
      'ready',
      { type: 'UI_STEP_SET', protocolVersion: 1, uiStep: 'extract_complete' },
      deps,
    );
    expect(result.patch.uiStep).toBe('extract_complete');
  });

  it('ignores a UI_STEP_SET that is not a documented transition', () => {
    const state = baseSession({ uiStep: 'ready' });
    const result = route(
      state,
      'ready',
      { type: 'UI_STEP_SET', protocolVersion: 1, uiStep: 'confirm' },
      deps,
    );
    expect(result.patch).toEqual({});
  });
});

describe('route EXTRACT_DISCARD', () => {
  it('clears extractResult and returns to ready', () => {
    const state = baseSession({
      uiStep: 'extract_complete',
      extractResult: {
        jobId: 'job-1',
        completedAt: 1,
        shops: [],
        collectionsCatalog: [],
        shopCount: 0,
        collectionCount: 0,
      },
    });
    const result = route(state, 'ready', { type: 'EXTRACT_DISCARD', protocolVersion: 1 }, deps);
    expect(result.patch.extractResult).toBeUndefined();
    expect(result.patch.uiStep).toBe('ready');
  });
});

describe('route MAP_NAME_SET', () => {
  it('updates mapName', () => {
    const result = route(
      baseSession(),
      'ready',
      { type: 'MAP_NAME_SET', protocolVersion: 1, mapName: '新しいマップ' },
      deps,
    );
    expect(result.patch.mapName).toBe('新しいマップ');
  });
});

describe('route IMPORT_START', () => {
  it('fails with NoExtractResult when there is no extract result', () => {
    const result = route(
      baseSession(),
      'ready',
      { type: 'IMPORT_START', protocolVersion: 1, mapName: 'マップ' },
      deps,
    );
    expect(result.patch.uiStep).toBe('error');
    expect(result.patch.lastError).toMatchObject({ code: 'NoExtractResult', retryStep: 'extract' });
  });

  it('fails with InvalidMapName when mapName is empty after trim', () => {
    const state = baseSession({
      extractResult: {
        jobId: 'job-1',
        completedAt: 1,
        shops: [],
        collectionsCatalog: [],
        shopCount: 0,
        collectionCount: 0,
      },
    });
    const result = route(
      state,
      'ready',
      { type: 'IMPORT_START', protocolVersion: 1, mapName: '   ' },
      deps,
    );
    expect(result.patch.uiStep).toBe('error');
    expect(result.patch.lastError).toMatchObject({ code: 'InvalidMapName', retryStep: 'none' });
  });

  it('starts the import job when extractResult and mapName are valid', () => {
    const state = baseSession({
      extractResult: {
        jobId: 'job-1',
        completedAt: 1,
        shops: [],
        collectionsCatalog: [],
        shopCount: 0,
        collectionCount: 0,
      },
    });
    const result = route(
      state,
      'ready',
      { type: 'IMPORT_START', protocolVersion: 1, mapName: 'マップ' },
      deps,
    );
    expect(result.patch.uiStep).toBe('import_starting');
    expect(result.patch.activeJob).toEqual({ jobId: 'job-1', kind: 'import', startedAt: 1000 });
    expect(result.tabCommand).toEqual({ kind: 'open_my_maps', jobId: 'job-1', mapName: 'マップ' });
  });
});

describe('route ERROR_RETRY', () => {
  it('retries extract when retryStep is extract', () => {
    const state = baseSession({
      uiStep: 'error',
      lastError: { code: 'IncompleteCrawl', message: 'x', retryStep: 'extract', at: 1 },
    });
    const result = route(state, 'ready', { type: 'ERROR_RETRY', protocolVersion: 1 }, deps);
    expect(result.patch.uiStep).toBe('extracting');
    expect(result.patch.lastError).toBeUndefined();
    expect(result.tabCommand).toEqual({ kind: 'start_extract', jobId: 'job-1' });
  });

  it('retries import when retryStep is import', () => {
    const state = baseSession({
      uiStep: 'error',
      mapName: 'マップ',
      lastError: { code: 'MyMapsTabOpenFailed', message: 'x', retryStep: 'import', at: 1 },
      extractResult: {
        jobId: 'job-1',
        completedAt: 1,
        shops: [],
        collectionsCatalog: [],
        shopCount: 0,
        collectionCount: 0,
      },
    });
    const result = route(state, 'ready', { type: 'ERROR_RETRY', protocolVersion: 1 }, deps);
    expect(result.patch.uiStep).toBe('import_starting');
    expect(result.tabCommand).toEqual({ kind: 'open_my_maps', jobId: 'job-1', mapName: 'マップ' });
  });

  it('returns to ready when retryStep is none', () => {
    const state = baseSession({
      uiStep: 'error',
      lastError: { code: 'NotSavedListPage', message: 'x', retryStep: 'none', at: 1 },
    });
    const result = route(state, 'ready', { type: 'ERROR_RETRY', protocolVersion: 1 }, deps);
    expect(result.patch.uiStep).toBe('ready');
    expect(result.patch.lastError).toBeUndefined();
  });
});
