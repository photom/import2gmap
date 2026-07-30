import { describe, expect, it } from 'vitest';
import { deriveUiStep, reduceUiStep } from '../../src/application/ui-state-reducer';

describe('deriveUiStep', () => {
  it('returns ready when the active tab is a valid saved list and no extract result exists', () => {
    const step = deriveUiStep({
      hasActiveTab: true,
      isValidSavedListTab: true,
      hasExtractResult: false,
    });

    expect(step).toBe('ready');
  });

  it('returns wrong_tabelog_page when the active tab exists but is not a saved list', () => {
    const step = deriveUiStep({
      hasActiveTab: true,
      isValidSavedListTab: false,
      hasExtractResult: false,
    });

    expect(step).toBe('wrong_tabelog_page');
  });

  it('returns wrong_tab when there is no usable active tab', () => {
    const step = deriveUiStep({
      hasActiveTab: false,
      isValidSavedListTab: false,
      hasExtractResult: false,
    });

    expect(step).toBe('wrong_tab');
  });

  it('preserves access to confirm when extractResult exists, even if the active tab is no longer a saved list', () => {
    const step = deriveUiStep({
      hasActiveTab: true,
      isValidSavedListTab: false,
      hasExtractResult: true,
    });

    expect(step).toBe('confirm');
  });
});

describe('reduceUiStep', () => {
  it('ready + EXTRACT_START -> extracting', () => {
    expect(reduceUiStep('ready', { type: 'EXTRACT_START' })).toBe('extracting');
  });

  it('extracting + EXTRACT_SUCCEEDED -> extract_complete', () => {
    expect(reduceUiStep('extracting', { type: 'EXTRACT_SUCCEEDED' })).toBe('extract_complete');
  });

  it('extract_complete + NEXT -> confirm', () => {
    expect(reduceUiStep('extract_complete', { type: 'NEXT' })).toBe('confirm');
  });

  it('confirm + BACK -> extract_complete', () => {
    expect(reduceUiStep('confirm', { type: 'BACK' })).toBe('extract_complete');
  });

  it('confirm + IMPORT_START -> import_starting', () => {
    expect(reduceUiStep('confirm', { type: 'IMPORT_START' })).toBe('import_starting');
  });
});
