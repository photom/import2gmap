import { describe, expect, it } from 'vitest';
import {
  detectMapsFrameRole,
  hasCreatedNewMap,
  hasImportSucceeded,
  hasMapTitleApplied,
  hasPickerFrameContent,
  isLoggedOutRedirect,
  isPickerFrameReady,
  isPickerSpinnerActive,
  isPickerUploadNavLabel,
  isPickerUploadNavSelected,
  pickerActivationKeyEventInit,
} from '../../../src/domain/my-maps/my-maps-detectors';

describe('isLoggedOutRedirect', () => {
  it('returns true for accounts.google.com', () => {
    expect(isLoggedOutRedirect('accounts.google.com')).toBe(true);
  });

  it('returns false for www.google.com', () => {
    expect(isLoggedOutRedirect('www.google.com')).toBe(false);
  });
});

describe('hasCreatedNewMap', () => {
  it('returns true when the URL has a mid= param under /maps/d/', () => {
    expect(
      hasCreatedNewMap('https://www.google.com/maps/d/u/0/edit?mid=abc123&ll=0,0&z=5'),
    ).toBe(true);
  });

  it('returns false for the My Maps home URL without mid=', () => {
    expect(hasCreatedNewMap('https://www.google.com/maps/d/u/0/')).toBe(false);
  });
});

describe('hasImportSucceeded', () => {
  const DEFAULT_TITLE = '無題のレイヤ';

  it('returns false when the title still equals the default', () => {
    expect(hasImportSucceeded(DEFAULT_TITLE, DEFAULT_TITLE)).toBe(false);
  });

  it('returns true when the title changed to a non-empty value', () => {
    expect(hasImportSucceeded('example.kml', DEFAULT_TITLE)).toBe(true);
  });

  it('returns false when the title is empty or whitespace only', () => {
    expect(hasImportSucceeded('', DEFAULT_TITLE)).toBe(false);
    expect(hasImportSucceeded('   ', DEFAULT_TITLE)).toBe(false);
  });
});

describe('detectMapsFrameRole', () => {
  it('returns "picker" for the docs.google.com KML upload picker iframe', () => {
    expect(detectMapsFrameRole('docs.google.com')).toBe('picker');
  });

  it('returns "mymaps" for the top-level www.google.com My Maps frame', () => {
    expect(detectMapsFrameRole('www.google.com')).toBe('mymaps');
  });

  it('returns "mymaps" for any other hostname (defensive default, not a picker)', () => {
    expect(detectMapsFrameRole('accounts.google.com')).toBe('mymaps');
  });
});

describe('hasMapTitleApplied', () => {
  it('returns true when the title bar text matches the requested map name exactly', () => {
    expect(hasMapTitleApplied('食べログ保存リスト 2026-08-02', '食べログ保存リスト 2026-08-02')).toBe(true);
  });

  it('returns true when the title bar text matches after trimming incidental whitespace', () => {
    expect(hasMapTitleApplied('  食べログ保存リスト 2026-08-02  ', '食べログ保存リスト 2026-08-02')).toBe(true);
  });

  it('returns false when the title bar still shows the pre-rename default', () => {
    expect(hasMapTitleApplied('無題の地図', '食べログ保存リスト 2026-08-02')).toBe(false);
  });

  it('returns false when the title bar text is empty (dialog/save still in flight)', () => {
    expect(hasMapTitleApplied('', '食べログ保存リスト 2026-08-02')).toBe(false);
  });
});

describe('isPickerUploadNavLabel', () => {
  it('returns true for the Japanese upload nav option label', () => {
    expect(isPickerUploadNavLabel('アップロード')).toBe(true);
  });

  it('returns true after trimming incidental surrounding whitespace', () => {
    expect(isPickerUploadNavLabel('  アップロード  ')).toBe(true);
  });

  it('returns true for the English "Upload" label (Google mixes English into the JA UI, same as DRIVE_CONSENT_TEXT)', () => {
    expect(isPickerUploadNavLabel('Upload')).toBe(true);
  });

  it('returns false for other source nav options', () => {
    expect(isPickerUploadNavLabel('Google ドライブ')).toBe(false);
    expect(isPickerUploadNavLabel('アルバム')).toBe(false);
  });

  it('returns false for an empty string', () => {
    expect(isPickerUploadNavLabel('')).toBe(false);
  });

  it('returns false for text that merely contains the label as a substring (exact trimmed match only)', () => {
    expect(isPickerUploadNavLabel('アップロード履歴')).toBe(false);
  });
});

describe('isPickerUploadNavSelected', () => {
  it('returns true when aria-selected is the string "true"', () => {
    expect(isPickerUploadNavSelected('true')).toBe(true);
  });

  it('returns false when aria-selected is the string "false"', () => {
    expect(isPickerUploadNavSelected('false')).toBe(false);
  });

  it('returns false when aria-selected is null (attribute absent / option not found)', () => {
    expect(isPickerUploadNavSelected(null)).toBe(false);
  });
});

describe('pickerActivationKeyEventInit', () => {
  it('returns a keydown init for Enter with a non-zero keyCode/which (a bare KeyboardEvent leaves keyCode at 0)', () => {
    expect(pickerActivationKeyEventInit('Enter')).toEqual({
      key: 'Enter',
      code: 'Enter',
      keyCode: 13,
      which: 13,
      bubbles: true,
      cancelable: true,
      composed: true,
    });
  });

  it('returns a keydown init for Space', () => {
    expect(pickerActivationKeyEventInit(' ')).toEqual({
      key: ' ',
      code: 'Space',
      keyCode: 32,
      which: 32,
      bubbles: true,
      cancelable: true,
      composed: true,
    });
  });
});

describe('hasPickerFrameContent', () => {
  it('returns true when the upload-nav option is present', () => {
    expect(hasPickerFrameContent(true, false)).toBe(true);
  });

  it('returns true when the strict KML file input is present', () => {
    expect(hasPickerFrameContent(false, true)).toBe(true);
  });

  it('returns false when neither is present yet (still-loading frame)', () => {
    expect(hasPickerFrameContent(false, false)).toBe(false);
  });
});

describe('isPickerFrameReady', () => {
  it('returns true for a picker-role result with content', () => {
    expect(isPickerFrameReady({ role: 'picker', hasPickerContent: true })).toBe(true);
  });

  it('returns false for a picker-role result that has not rendered content yet', () => {
    expect(isPickerFrameReady({ role: 'picker', hasPickerContent: false })).toBe(false);
  });

  it('returns false for a mymaps-role result', () => {
    expect(isPickerFrameReady({ role: 'mymaps', hasPickerContent: false })).toBe(false);
  });

  it('returns false for undefined (an injection error / skipped frame)', () => {
    expect(isPickerFrameReady(undefined)).toBe(false);
  });

  it('returns false for the old bare-string "picker" shape (hostname-only match is no longer accepted)', () => {
    expect(isPickerFrameReady('picker')).toBe(false);
  });
});

describe('isPickerSpinnerActive', () => {
  it('returns false when data-active is "false"', () => {
    expect(isPickerSpinnerActive('false', null)).toBe(false);
  });

  it('returns false when aria-hidden is "true"', () => {
    expect(isPickerSpinnerActive(null, 'true')).toBe(false);
  });

  it('returns true when neither finished-state marker is present (still loading)', () => {
    expect(isPickerSpinnerActive(null, null)).toBe(true);
  });
});
