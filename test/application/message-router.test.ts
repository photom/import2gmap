import { describe, expect, it } from 'vitest';
import { PENDING_PERMISSION_TTL_MS, route, routePermissionGranted } from '../../src/application/message-router';
import { errorMessageFor } from '../../src/domain/errors/error-messages';
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
    // message comes from the error catalog (see docs/reference/extension-error-codes.md via
    // errorMessageFor) — added 2026-08-04 as part of removing a hardcoded string here that had
    // drifted from the catalog's actual NoExtractResult copy.
    expect(result.patch.lastError).toMatchObject({
      code: 'NoExtractResult',
      message: errorMessageFor('NoExtractResult'),
      retryStep: 'extract',
    });
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
    expect(result.patch.lastError).toMatchObject({
      code: 'InvalidMapName',
      message: errorMessageFor('InvalidMapName'),
      retryStep: 'none',
    });
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
    expect(result.patch.pendingPermission).toBeUndefined();
  });

  it('is a no-op when a job is already active — added 2026-08-04 (see test-plan-phase2 Module 7.10)', () => {
    const state = baseSession({
      uiStep: 'import_starting',
      activeJob: { jobId: 'job-0', kind: 'import', startedAt: 1 },
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
    expect(result.patch).toEqual({});
    expect(result.tabCommand).toBeUndefined();
  });
});

describe('route PERMISSION_REQUEST_PENDING / PERMISSION_REQUEST_CANCELLED — added 2026-08-04 (test-plan-phase2 Module 7.11)', () => {
  it('records a pending extract intent', () => {
    const result = route(
      baseSession(),
      'ready',
      { type: 'PERMISSION_REQUEST_PENDING', protocolVersion: 1, step: 'extract' },
      deps,
    );
    expect(result.patch.pendingPermission).toEqual({ step: 'extract', requestedAt: 1000 });
  });

  it('records a pending import intent with its mapName', () => {
    const result = route(
      baseSession(),
      'ready',
      { type: 'PERMISSION_REQUEST_PENDING', protocolVersion: 1, step: 'import', mapName: 'マップ' },
      deps,
    );
    expect(result.patch.pendingPermission).toEqual({
      step: 'import',
      mapName: 'マップ',
      requestedAt: 1000,
    });
  });

  it('clears a pending intent on cancellation', () => {
    const state = baseSession({ pendingPermission: { step: 'extract', requestedAt: 1 } });
    const result = route(state, 'ready', { type: 'PERMISSION_REQUEST_CANCELLED', protocolVersion: 1 }, deps);
    expect(result.patch).toEqual({ pendingPermission: undefined });
  });
});

describe('routePermissionGranted — added 2026-08-04 (test-plan-phase2 Module 19.2)', () => {
  it('is a no-op when there is no pending permission', () => {
    const result = routePermissionGranted(baseSession(), 'ready', deps);
    expect(result.patch).toEqual({});
    expect(result.tabCommand).toBeUndefined();
  });

  it('clears an expired pending permission without starting anything', () => {
    const state = baseSession({ pendingPermission: { step: 'extract', requestedAt: 1000 } });
    const expiredDeps = { newJobId: () => 'job-1', now: () => 1000 + PENDING_PERMISSION_TTL_MS + 1 };
    const result = routePermissionGranted(state, 'ready', expiredDeps);
    expect(result.patch).toEqual({ pendingPermission: undefined });
    expect(result.tabCommand).toBeUndefined();
  });

  it('starts the extract job when the pending step is extract and the tab is the saved list', () => {
    const state = baseSession({ pendingPermission: { step: 'extract', requestedAt: 500 } });
    const result = routePermissionGranted(state, 'ready', deps);
    expect(result.patch.uiStep).toBe('extracting');
    expect(result.patch.activeJob).toEqual({ jobId: 'job-1', kind: 'extract', startedAt: 1000 });
    expect(result.tabCommand).toEqual({ kind: 'start_extract', jobId: 'job-1' });
    expect(result.patch.pendingPermission).toBeUndefined();
  });

  it('fails explicitly with NotSavedListPage when the tab is Tabelog but not the saved list', () => {
    const state = baseSession({ pendingPermission: { step: 'extract', requestedAt: 500 } });
    const result = routePermissionGranted(state, 'wrong_tabelog_page', deps);
    expect(result.patch.uiStep).toBe('error');
    expect(result.patch.lastError).toMatchObject({
      code: 'NotSavedListPage',
      message: errorMessageFor('NotSavedListPage'),
      retryStep: 'none',
    });
    expect(result.patch.pendingPermission).toBeUndefined();
    expect(result.tabCommand).toBeUndefined();
  });

  it('fails explicitly with WrongTab when the active tab is not Tabelog at all', () => {
    const state = baseSession({ pendingPermission: { step: 'extract', requestedAt: 500 } });
    const result = routePermissionGranted(state, 'wrong_tab', deps);
    expect(result.patch.uiStep).toBe('error');
    expect(result.patch.lastError).toMatchObject({
      code: 'WrongTab',
      message: errorMessageFor('WrongTab'),
      retryStep: 'none',
    });
    expect(result.patch.pendingPermission).toBeUndefined();
  });

  it('starts the import job when the pending step is import', () => {
    const state = baseSession({
      pendingPermission: { step: 'import', mapName: 'マップ', requestedAt: 500 },
      extractResult: {
        jobId: 'job-1',
        completedAt: 1,
        shops: [],
        collectionsCatalog: [],
        shopCount: 0,
        collectionCount: 0,
      },
    });
    const result = routePermissionGranted(state, 'ready', deps);
    expect(result.patch.uiStep).toBe('import_starting');
    expect(result.tabCommand).toEqual({ kind: 'open_my_maps', jobId: 'job-1', mapName: 'マップ' });
    expect(result.patch.pendingPermission).toBeUndefined();
  });

  it('clears the pending permission but starts nothing when a job is already active', () => {
    const state = baseSession({
      pendingPermission: { step: 'extract', requestedAt: 500 },
      uiStep: 'extracting',
      activeJob: { jobId: 'job-0', kind: 'extract', startedAt: 1 },
    });
    const result = routePermissionGranted(state, 'ready', deps);
    expect(result.patch).toEqual({ pendingPermission: undefined });
    expect(result.tabCommand).toBeUndefined();
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
