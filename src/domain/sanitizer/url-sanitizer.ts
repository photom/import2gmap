import { ExtractionError } from '../errors/extraction-error';

const ALLOWED_HOSTS = new Set(['tabelog.com', 'www.tabelog.com']);
const SHOP_PATH_PATTERN = /\/\d+\/?$/;

export function sanitizeShopUrl(raw: string): string {
  let candidate: URL;
  try {
    candidate = new URL(raw.trim());
  } catch {
    throw new ExtractionError('InvalidShopUrl');
  }

  if (candidate.protocol !== 'https:') {
    throw new ExtractionError('InvalidShopUrl');
  }
  if (!ALLOWED_HOSTS.has(candidate.hostname)) {
    throw new ExtractionError('InvalidShopUrl');
  }
  if (!SHOP_PATH_PATTERN.test(candidate.pathname)) {
    throw new ExtractionError('InvalidShopUrl');
  }

  candidate.hash = '';
  candidate.search = '';
  return candidate.toString();
}
