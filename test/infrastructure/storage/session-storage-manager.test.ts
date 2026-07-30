import { beforeEach, describe, expect, it } from 'vitest';
import { storage } from 'wxt/utils/storage';
import { SessionStorageManager } from '../../../src/infrastructure/storage/session-storage-manager';
import { ExtractionError } from '../../../src/domain/errors/extraction-error';
import type { StoredExtractResult } from '../../../src/domain/models/session';

const SESSION_KEY = 'session:import2gmap';

const extractResult: StoredExtractResult = {
  jobId: 'job-1',
  completedAt: 1_700_000_000_000,
  shops: [
    {
      name: 'テスト店舗1',
      url: 'https://tabelog.com/tokyo/A1301/A130101/10000001/',
      address: '東京都中央区銀座1-2-3',
      description: 'https://tabelog.com/tokyo/A1301/A130101/10000001/',
      collections: [],
    },
  ],
  collectionsCatalog: [],
  shopCount: 1,
  collectionCount: 0,
};

describe('SessionStorageManager', () => {
  beforeEach(async () => {
    await storage.removeItem(SESSION_KEY);
  });

  it('writes StoredExtractResult to chrome.storage.session with schemaVersion 1', async () => {
    const manager = new SessionStorageManager();

    await manager.writeExtractResult(extractResult);

    const raw = await storage.getItem<Record<string, unknown>>(SESSION_KEY);
    expect(raw?.schemaVersion).toBe(1);
    expect(raw?.uiStep).toBe('extract_complete');
    expect(raw?.extractResult).toEqual(extractResult);
  });

  it('throws SessionCorrupt when the stored payload is invalid on read', async () => {
    await storage.setItem(SESSION_KEY, { schemaVersion: 2 });
    const manager = new SessionStorageManager();

    const error: unknown = await manager.read().catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ExtractionError);
    expect((error as ExtractionError).code).toBe('SessionCorrupt');
  });

  it('clears activeJob and extractResult on discard', async () => {
    await storage.setItem(SESSION_KEY, {
      schemaVersion: 1,
      uiStep: 'confirm',
      mapName: 'マイマップ',
      activeJob: { jobId: 'job-1', kind: 'extract', startedAt: 0 },
      extractResult,
    });
    const manager = new SessionStorageManager();

    await manager.discard();

    const raw = await storage.getItem<Record<string, unknown>>(SESSION_KEY);
    expect(raw?.uiStep).toBe('ready');
    expect(raw?.activeJob).toBeUndefined();
    expect(raw?.extractResult).toBeUndefined();
  });
});
