import { storage } from 'wxt/utils/storage';
import { validateSessionRoot } from '../../domain/session/session-guard';
import type { SessionRoot, StoredExtractResult } from '../../domain/models/session';

const SESSION_KEY = 'session:import2gmap' as const;

export class SessionStorageManager {
  async read(): Promise<SessionRoot> {
    const raw = await storage.getItem(SESSION_KEY);
    if (raw === null) {
      return { schemaVersion: 1, uiStep: 'ready' };
    }
    return validateSessionRoot(raw);
  }

  async writeExtractResult(result: StoredExtractResult): Promise<void> {
    const current = await this.read();
    const next: SessionRoot = {
      ...current,
      schemaVersion: 1,
      uiStep: 'extract_complete',
      activeJob: undefined,
      extractResult: result,
      lastError: undefined,
    };
    await storage.setItem(SESSION_KEY, next);
  }

  async patch(partial: Partial<SessionRoot>): Promise<void> {
    const current = await this.read();
    const next: SessionRoot = { ...current, ...partial };
    await storage.setItem(SESSION_KEY, next);
  }

  async discard(): Promise<void> {
    const next: SessionRoot = { schemaVersion: 1, uiStep: 'ready' };
    await storage.setItem(SESSION_KEY, next);
  }
}
