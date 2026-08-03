import type { CollectionRef } from './extracted-shop';

export type UiStep =
  | 'ready'
  | 'wrong_tab'
  | 'wrong_tabelog_page'
  | 'extracting'
  | 'extract_complete'
  | 'confirm'
  | 'import_starting'
  | 'import_succeeded'
  | 'error';

export type ActiveJob = {
  readonly jobId: string;
  readonly kind: 'extract' | 'import';
  readonly startedAt: number;
  readonly tabId?: number;
  readonly progress?: {
    readonly shopsCollected: number;
    readonly currentPage?: number;
    readonly totalPages?: number;
    readonly totalShopsDeclared?: number;
  };
  readonly cancelRequested?: boolean;
};

export type StoredShop = {
  readonly name: string;
  readonly url: string;
  readonly address: string;
  readonly description: string;
  readonly collections: readonly CollectionRef[];
};

export type StoredExtractResult = {
  readonly jobId: string;
  readonly completedAt: number;
  readonly shops: readonly StoredShop[];
  readonly collectionsCatalog: readonly CollectionRef[];
  readonly shopCount: number;
  readonly collectionCount: number;
  readonly sourceTabUrl?: string;
};

export type StoredError = {
  readonly code: string;
  readonly message: string;
  readonly retryStep: 'extract' | 'import' | 'none';
  readonly jobId?: string;
  readonly at: number;
};

// Recorded by the popup right before it calls `browser.permissions.request(...)`, because
// Chrome's native permission dialog takes focus and destroys the popup's execution context —
// the popup cannot rely on its own in-memory state (or even resuming its own `await`) surviving
// the prompt. The service worker resumes the recorded step from `permissions.onAdded` once the
// grant lands. See message-router's `routePermissionGranted` and extension-ui-specifications §7.
export type PendingPermission = {
  readonly step: 'extract' | 'import';
  readonly mapName?: string; // only meaningful for step 'import'
  readonly requestedAt: number; // epoch ms; see isPendingPermissionFresh for the TTL check
};

export type SessionRoot = {
  readonly schemaVersion: 1;
  readonly uiStep: UiStep;
  readonly mapName: string;
  readonly activeJob?: ActiveJob;
  readonly extractResult?: StoredExtractResult;
  readonly lastError?: StoredError;
  readonly pendingPermission?: PendingPermission;
};
