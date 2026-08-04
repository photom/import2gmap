import { describe, expect, it } from 'vitest';
import { buildScreenViewModel } from '../../src/application/popup-view-model';
import type { UiStateSnapshot } from '../../src/domain/messaging/message-types';

describe('buildScreenViewModel', () => {
  it('maps ready to an enabled extract screen', () => {
    const snapshot: UiStateSnapshot = { uiStep: 'ready', context: 'saved_list' };
    expect(buildScreenViewModel(snapshot)).toEqual({ screen: 'ready', extractEnabled: true });
  });

  it('maps wrong_tab / wrong_tabelog_page to a disabled wrong_context screen', () => {
    expect(buildScreenViewModel({ uiStep: 'wrong_tab', context: 'other' })).toEqual({
      screen: 'wrong_context',
      extractEnabled: false,
      code: 'wrong_tab',
    });
    expect(buildScreenViewModel({ uiStep: 'wrong_tabelog_page', context: 'tabelog_other' })).toEqual({
      screen: 'wrong_context',
      extractEnabled: false,
      code: 'wrong_tabelog_page',
    });
  });

  it('maps extracting to a progress screen', () => {
    const snapshot: UiStateSnapshot = {
      uiStep: 'extracting',
      context: 'saved_list',
      progress: { shopsCollected: 4, currentPage: 1, totalPages: 3 },
    };
    expect(buildScreenViewModel(snapshot)).toEqual({
      screen: 'extracting',
      progress: { shopsCollected: 4, currentPage: 1, totalPages: 3 },
    });
  });

  it('maps extract_complete to a result screen with shop count', () => {
    const snapshot: UiStateSnapshot = {
      uiStep: 'extract_complete',
      context: 'saved_list',
      shopCount: 12,
      collectionCount: 3,
    };
    expect(buildScreenViewModel(snapshot)).toEqual({
      screen: 'extract_complete',
      shopCount: 12,
      collectionCount: 3,
    });
  });

  it('maps confirm to a summary screen with map name', () => {
    const snapshot: UiStateSnapshot = {
      uiStep: 'confirm',
      context: 'saved_list',
      shopCount: 12,
      collectionCount: 3,
      mapName: '食べログ保存リスト 2026-08-02',
    };
    expect(buildScreenViewModel(snapshot)).toEqual({
      screen: 'confirm',
      shopCount: 12,
      collectionCount: 3,
      mapName: '食べログ保存リスト 2026-08-02',
    });
  });

  it('maps import_starting to an import_starting screen', () => {
    expect(buildScreenViewModel({ uiStep: 'import_starting', context: 'saved_list' })).toEqual({
      screen: 'import_starting',
    });
  });

  it('maps import_succeeded to a success screen with map name', () => {
    const snapshot: UiStateSnapshot = {
      uiStep: 'import_succeeded',
      context: 'saved_list',
      shopCount: 3,
      collectionCount: 1,
      mapName: 'マイマップ',
    };
    expect(buildScreenViewModel(snapshot)).toEqual({
      screen: 'import_succeeded',
      shopCount: 3,
      mapName: 'マイマップ',
    });
  });

  it('maps error to an error screen carrying code, message, retry availability, and retryStep', () => {
    const snapshot: UiStateSnapshot = {
      uiStep: 'error',
      context: 'saved_list',
      error: { code: 'IncompleteCrawl', message: '最後まで取得できませんでした。', retryStep: 'extract' },
    };
    expect(buildScreenViewModel(snapshot)).toEqual({
      screen: 'error',
      code: 'IncompleteCrawl',
      message: '最後まで取得できませんでした。',
      canRetry: true,
      retryStep: 'extract',
    });
  });

  it('carries retryStep import for an import-step failure (no Tabelog guidance)', () => {
    const snapshot: UiStateSnapshot = {
      uiStep: 'error',
      context: 'saved_list',
      error: { code: 'MyMapsUiChanged', message: 'x', retryStep: 'import' },
    };
    const view = buildScreenViewModel(snapshot);
    expect(view.screen === 'error' && view.retryStep).toBe('import');
  });

  it('marks canRetry false when retryStep is none', () => {
    const snapshot: UiStateSnapshot = {
      uiStep: 'error',
      context: 'saved_list',
      error: { code: 'NotSavedListPage', message: 'x', retryStep: 'none' },
    };
    const view = buildScreenViewModel(snapshot);
    expect(view.screen === 'error' && view.canRetry).toBe(false);
  });
});
