import type { PendingPermission, SessionRoot, StoredError, UiStep } from '../domain/models/session';
import type { JobId, PopupToWorkerMessage, UiStateSnapshot, WorkerToPopupMessage } from '../domain/messaging/message-types';
import type { TabContext } from './tab-context-detector';
import { isPendingPermissionFresh } from '../domain/session/pending-permission';
import { errorMessageFor } from '../domain/errors/error-messages';

// A permission grant can arrive long after the popup that requested it died on denial (see
// App.tsx's PERMISSION_REQUEST_CANCELLED path, which may itself never run if the popup was
// killed by the prompt). Bound how long a recorded intent stays actionable so a much-later
// unrelated grant (e.g. a user manually flipping a permission in chrome://extensions) can't
// trigger a stale job.
export const PENDING_PERMISSION_TTL_MS = 5 * 60 * 1000;

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
      pendingPermission: undefined,
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

// `message` always comes from the error catalog (`docs/reference/extension-error-codes.md` via
// `errorMessageFor`) — the single source of truth for user-facing copy; never inline a string
// here, or it will drift from the catalog the moment either one is edited.
function importPreludeFailure(code: string, retryStep: StoredError['retryStep'], now: number): RouteResult {
  return {
    patch: {
      uiStep: 'error',
      lastError: { code, message: errorMessageFor(code), retryStep, at: now },
      pendingPermission: undefined,
    },
  };
}

// Guards the same way `routeExtractStart` guards on `currentUiStep(...) !== 'ready'`: without
// this, a resumed IMPORT_START (from `routePermissionGranted`, after the permission-prompt-kills-
// popup fix) and a surviving popup's own IMPORT_START could both fire and start two import jobs.
// See test-plan-phase2 Module 7.10.
function routeImportStart(state: SessionRoot, mapName: string, deps: RouteDeps): RouteResult {
  if (state.activeJob) {
    return { patch: {} };
  }
  if (!state.extractResult) {
    return importPreludeFailure('NoExtractResult', 'extract', deps.now());
  }
  if (mapName.trim() === '') {
    return importPreludeFailure('InvalidMapName', 'none', deps.now());
  }
  const jobId = deps.newJobId();
  return {
    patch: {
      uiStep: 'import_starting',
      activeJob: { jobId, kind: 'import', startedAt: deps.now() },
      mapName,
      lastError: undefined,
      pendingPermission: undefined,
    },
    tabCommand: { kind: 'open_my_maps', jobId, mapName },
  };
}

function routePermissionRequestPending(
  step: 'extract' | 'import',
  mapName: string | undefined,
  deps: RouteDeps,
): RouteResult {
  const pendingPermission: PendingPermission = { step, mapName, requestedAt: deps.now() };
  return { patch: { pendingPermission } };
}

function routePermissionRequestCancelled(): RouteResult {
  return { patch: { pendingPermission: undefined } };
}

function withPendingPermissionCleared(result: RouteResult): RouteResult {
  return { ...result, patch: { ...result.patch, pendingPermission: undefined } };
}

// Called by the worker's `permissions.onAdded` handler — never off a bare `onAdded` event with
// no recorded intent (that also fires for a permission granted by hand from
// chrome://extensions, and auto-starting a job from that would violate ADR-0003's "the user
// explicitly starts extraction and import"). The caller is responsible for confirming a
// `pendingPermission` exists and that the granted permissions actually satisfy it (via
// `browser.permissions.contains`) before calling this.
export function routePermissionGranted(state: SessionRoot, tabContext: TabContext, deps: RouteDeps): RouteResult {
  const pending = state.pendingPermission;
  if (!pending) {
    return { patch: {} };
  }
  if (!isPendingPermissionFresh(pending.requestedAt, deps.now(), PENDING_PERMISSION_TTL_MS)) {
    return { patch: { pendingPermission: undefined } };
  }
  if (pending.step === 'extract') {
    if (tabContext !== 'ready') {
      // Explicit failure, never a silent no-op (ADR-0003): the active tab having wandered away
      // from the saved list between the permission prompt and the grant landing is a real,
      // user-visible failure mode, not something to swallow.
      const code = tabContext === 'wrong_tabelog_page' ? 'NotSavedListPage' : 'WrongTab';
      return {
        patch: {
          pendingPermission: undefined,
          uiStep: 'error',
          lastError: {
            code,
            message: errorMessageFor(code),
            retryStep: 'none',
            at: deps.now(),
          },
        },
      };
    }
    return withPendingPermissionCleared(routeExtractStart(state, tabContext, deps));
  }
  return withPendingPermissionCleared(routeImportStart(state, pending.mapName ?? '', deps));
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
    case 'PERMISSION_REQUEST_PENDING':
      return routePermissionRequestPending(
        message.step,
        message.step === 'import' ? message.mapName : undefined,
        deps,
      );
    case 'PERMISSION_REQUEST_CANCELLED':
      return routePermissionRequestCancelled();
    default:
      return { patch: {} };
  }
}
