import { describe, expect, it } from 'vitest';
import { isPendingPermissionFresh } from '../../../src/domain/session/pending-permission';

describe('isPendingPermissionFresh', () => {
  it('is fresh when now is before the TTL boundary', () => {
    expect(isPendingPermissionFresh(1_000, 1_000 + 60_000, 300_000)).toBe(true);
  });

  it('is fresh exactly at the TTL boundary (inclusive)', () => {
    expect(isPendingPermissionFresh(1_000, 1_000 + 300_000, 300_000)).toBe(true);
  });

  it('is expired just past the TTL boundary', () => {
    expect(isPendingPermissionFresh(1_000, 1_000 + 300_001, 300_000)).toBe(false);
  });

  it('is expired well past the TTL', () => {
    expect(isPendingPermissionFresh(1_000, 10_000_000, 300_000)).toBe(false);
  });
});
