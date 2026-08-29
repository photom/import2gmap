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
  | { readonly type: 'IMPORT_START'; readonly protocolVersion: ProtocolVersion }
  | { readonly type: 'IMPORT_CANCEL'; readonly protocolVersion: ProtocolVersion; readonly jobId: JobId }
  | { readonly type: 'ERROR_RETRY'; readonly protocolVersion: ProtocolVersion }
  // Sent right before `browser.permissions.request(...)`, and awaited, so the write has landed
  // in session storage before Chrome's permission dialog can close the popup and kill its JS
  // context. See message-router's `routePermissionGranted` / session model's `PendingPermission`.
  | {
      readonly type: 'PERMISSION_REQUEST_PENDING';
      readonly protocolVersion: ProtocolVersion;
      readonly step: 'extract' | 'import';
    }
  // Sent when `permissions.request()` resolves `false` (denial) and the popup survived to see it.
  | { readonly type: 'PERMISSION_REQUEST_CANCELLED'; readonly protocolVersion: ProtocolVersion };

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
    case 'IMPORT_START':
      return true;
    case 'PERMISSION_REQUEST_PENDING':
      return value.step === 'extract' || value.step === 'import';
    case 'PERMISSION_REQUEST_CANCELLED':
      return true;
    default:
      return false;
  }
}

export type WorkerToContentMessage =
  | { readonly type: 'TAB_EXTRACT_PAGE'; readonly protocolVersion: ProtocolVersion; readonly jobId: JobId }
  // Sent as a bounded prelude, before the first TAB_EXTRACT_PAGE, so the crawl always starts from
  // page 1 regardless of which page the user's tab was on — see entrypoints/background.ts's
  // `returnToFirstPage` and extension-messaging-protocol.md §5.
  | { readonly type: 'TAB_GO_TO_FIRST_PAGE'; readonly protocolVersion: ProtocolVersion; readonly jobId: JobId }
  | { readonly type: 'TAB_CLICK_NEXT'; readonly protocolVersion: ProtocolVersion; readonly jobId: JobId }
  | { readonly type: 'TAB_ABORT'; readonly protocolVersion: ProtocolVersion; readonly jobId: JobId };

export function isWorkerToContentMessage(value: unknown): value is WorkerToContentMessage {
  if (!isRecord(value) || !hasProtocolVersion1(value)) {
    return false;
  }
  if (!isNonEmptyString(value.jobId)) {
    return false;
  }
  return (
    value.type === 'TAB_EXTRACT_PAGE' ||
    value.type === 'TAB_GO_TO_FIRST_PAGE' ||
    value.type === 'TAB_CLICK_NEXT' ||
    value.type === 'TAB_ABORT'
  );
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
      readonly type: 'TAB_FIRST_PAGE_RESULT';
      readonly protocolVersion: ProtocolVersion;
      readonly jobId: JobId;
      readonly kind: 'already_first' | 'navigating';
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
    case 'TAB_FIRST_PAGE_RESULT':
      return value.kind === 'already_first' || value.kind === 'navigating';
    case 'TAB_NEXT_RESULT':
      return value.kind === 'navigating' || value.kind === 'no_next';
    case 'TAB_EXTRACT_FAILED':
      return isNonEmptyString(value.code);
    default:
      return false;
  }
}

// The Google Maps native saved-list flow (ADR-0008) never leaves the top frame or navigates to a
// new document — unlike the superseded My Maps flow, there is no cross-origin picker iframe and
// no map-creation navigation to survive, so a single request/reply message pair is enough. See
// entrypoints/gmaps.content.ts.
export type WorkerToGoogleMapsMessage = {
  readonly type: 'GMAPS_ENSURE_LIST';
  readonly protocolVersion: ProtocolVersion;
  readonly jobId: JobId;
  readonly listName: string;
};

export function isWorkerToGoogleMapsMessage(value: unknown): value is WorkerToGoogleMapsMessage {
  if (!isRecord(value) || !hasProtocolVersion1(value) || !isNonEmptyString(value.jobId)) {
    return false;
  }
  return value.type === 'GMAPS_ENSURE_LIST' && isNonEmptyString(value.listName);
}

export type GoogleMapsOutcome =
  | { readonly ok: true; readonly created: boolean }
  | { readonly ok: false; readonly code: string };

export type GoogleMapsToWorkerMessage = {
  readonly type: 'GMAPS_ENSURE_LIST_RESULT';
  readonly protocolVersion: ProtocolVersion;
  readonly jobId: JobId;
} & GoogleMapsOutcome;

function isGoogleMapsOutcome(value: Record<string, unknown>): boolean {
  if (value.ok === true) return typeof value.created === 'boolean';
  if (value.ok === false) return isNonEmptyString(value.code);
  return false;
}

export function isGoogleMapsToWorkerMessage(value: unknown): value is GoogleMapsToWorkerMessage {
  if (!isRecord(value) || !hasProtocolVersion1(value) || !isNonEmptyString(value.jobId)) {
    return false;
  }
  return value.type === 'GMAPS_ENSURE_LIST_RESULT' && isGoogleMapsOutcome(value);
}

export type UiStateSnapshot = {
  readonly uiStep: UiStep;
  readonly context: 'saved_list' | 'tabelog_other' | 'other';
  readonly jobId?: JobId;
  readonly progress?: ExtractProgress;
  readonly shopCount?: number;
  readonly collectionCount?: number;
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
