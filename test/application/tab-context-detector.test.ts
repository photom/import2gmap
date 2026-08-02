import { describe, expect, it } from 'vitest';
import { detectTabContext } from '../../src/application/tab-context-detector';

describe('detectTabContext', () => {
  it('returns ready for a Tabelog PC saved-list URL', () => {
    expect(
      detectTabContext('https://tabelog.com/rvwr/012345/hozon_restaurants/list'),
    ).toBe('ready');
  });

  it('returns ready for www host with trailing slash', () => {
    expect(
      detectTabContext('https://www.tabelog.com/rvwr/012345/hozon_restaurants/list/'),
    ).toBe('ready');
  });

  it('returns ready when the saved-list URL has a query string', () => {
    expect(
      detectTabContext('https://tabelog.com/rvwr/012345/hozon_restaurants/list?PG=2'),
    ).toBe('ready');
  });

  it('returns wrong_tabelog_page for a Tabelog URL outside the saved-list path', () => {
    expect(detectTabContext('https://tabelog.com/rvwr/012345/')).toBe('wrong_tabelog_page');
  });

  it('returns wrong_tab for a non-Tabelog host', () => {
    expect(detectTabContext('https://example.com/')).toBe('wrong_tab');
  });

  it('returns wrong_tab when there is no active tab URL', () => {
    expect(detectTabContext(undefined)).toBe('wrong_tab');
  });
});
