import { describe, expect, it } from 'vitest';
import { validateSessionRoot } from '../../../src/domain/session/session-guard';
import { ExtractionError } from '../../../src/domain/errors/extraction-error';
import { captureError } from '../../helpers/capture-error';

const validRoot = {
  schemaVersion: 1,
  uiStep: 'ready',
  mapName: '食べログ保存リスト 2026-07-31',
};

describe('validateSessionRoot', () => {
  it('returns the parsed SessionRoot when the payload is valid', () => {
    expect(validateSessionRoot(validRoot)).toEqual(validRoot);
  });

  it('throws SessionCorrupt when schemaVersion is missing or wrong', () => {
    const error = captureError(() => validateSessionRoot({ ...validRoot, schemaVersion: 2 }));

    expect(error).toBeInstanceOf(ExtractionError);
    expect((error as ExtractionError).code).toBe('SessionCorrupt');
  });

  it('throws SessionCorrupt when uiStep is not a known step', () => {
    const error = captureError(() => validateSessionRoot({ ...validRoot, uiStep: 'not_a_step' }));

    expect(error).toBeInstanceOf(ExtractionError);
    expect((error as ExtractionError).code).toBe('SessionCorrupt');
  });

  it('throws SessionCorrupt when extractResult.shopCount does not match shops.length', () => {
    const error = captureError(() =>
      validateSessionRoot({
        ...validRoot,
        extractResult: {
          jobId: 'job-1',
          completedAt: 0,
          shops: [],
          collectionsCatalog: [],
          shopCount: 1,
          collectionCount: 0,
        },
      }),
    );

    expect(error).toBeInstanceOf(ExtractionError);
    expect((error as ExtractionError).code).toBe('SessionCorrupt');
  });

  it('throws SessionCorrupt for a non-object payload', () => {
    const error = captureError(() => validateSessionRoot(null));

    expect(error).toBeInstanceOf(ExtractionError);
    expect((error as ExtractionError).code).toBe('SessionCorrupt');
  });
});
