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

// Fire-and-forget: sent immediately as each step happens, not batched until the final reply — see
// entrypoints/gmaps.content.ts's `logStep`. Added 2026-08-30 after a field report where the final
// GMAPS_ENSURE_LIST_RESULT reply never reached the worker at all (broken message channel, or the
// content script's execution context torn down before it could reply), so the batched
// `diagnostics` field on that reply — the only place step-by-step progress existed before this —
// was never seen either, even though the individual steps had actually happened. Streaming each
// line live means the service-worker console shows real progress even when the final reply never
// arrives.
export type GoogleMapsDiagnosticMessage = {
  readonly type: 'GMAPS_DIAGNOSTIC';
  readonly protocolVersion: ProtocolVersion;
  readonly jobId: JobId;
  readonly line: string;
};

export function isGoogleMapsDiagnosticMessage(value: unknown): value is GoogleMapsDiagnosticMessage {
  if (!isRecord(value) || !hasProtocolVersion1(value) || !isNonEmptyString(value.jobId)) {
    return false;
  }
  return value.type === 'GMAPS_DIAGNOSTIC' && isNonEmptyString(value.line);
}

export type GoogleMapsOutcome =
  | { readonly ok: true; readonly created: boolean }
  | { readonly ok: false; readonly code: string };

export type GoogleMapsToWorkerMessage = {
  readonly type: 'GMAPS_ENSURE_LIST_RESULT';
  readonly protocolVersion: ProtocolVersion;
  readonly jobId: JobId;
  // Content-script step trace, forwarded so entrypoints/background.ts can re-log it to the
  // service-worker console — see docs/reference/extension-error-codes.md §1's "Logging" rule:
  // step names, jobId, booleans, role/jsaction strings only, never page HTML.
  readonly diagnostics?: readonly string[];
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

// ADR-0008 step 2 (per-shop search + add) — see entrypoints/gmaps.content.ts's `handleAddShop`.
// `listName` is passed on every message (not just once) so the content script can always verify
// it's still on the right list's detail pane before acting, rather than trusting leftover state
// from a previous message.
export type WorkerToGoogleMapsAddShopMessage = {
  readonly type: 'GMAPS_ADD_SHOP';
  readonly protocolVersion: ProtocolVersion;
  readonly jobId: JobId;
  readonly listName: string;
  readonly shopName: string;
  readonly shopAddress: string;
};

export function isWorkerToGoogleMapsAddShopMessage(value: unknown): value is WorkerToGoogleMapsAddShopMessage {
  if (!isRecord(value) || !hasProtocolVersion1(value) || !isNonEmptyString(value.jobId)) {
    return false;
  }
  return (
    value.type === 'GMAPS_ADD_SHOP' &&
    isNonEmptyString(value.listName) &&
    isNonEmptyString(value.shopName) &&
    isNonEmptyString(value.shopAddress)
  );
}

// `status: 'already_present'` (dedupe skip, per ADR-0008) is distinct from `'added'` so the worker
// can report accurate added/skipped counts without needing a separate outcome shape.
export type GoogleMapsAddShopOutcome =
  | { readonly ok: true; readonly status: 'added' | 'already_present' }
  | { readonly ok: false; readonly code: string };

export type GoogleMapsAddShopResultMessage = {
  readonly type: 'GMAPS_ADD_SHOP_RESULT';
  readonly protocolVersion: ProtocolVersion;
  readonly jobId: JobId;
  readonly diagnostics?: readonly string[];
} & GoogleMapsAddShopOutcome;

function isGoogleMapsAddShopOutcome(value: Record<string, unknown>): boolean {
  if (value.ok === true) return value.status === 'added' || value.status === 'already_present';
  if (value.ok === false) return isNonEmptyString(value.code);
  return false;
}

export function isGoogleMapsAddShopResultMessage(value: unknown): value is GoogleMapsAddShopResultMessage {
  if (!isRecord(value) || !hasProtocolVersion1(value) || !isNonEmptyString(value.jobId)) {
    return false;
  }
  return value.type === 'GMAPS_ADD_SHOP_RESULT' && isGoogleMapsAddShopOutcome(value);
}

export type UiStateSnapshot = {
  readonly uiStep: UiStep;
  readonly context: 'saved_list' | 'tabelog_other' | 'other';
  readonly jobId?: JobId;
  readonly progress?: ExtractProgress;
  readonly shopCount?: number;
  readonly collectionCount?: number;
  // ADR-0008 step 2 final tally, present once uiStep is 'import_succeeded'.
  readonly addedCount?: number;
  readonly skippedCount?: number;
  readonly failedCount?: number;
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
  // ADR-0008 step 2 (per-shop search + add) progress — counts only, never shop names/addresses.
  | {
      readonly type: 'IMPORT_SHOPS_PROGRESS';
      readonly protocolVersion: ProtocolVersion;
      readonly jobId: JobId;
      readonly processed: number;
      readonly total: number;
    }
  | {
      readonly type: 'IMPORT_SUCCEEDED';
      readonly protocolVersion: ProtocolVersion;
      readonly jobId: JobId;
      readonly addedCount?: number;
      readonly skippedCount?: number;
      readonly failedCount?: number;
    }
  | ({ readonly type: 'IMPORT_FAILED'; readonly protocolVersion: ProtocolVersion } & ExtensionErrorPayload);

const WORKER_TO_POPUP_TYPES = new Set([
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
]);

export function isWorkerToPopupMessage(value: unknown): value is WorkerToPopupMessage {
  if (!isRecord(value) || !hasProtocolVersion1(value)) {
    return false;
  }
  return typeof value.type === 'string' && WORKER_TO_POPUP_TYPES.has(value.type);
}
