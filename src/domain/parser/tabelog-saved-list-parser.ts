import { ExtractionError } from '../errors/extraction-error';
import { MAX_LENGTHS, sanitizePlainText } from '../sanitizer/field-sanitizer';
import { sanitizeShopUrl } from '../sanitizer/url-sanitizer';
import { parseAddress } from './address-parser';
import type { ExtractedShop } from '../models/extracted-shop';

export class TabelogSavedListParser {
  extractShop(root: Element): ExtractedShop {
    const nameEl = root.querySelector('a.simple-rvw__rst-name-target');
    if (!nameEl) {
      throw new ExtractionError('SelectorDrift');
    }
    const name = sanitizePlainText(nameEl.textContent ?? '', MAX_LENGTHS.name);
    if (!name) {
      throw new ExtractionError('ItemNameMissing');
    }

    const url = this.extractUrl(root, nameEl);

    return {
      name,
      url,
      address: '',
      description: '',
      collections: [],
    };
  }

  private extractUrl(root: Element, nameEl: Element): string {
    const candidate =
      nameEl.getAttribute('href') ||
      root.querySelector('.simple-rvw.js-rst-clickable-area[data-detail-url]')?.getAttribute('data-detail-url') ||
      root.querySelector('a.simple-rvw__rst-img[href]')?.getAttribute('href');

    if (!candidate) {
      throw new ExtractionError('ItemUrlMissing');
    }

    return sanitizeShopUrl(candidate);
  }

  detectSavedListPage(document: Document): boolean {
    const hasListMain = document.querySelector('.js-rvwr-list-main') !== null;
    const hasSearchCondition = document.querySelector('.search-condition--hozon') !== null;
    const hasListView =
      document.querySelector('#js-bookmark-list-view[data-list-view="hozon"]') !== null;
    const titleMatches =
      document.querySelector('.search-condition__title')?.textContent?.trim() === '保存リスト';

    if (hasListMain && hasSearchCondition && (hasListView || titleMatches)) {
      return true;
    }

    throw new ExtractionError('NotSavedListPage');
  }
}
