import { describe, expect, it } from 'vitest';
import {
  detectMapsFrameRole,
  hasCreatedNewMap,
  hasImportSucceeded,
  hasMapTitleApplied,
  isLoggedOutRedirect,
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
