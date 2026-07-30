import type { CollectionRef, ExtractedSavedList, ExtractedShop } from '../models/extracted-shop';

function mergeCollectionRefs(
  a: readonly CollectionRef[],
  b: readonly CollectionRef[],
): CollectionRef[] {
  const byId = new Map<string, CollectionRef>();
  for (const ref of [...a, ...b]) {
    if (!byId.has(ref.id)) {
      byId.set(ref.id, ref);
    }
  }
  return [...byId.values()];
}

export function mergeSavedLists(pages: readonly ExtractedSavedList[]): ExtractedSavedList {
  const shopsByUrl = new Map<string, ExtractedShop>();
  const orderedUrls: string[] = [];

  for (const page of pages) {
    for (const shop of page.shops) {
      const existing = shopsByUrl.get(shop.url);
      if (!existing) {
        shopsByUrl.set(shop.url, shop);
        orderedUrls.push(shop.url);
      } else {
        shopsByUrl.set(shop.url, {
          ...existing,
          collections: mergeCollectionRefs(existing.collections, shop.collections),
        });
      }
    }
  }

  const catalogById = new Map<string, CollectionRef>();
  for (const page of pages) {
    for (const entry of page.collectionsCatalog) {
      if (!catalogById.has(entry.id)) {
        catalogById.set(entry.id, entry);
      }
    }
  }

  return {
    shops: orderedUrls.map((url) => shopsByUrl.get(url)!),
    collectionsCatalog: [...catalogById.values()],
  };
}
