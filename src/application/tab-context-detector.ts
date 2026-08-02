export type TabContext = 'ready' | 'wrong_tabelog_page' | 'wrong_tab';

const SAVED_LIST_PATH = /^\/rvwr\/[^/]+\/hozon_restaurants\/list\/?$/;

export function detectTabContext(url: string | undefined): TabContext {
  if (url === undefined) {
    return 'wrong_tab';
  }
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return 'wrong_tab';
  }
  if (parsed.hostname !== 'tabelog.com' && parsed.hostname !== 'www.tabelog.com') {
    return 'wrong_tab';
  }
  if (!SAVED_LIST_PATH.test(parsed.pathname)) {
    return 'wrong_tabelog_page';
  }
  return 'ready';
}
