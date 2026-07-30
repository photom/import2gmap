import { ExtractionError } from '../errors/extraction-error';
import {
  MAX_LENGTHS,
  sanitizeCollectionId,
  sanitizePlainText,
  truncate,
} from '../sanitizer/field-sanitizer';
import type { CollectionRef } from '../models/extracted-shop';

type RawCatalogEntry = { label_id?: unknown; title?: unknown };

export function parseCollectionCatalog(document: Document): CollectionRef[] {
  const el = document.querySelector('#js-collection[data-collection-attributes]');
  if (!el) {
    return [];
  }

  const raw = el.getAttribute('data-collection-attributes') ?? '';
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new ExtractionError('CollectionCatalogInvalid');
  }

  if (!Array.isArray(parsed)) {
    throw new ExtractionError('CollectionCatalogInvalid');
  }

  const catalog: CollectionRef[] = [];
  const seenIds = new Set<string>();
  for (const entry of parsed as RawCatalogEntry[]) {
    const id = sanitizeCollectionId(String(entry?.label_id ?? ''));
    const name = truncate(sanitizePlainText(String(entry?.title ?? '')), MAX_LENGTHS.collectionName);
    if (!id || !name || seenIds.has(id)) continue;
    seenIds.add(id);
    catalog.push({ id, name });
  }
  return catalog;
}
