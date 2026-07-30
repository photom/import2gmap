import type { UiStep } from '../domain/models/session';

export type UiContext = {
  readonly hasActiveTab: boolean;
  readonly isValidSavedListTab: boolean;
  readonly hasExtractResult: boolean;
};

export function deriveUiStep(context: UiContext): UiStep {
  if (context.hasExtractResult) {
    return 'confirm';
  }
  if (!context.hasActiveTab) {
    return 'wrong_tab';
  }
  if (!context.isValidSavedListTab) {
    return 'wrong_tabelog_page';
  }
  return 'ready';
}

export type UiEvent =
  | { type: 'EXTRACT_START' }
  | { type: 'EXTRACT_SUCCEEDED' }
  | { type: 'NEXT' }
  | { type: 'BACK' }
  | { type: 'IMPORT_START' };

const TRANSITIONS: Partial<Record<UiStep, Partial<Record<UiEvent['type'], UiStep>>>> = {
  ready: { EXTRACT_START: 'extracting' },
  extracting: { EXTRACT_SUCCEEDED: 'extract_complete' },
  extract_complete: { NEXT: 'confirm' },
  confirm: { BACK: 'extract_complete', IMPORT_START: 'import_starting' },
};

export function reduceUiStep(current: UiStep, event: UiEvent): UiStep {
  return TRANSITIONS[current]?.[event.type] ?? current;
}
