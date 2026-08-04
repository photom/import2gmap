import type { ExtensionErrorPayload, ExtractProgress, UiStateSnapshot } from '../domain/messaging/message-types';

export type ScreenViewModel =
  | { readonly screen: 'ready'; readonly extractEnabled: true }
  | { readonly screen: 'wrong_context'; readonly extractEnabled: false; readonly code: 'wrong_tab' | 'wrong_tabelog_page' }
  | { readonly screen: 'extracting'; readonly progress?: ExtractProgress }
  | { readonly screen: 'extract_complete'; readonly shopCount?: number; readonly collectionCount?: number }
  | { readonly screen: 'confirm'; readonly shopCount?: number; readonly collectionCount?: number; readonly mapName?: string }
  | { readonly screen: 'import_starting' }
  | { readonly screen: 'import_succeeded'; readonly shopCount?: number; readonly mapName?: string }
  | {
      readonly screen: 'error';
      readonly code: string;
      readonly message: string;
      readonly canRetry: boolean;
      // Carried so the popup can show the "go back to the Tabelog saved list" guidance only for
      // an extraction failure, never for an import-step failure — see extension-ui-specifications.md §3.7.
      readonly retryStep: ExtensionErrorPayload['retryStep'];
    };

export function buildScreenViewModel(snapshot: UiStateSnapshot): ScreenViewModel {
  switch (snapshot.uiStep) {
    case 'ready':
      return { screen: 'ready', extractEnabled: true };
    case 'wrong_tab':
    case 'wrong_tabelog_page':
      return { screen: 'wrong_context', extractEnabled: false, code: snapshot.uiStep };
    case 'extracting':
      return { screen: 'extracting', ...(snapshot.progress ? { progress: snapshot.progress } : {}) };
    case 'extract_complete':
      return {
        screen: 'extract_complete',
        shopCount: snapshot.shopCount,
        collectionCount: snapshot.collectionCount,
      };
    case 'confirm':
      return {
        screen: 'confirm',
        shopCount: snapshot.shopCount,
        collectionCount: snapshot.collectionCount,
        mapName: snapshot.mapName,
      };
    case 'import_starting':
      return { screen: 'import_starting' };
    case 'import_succeeded':
      return { screen: 'import_succeeded', shopCount: snapshot.shopCount, mapName: snapshot.mapName };
    case 'error':
      return {
        screen: 'error',
        code: snapshot.error?.code ?? 'InternalError',
        message: snapshot.error?.message ?? '予期しないエラーが発生しました。',
        canRetry: snapshot.error?.retryStep !== 'none',
        retryStep: snapshot.error?.retryStep ?? 'none',
      };
  }
}
