import { ExtractionError } from '../errors/extraction-error';
import {
  MAX_LENGTHS,
  sanitizeCollectionId,
  sanitizePlainText,
  truncate,
} from '../sanitizer/field-sanitizer';
import type { CollectionRef } from '../models/extracted-shop';

type RawLabel = { id?: unknown; title?: unknown };
type RawBookmarksEntry = { labels?: RawLabel[] };

function toCollectionRefs(labels: RawLabel[]): CollectionRef[] {
  const refs: CollectionRef[] = [];
  const seenIds = new Set<string>();
  for (const label of labels) {
    const id = sanitizeCollectionId(String(label?.id ?? ''));
    const name = truncate(sanitizePlainText(String(label?.title ?? '')), MAX_LENGTHS.collectionName);
    if (!id || !name || seenIds.has(id)) continue;
    seenIds.add(id);
    refs.push({ id, name });
  }
  return refs;
}

export function parseBookmarksData(document: Document): Record<string, CollectionRef[]> {
  const el = document.querySelector('#js-bookmarks-data[data-bookmarks]');
  if (!el) {
    return {};
  }

  const raw = el.getAttribute('data-bookmarks') ?? '';
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new ExtractionError('BookmarksDataInvalid');
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new ExtractionError('BookmarksDataInvalid');
  }

  const result: Record<string, CollectionRef[]> = {};
  for (const [rstId, entry] of Object.entries(parsed as Record<string, RawBookmarksEntry>)) {
    const labels = Array.isArray(entry?.labels) ? entry.labels : [];
    result[rstId] = toCollectionRefs(labels);
  }
  return result;
}
