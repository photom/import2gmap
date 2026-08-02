import type { SessionRoot, StoredError, UiStep } from '../domain/models/session';
import type { JobId, PopupToWorkerMessage, UiStateSnapshot, WorkerToPopupMessage } from '../domain/messaging/message-types';
import type { TabContext } from './tab-context-detector';

export type TabCommand =
  | { readonly kind: 'start_extract'; readonly jobId: JobId }
  | { readonly kind: 'open_my_maps'; readonly jobId: JobId; readonly mapName: string };

export type RouteDeps = {
  readonly newJobId: () => string;
  readonly now: () => number;
};

export type RouteResult = {
  readonly patch: Partial<SessionRoot>;
  readonly reply?: WorkerToPopupMessage;
  readonly tabCommand?: TabCommand;
};

function tabContextToUiStep(tabContext: TabContext): UiStep {
  return tabContext;
}

function tabContextToContext(tabContext: TabContext): UiStateSnapshot['context'] {
  if (tabContext === 'ready') return 'saved_list';
  if (tabContext === 'wrong_tabelog_page') return 'tabelog_other';
  return 'other';
}

function currentUiStep(state: SessionRoot, tabContext: TabContext): UiStep {
  if (state.activeJob?.kind === 'extract') return 'extracting';
  if (state.activeJob?.kind === 'import') return 'import_starting';
  if (state.lastError) return 'error';
  if (state.extractResult) {
    if (state.uiStep === 'confirm' || state.uiStep === 'import_succeeded') return state.uiStep;
    return 'extract_complete';
  }
  return tabContextToUiStep(tabContext);
}

function buildSnapshot(state: SessionRoot, tabContext: TabContext): UiStateSnapshot {
  const uiStep = currentUiStep(state, tabContext);
  const snapshot: UiStateSnapshot = {
    uiStep,
    context: tabContextToContext(tabContext),
  };
  if (state.activeJob) {
    return {
      ...snapshot,
      jobId: state.activeJob.jobId,
      ...(state.activeJob.progress ? { progress: state.activeJob.progress } : {}),
    };
  }
  if (uiStep === 'error' && state.lastError) {
    return { ...snapshot, error: state.lastError };
  }
  if (state.extractResult) {
    return {
      ...snapshot,
      shopCount: state.extractResult.shopCount,
      collectionCount: state.extractResult.collectionCount,
      mapName: state.mapName,
    };
  }
  return snapshot;
}

function routeGetUiState(state: SessionRoot, tabContext: TabContext): RouteResult {
  return {
    patch: {},
    reply: { type: 'UI_STATE', protocolVersion: 1, snapshot: buildSnapshot(state, tabContext) },
  };
}

function routeExtractStart(state: SessionRoot, tabContext: TabContext, deps: RouteDeps): RouteResult {
  if (currentUiStep(state, tabContext) !== 'ready') {
    return { patch: {} };
  }
  const jobId = deps.newJobId();
  return {
    patch: {
      uiStep: 'extracting',
      activeJob: { jobId, kind: 'extract', startedAt: deps.now() },
      lastError: undefined,
    },
    tabCommand: { kind: 'start_extract', jobId },
  };
}

function routeExtractCancel(jobId: JobId): RouteResult {
  return {
    patch: { uiStep: 'ready', activeJob: undefined },
    reply: { type: 'EXTRACT_CANCELLED', protocolVersion: 1, jobId },
  };
}

function routeUiStepSet(state: SessionRoot, uiStep: 'confirm' | 'extract_complete'): RouteResult {
  if (uiStep === 'confirm' && state.uiStep === 'extract_complete') {
    return { patch: { uiStep: 'confirm' } };
  }
  if (uiStep === 'extract_complete' && state.uiStep === 'confirm') {
    return { patch: { uiStep: 'extract_complete' } };
  }
  return { patch: {} };
}

function routeExtractDiscard(): RouteResult {
  return { patch: { extractResult: undefined, uiStep: 'ready', lastError: undefined } };
}

function routeMapNameSet(mapName: string): RouteResult {
  return { patch: { mapName } };
}

function importPreludeFailure(code: string, message: string, retryStep: StoredError['retryStep'], now: number): RouteResult {
  return {
    patch: {
      uiStep: 'error',
      lastError: { code, message, retryStep, at: now },
    },
  };
}

function routeImportStart(state: SessionRoot, mapName: string, deps: RouteDeps): RouteResult {
  if (!state.extractResult) {
    return importPreludeFailure('NoExtractResult', '先に抽出してください。', 'extract', deps.now());
  }
  if (mapName.trim() === '') {
    return importPreludeFailure('InvalidMapName', 'マップ名を入力してください。', 'none', deps.now());
  }
  const jobId = deps.newJobId();
  return {
    patch: {
      uiStep: 'import_starting',
      activeJob: { jobId, kind: 'import', startedAt: deps.now() },
      mapName,
      lastError: undefined,
    },
    tabCommand: { kind: 'open_my_maps', jobId, mapName },
  };
}

function routeErrorRetry(state: SessionRoot, tabContext: TabContext, deps: RouteDeps): RouteResult {
  const retryStep = state.lastError?.retryStep ?? 'none';
  if (retryStep === 'extract') {
    const clearedState: SessionRoot = { ...state, uiStep: 'ready', lastError: undefined, activeJob: undefined };
    return routeExtractStart(clearedState, tabContext, deps);
  }
  if (retryStep === 'import') {
    const clearedState: SessionRoot = { ...state, lastError: undefined, activeJob: undefined };
    return routeImportStart(clearedState, state.mapName, deps);
  }
  return { patch: { uiStep: 'ready', lastError: undefined } };
}

export function route(
  state: SessionRoot,
  tabContext: TabContext,
  message: PopupToWorkerMessage,
  deps: RouteDeps,
): RouteResult {
  switch (message.type) {
    case 'GET_UI_STATE':
      return routeGetUiState(state, tabContext);
    case 'EXTRACT_START':
      return routeExtractStart(state, tabContext, deps);
    case 'EXTRACT_CANCEL':
      return routeExtractCancel(message.jobId);
    case 'UI_STEP_SET':
      return routeUiStepSet(state, message.uiStep);
    case 'EXTRACT_DISCARD':
      return routeExtractDiscard();
    case 'MAP_NAME_SET':
      return routeMapNameSet(message.mapName);
    case 'IMPORT_START':
      return routeImportStart(state, message.mapName, deps);
    case 'IMPORT_CANCEL':
      return { patch: { uiStep: 'ready', activeJob: undefined } };
    case 'ERROR_RETRY':
      return routeErrorRetry(state, tabContext, deps);
    default:
      return { patch: {} };
  }
}
