import type { CollectionRef } from './extracted-shop';

export type UiStep =
  | 'ready'
  | 'wrong_tab'
  | 'wrong_tabelog_page'
  | 'extracting'
  | 'extract_complete'
  | 'confirm'
  | 'import_starting'
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

export type SessionRoot = {
  readonly schemaVersion: 1;
  readonly uiStep: UiStep;
  readonly mapName: string;
  readonly activeJob?: ActiveJob;
  readonly extractResult?: StoredExtractResult;
  readonly lastError?: StoredError;
};
