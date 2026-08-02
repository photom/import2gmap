import type { UiStep } from '../models/session';

export type ProtocolVersion = 1;

export type JobId = string;

export type ExtractProgress = {
  readonly shopsCollected: number;
  readonly currentPage?: number;
  readonly totalPages?: number;
  readonly totalShopsDeclared?: number;
};

export type ExtensionErrorPayload = {
  readonly code: string;
  readonly message: string;
  readonly retryStep: 'extract' | 'import' | 'none';
  readonly jobId?: JobId;
};

export type PopupToWorkerMessage =
  | { readonly type: 'GET_UI_STATE'; readonly protocolVersion: ProtocolVersion }
  | { readonly type: 'EXTRACT_START'; readonly protocolVersion: ProtocolVersion }
  | { readonly type: 'EXTRACT_CANCEL'; readonly protocolVersion: ProtocolVersion; readonly jobId: JobId }
  | {
      readonly type: 'UI_STEP_SET';
      readonly protocolVersion: ProtocolVersion;
      readonly uiStep: 'confirm' | 'extract_complete';
    }
  | { readonly type: 'EXTRACT_DISCARD'; readonly protocolVersion: ProtocolVersion }
  | { readonly type: 'MAP_NAME_SET'; readonly protocolVersion: ProtocolVersion; readonly mapName: string }
  | { readonly type: 'IMPORT_START'; readonly protocolVersion: ProtocolVersion; readonly mapName: string }
  | { readonly type: 'IMPORT_CANCEL'; readonly protocolVersion: ProtocolVersion; readonly jobId: JobId }
  | { readonly type: 'ERROR_RETRY'; readonly protocolVersion: ProtocolVersion };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function hasProtocolVersion1(value: Record<string, unknown>): boolean {
  return value.protocolVersion === 1;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

export function isPopupToWorkerMessage(value: unknown): value is PopupToWorkerMessage {
  if (!isRecord(value) || !hasProtocolVersion1(value)) {
    return false;
  }
  switch (value.type) {
    case 'GET_UI_STATE':
    case 'EXTRACT_START':
    case 'EXTRACT_DISCARD':
    case 'ERROR_RETRY':
      return true;
    case 'EXTRACT_CANCEL':
    case 'IMPORT_CANCEL':
      return isNonEmptyString(value.jobId);
    case 'UI_STEP_SET':
      return value.uiStep === 'confirm' || value.uiStep === 'extract_complete';
    case 'MAP_NAME_SET':
      return typeof value.mapName === 'string';
    case 'IMPORT_START':
      return typeof value.mapName === 'string';
    default:
      return false;
  }
}

export type WorkerToContentMessage =
  | { readonly type: 'TAB_EXTRACT_PAGE'; readonly protocolVersion: ProtocolVersion; readonly jobId: JobId }
  | { readonly type: 'TAB_CLICK_NEXT'; readonly protocolVersion: ProtocolVersion; readonly jobId: JobId }
  | { readonly type: 'TAB_ABORT'; readonly protocolVersion: ProtocolVersion; readonly jobId: JobId };

export function isWorkerToContentMessage(value: unknown): value is WorkerToContentMessage {
  if (!isRecord(value) || !hasProtocolVersion1(value)) {
    return false;
  }
  if (!isNonEmptyString(value.jobId)) {
    return false;
  }
  return value.type === 'TAB_EXTRACT_PAGE' || value.type === 'TAB_CLICK_NEXT' || value.type === 'TAB_ABORT';
}

export type ContentToWorkerMessage =
  | {
      readonly type: 'TAB_PAGE_RESULT';
      readonly protocolVersion: ProtocolVersion;
      readonly jobId: JobId;
      readonly shops: readonly unknown[];
      readonly catalogDelta: readonly unknown[];
      readonly pageMeta?: { readonly currentPage?: number; readonly totalShopsDeclared?: number };
    }
  | {
      readonly type: 'TAB_NEXT_RESULT';
      readonly protocolVersion: ProtocolVersion;
      readonly jobId: JobId;
      readonly kind: 'navigating' | 'no_next';
    }
  | {
      readonly type: 'TAB_EXTRACT_FAILED';
      readonly protocolVersion: ProtocolVersion;
      readonly jobId: JobId;
      readonly code: string;
      readonly detail?: string;
    };

export function isContentToWorkerMessage(value: unknown): value is ContentToWorkerMessage {
  if (!isRecord(value) || !hasProtocolVersion1(value)) {
    return false;
  }
  if (!isNonEmptyString(value.jobId)) {
    return false;
  }
  switch (value.type) {
    case 'TAB_PAGE_RESULT':
      return Array.isArray(value.shops) && Array.isArray(value.catalogDelta);
    case 'TAB_NEXT_RESULT':
      return value.kind === 'navigating' || value.kind === 'no_next';
    case 'TAB_EXTRACT_FAILED':
      return isNonEmptyString(value.code);
    default:
      return false;
  }
}

// The KML upload dialog spans two frames (see messaging protocol §6 and the spike results'
// "cross-origin picker iframe" finding): MAPS_OPEN_IMPORT_DIALOG runs in the top My Maps frame
// (it only clicks the import link, which is what makes the picker iframe start loading);
// MAPS_FEED_KML runs in the picker frame itself (only place the file input exists);
// MAPS_AWAIT_IMPORT_RESULT runs back in the top frame (only place the success signal exists).
// The worker is responsible for finding the picker frame's frameId and targeting each message
// at the correct frame — see `waitForPickerFrame` in entrypoints/background.ts.
export type WorkerToMapsMessage =
  | { readonly type: 'MAPS_PREPARE_IMPORT'; readonly protocolVersion: ProtocolVersion; readonly jobId: JobId }
  | {
      readonly type: 'MAPS_SET_MAP_TITLE';
      readonly protocolVersion: ProtocolVersion;
      readonly jobId: JobId;
      readonly mapName: string;
    }
  | { readonly type: 'MAPS_OPEN_IMPORT_DIALOG'; readonly protocolVersion: ProtocolVersion; readonly jobId: JobId }
  | {
      readonly type: 'MAPS_FEED_KML';
      readonly protocolVersion: ProtocolVersion;
      readonly jobId: JobId;
      readonly kml: string;
      readonly fileName: string;
    }
  | { readonly type: 'MAPS_AWAIT_IMPORT_RESULT'; readonly protocolVersion: ProtocolVersion; readonly jobId: JobId };

export function isWorkerToMapsMessage(value: unknown): value is WorkerToMapsMessage {
  if (!isRecord(value) || !hasProtocolVersion1(value) || !isNonEmptyString(value.jobId)) {
    return false;
  }
  switch (value.type) {
    case 'MAPS_PREPARE_IMPORT':
    case 'MAPS_OPEN_IMPORT_DIALOG':
    case 'MAPS_AWAIT_IMPORT_RESULT':
      return true;
    case 'MAPS_SET_MAP_TITLE':
      return isNonEmptyString(value.mapName);
    case 'MAPS_FEED_KML':
      return typeof value.kml === 'string' && isNonEmptyString(value.fileName);
    default:
      return false;
  }
}

export type MapsOutcome = { readonly ok: true } | { readonly ok: false; readonly code: string };

export type MapsToWorkerMessage =
  | ({
      readonly type: 'MAPS_PREPARE_RESULT';
      readonly protocolVersion: ProtocolVersion;
      readonly jobId: JobId;
    } & MapsOutcome)
  | ({
      readonly type: 'MAPS_SET_MAP_TITLE_RESULT';
      readonly protocolVersion: ProtocolVersion;
      readonly jobId: JobId;
    } & MapsOutcome)
  | ({
      readonly type: 'MAPS_OPEN_IMPORT_DIALOG_RESULT';
      readonly protocolVersion: ProtocolVersion;
      readonly jobId: JobId;
    } & MapsOutcome)
  | ({
      readonly type: 'MAPS_FEED_KML_RESULT';
      readonly protocolVersion: ProtocolVersion;
      readonly jobId: JobId;
    } & MapsOutcome)
  | ({
      readonly type: 'MAPS_IMPORT_RESULT';
      readonly protocolVersion: ProtocolVersion;
      readonly jobId: JobId;
    } & MapsOutcome)
  | {
      readonly type: 'MAPS_UI_CHANGED';
      readonly protocolVersion: ProtocolVersion;
      readonly jobId: JobId;
      readonly code: string;
    };

function isMapsOutcome(value: Record<string, unknown>): boolean {
  if (value.ok === true) return true;
  if (value.ok === false) return isNonEmptyString(value.code);
  return false;
}

export function isMapsToWorkerMessage(value: unknown): value is MapsToWorkerMessage {
  if (!isRecord(value) || !hasProtocolVersion1(value) || !isNonEmptyString(value.jobId)) {
    return false;
  }
  switch (value.type) {
    case 'MAPS_PREPARE_RESULT':
    case 'MAPS_SET_MAP_TITLE_RESULT':
    case 'MAPS_OPEN_IMPORT_DIALOG_RESULT':
    case 'MAPS_FEED_KML_RESULT':
    case 'MAPS_IMPORT_RESULT':
      return isMapsOutcome(value);
    case 'MAPS_UI_CHANGED':
      return isNonEmptyString(value.code);
    default:
      return false;
  }
}

export type UiStateSnapshot = {
  readonly uiStep: UiStep;
  readonly context: 'saved_list' | 'tabelog_other' | 'other';
  readonly jobId?: JobId;
  readonly progress?: ExtractProgress;
  readonly shopCount?: number;
  readonly collectionCount?: number;
  readonly mapName?: string;
  readonly error?: ExtensionErrorPayload;
};

export type WorkerToPopupMessage =
  | { readonly type: 'UI_STATE'; readonly protocolVersion: ProtocolVersion; readonly snapshot: UiStateSnapshot }
  | {
      readonly type: 'EXTRACT_PROGRESS';
      readonly protocolVersion: ProtocolVersion;
      readonly jobId: JobId;
      readonly progress: ExtractProgress;
    }
  | {
      readonly type: 'EXTRACT_SUCCEEDED';
      readonly protocolVersion: ProtocolVersion;
      readonly jobId: JobId;
      readonly shopCount: number;
      readonly collectionCount: number;
    }
  | ({ readonly type: 'EXTRACT_FAILED'; readonly protocolVersion: ProtocolVersion } & ExtensionErrorPayload)
  | { readonly type: 'EXTRACT_CANCELLED'; readonly protocolVersion: ProtocolVersion; readonly jobId: JobId }
  | ({ readonly type: 'IMPORT_PRELUDE_FAILED'; readonly protocolVersion: ProtocolVersion } & ExtensionErrorPayload)
  | { readonly type: 'IMPORT_PRELUDE_STARTED'; readonly protocolVersion: ProtocolVersion; readonly jobId: JobId }
  | { readonly type: 'IMPORT_SUCCEEDED'; readonly protocolVersion: ProtocolVersion; readonly jobId: JobId }
  | ({ readonly type: 'IMPORT_FAILED'; readonly protocolVersion: ProtocolVersion } & ExtensionErrorPayload);

const WORKER_TO_POPUP_TYPES = new Set([
  'UI_STATE',
  'EXTRACT_PROGRESS',
  'EXTRACT_SUCCEEDED',
  'EXTRACT_FAILED',
  'EXTRACT_CANCELLED',
  'IMPORT_PRELUDE_FAILED',
  'IMPORT_PRELUDE_STARTED',
  'IMPORT_SUCCEEDED',
  'IMPORT_FAILED',
]);

export function isWorkerToPopupMessage(value: unknown): value is WorkerToPopupMessage {
  if (!isRecord(value) || !hasProtocolVersion1(value)) {
    return false;
  }
  return typeof value.type === 'string' && WORKER_TO_POPUP_TYPES.has(value.type);
}
