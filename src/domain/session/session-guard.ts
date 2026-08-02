import { ExtractionError } from '../errors/extraction-error';
import type { SessionRoot, StoredExtractResult, UiStep } from '../models/session';

const VALID_UI_STEPS: readonly UiStep[] = [
  'ready',
  'wrong_tab',
  'wrong_tabelog_page',
  'extracting',
  'extract_complete',
  'confirm',
  'import_starting',
  'import_succeeded',
  'error',
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isValidExtractResult(value: unknown): value is StoredExtractResult {
  if (!isRecord(value)) return false;
  const { shops, collectionsCatalog, shopCount, collectionCount } = value;
  if (!Array.isArray(shops) || !Array.isArray(collectionsCatalog)) return false;
  if (shopCount !== shops.length) return false;
  if (collectionCount !== collectionsCatalog.length) return false;
  return true;
}

export function validateSessionRoot(raw: unknown): SessionRoot {
  if (!isRecord(raw)) {
    throw new ExtractionError('SessionCorrupt');
  }
  if (raw.schemaVersion !== 1) {
    throw new ExtractionError('SessionCorrupt');
  }
  if (!VALID_UI_STEPS.includes(raw.uiStep as UiStep)) {
    throw new ExtractionError('SessionCorrupt');
  }
  if (typeof raw.mapName !== 'string') {
    throw new ExtractionError('SessionCorrupt');
  }
  if (raw.extractResult !== undefined && !isValidExtractResult(raw.extractResult)) {
    throw new ExtractionError('SessionCorrupt');
  }

  return raw as unknown as SessionRoot;
}
