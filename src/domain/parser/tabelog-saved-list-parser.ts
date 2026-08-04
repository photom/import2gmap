import { ExtractionError } from '../errors/extraction-error';
import { MAX_LENGTHS, sanitizePlainText, truncate } from '../sanitizer/field-sanitizer';
import { sanitizeShopUrl } from '../sanitizer/url-sanitizer';
import { parseAddress } from './address-parser';
import { parseBookmarksData } from './bookmarks-data-parser';
import { parseCollectionCatalog } from './collection-catalog-parser';
import type { CollectionRef, ExtractedSavedList, ExtractedShop } from '../models/extracted-shop';

export class TabelogSavedListParser {
  extractPage(document: Document): ExtractedSavedList {
    this.detectSavedListPage(document);

    const bookmarksByRstId = parseBookmarksData(document);
    const catalog = parseCollectionCatalog(document);
    const catalogIds = new Set(catalog.map((entry) => entry.id));
    const orphanCollections: CollectionRef[] = [];

    const itemRoots = Array.from(document.querySelectorAll('div.js-bookmark'));
    if (itemRoots.length === 0) {
      throw new ExtractionError('EmptyList');
    }

    const shops = itemRoots.map((root) => {
      const rstId = root.getAttribute('data-rst-id') ?? '';
      const collections = bookmarksByRstId[rstId] ?? [];
      for (const collection of collections) {
        if (!catalogIds.has(collection.id)) {
          catalogIds.add(collection.id);
          orphanCollections.push(collection);
        }
      }
      return this.extractShop(root, collections);
    });

    return {
      shops,
      collectionsCatalog: [...catalog, ...orphanCollections],
    };
  }

  extractShop(root: Element, collections: readonly CollectionRef[] = []): ExtractedShop {
    const nameEl = root.querySelector('a.simple-rvw__rst-name-target');
    if (!nameEl) {
      throw new ExtractionError('SelectorDrift');
    }
    const fullName = sanitizePlainText(nameEl.textContent ?? '');
    if (!fullName) {
      throw new ExtractionError('ItemNameMissing');
    }
    const name = truncate(fullName, MAX_LENGTHS.name);

    const url = this.extractUrl(root, nameEl);

    const textareaEl = root.querySelector<HTMLTextAreaElement>(
      'textarea.rst-info-copy__item-txt.js-rst-info-copy__item-txt',
    );
    if (!textareaEl) {
      throw new ExtractionError('AddressMissing');
    }
    const address = parseAddress(textareaEl.value, fullName);

    const areaCategoryRaw = root.querySelector('p.simple-rvw__area-catg')?.textContent ?? '';
    const areaCategory = truncate(sanitizePlainText(areaCategoryRaw), MAX_LENGTHS.areaCategory);
    const description = areaCategory ? `${url}\n${areaCategory}` : url;

    return {
      name,
      url,
      address,
      description,
      collections,
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

  parsePageCount(document: Document): { from: number; to: number; total: number } | undefined {
    const nums = Array.from(document.querySelectorAll('.c-page-count .c-page-count__num strong')).map(
      (el) => Number.parseInt(el.textContent ?? '', 10),
    );
    if (nums.length !== 3 || nums.some((n) => Number.isNaN(n))) {
      return undefined;
    }
    return { from: nums[0]!, to: nums[1]!, total: nums[2]! };
  }

  hasNextPage(document: Document): boolean {
    return document.querySelector('a.c-pagination__arrow.c-pagination__arrow--next[rel="next"]') !== null;
  }

  // "Am I on page 1?" — `from > 1` from the count chrome is the primary, clean semantic signal
  // (see the PG=3 field evidence: `from: 41` unambiguously means "not page 1"). When that chrome
  // is absent, fall back to corroborating pagination signals rather than guessing; if none of
  // those are present either, default to `false` (assume page 1) — that matches the crawl's
  // pre-existing behavior, so an ambiguous page never becomes a *new* failure mode.
  isBeyondFirstPage(document: Document): boolean {
    const pageCount = this.parsePageCount(document);
    if (pageCount) {
      return pageCount.from > 1;
    }
    if (this.findPrevPageLink(document) !== undefined) {
      return true;
    }
    const currentPageText = document.querySelector('strong.c-pagination__num.is-current')?.textContent?.trim();
    return currentPageText !== undefined && currentPageText !== '1';
  }

  // The numbered "1" link the user pointed at directly. Matched by trimmed text, never a
  // positional/index assumption — on long lists Tabelog windows the numbered links (e.g.
  // `… 20 21 22 …`), so this can legitimately return `undefined`; callers fall back to
  // `findPrevPageLink`.
  findFirstPageLink(document: Document): HTMLAnchorElement | undefined {
    return Array.from(document.querySelectorAll<HTMLAnchorElement>('a.c-pagination__num')).find(
      (link) => link.textContent?.trim() === '1',
    );
  }

  findPrevPageLink(document: Document): HTMLAnchorElement | undefined {
    return (
      document.querySelector<HTMLAnchorElement>('a.c-pagination__arrow.c-pagination__arrow--prev') ?? undefined
    );
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
