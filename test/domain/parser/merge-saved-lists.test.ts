import { describe, expect, it } from 'vitest';
import { mergeSavedLists } from '../../../src/domain/parser/merge-saved-lists';
import type { ExtractedSavedList } from '../../../src/domain/models/extracted-shop';

const shopA1 = {
  name: 'テスト店舗1',
  url: 'https://tabelog.com/tokyo/A1301/A130101/10000001/',
  address: '東京都中央区銀座1-2-3',
  description: 'https://tabelog.com/tokyo/A1301/A130101/10000001/',
  collections: [{ id: '101', name: '行きたいお店' }],
};

// Same shop re-encountered on page 2: different text fields (should be ignored)
// but an additional collection membership (should be merged in).
const shopA2 = {
  ...shopA1,
  name: 'テスト店舗1（重複)',
  collections: [{ id: '102', name: 'お気に入り' }],
};

const shopB = {
  name: 'テスト店舗2',
  url: 'https://tabelog.com/tokyo/A1302/A130201/10000002/',
  address: '東京都千代田区丸の内1-1-1',
  description: 'https://tabelog.com/tokyo/A1302/A130201/10000002/',
  collections: [],
};

describe('mergeSavedLists', () => {
  it('dedupes shops by normalized URL, merges collections by id, and keeps the first-seen text fields', () => {
    const page1: ExtractedSavedList = {
      shops: [shopA1],
      collectionsCatalog: [{ id: '101', name: '行きたいお店' }],
    };
    const page2: ExtractedSavedList = {
      shops: [shopA2, shopB],
      collectionsCatalog: [{ id: '102', name: 'お気に入り' }],
    };

    const merged = mergeSavedLists([page1, page2]);

    expect(merged.shops).toEqual([
      {
        ...shopA1,
        collections: [
          { id: '101', name: '行きたいお店' },
          { id: '102', name: 'お気に入り' },
        ],
      },
      shopB,
    ]);
    expect(merged.collectionsCatalog).toEqual([
      { id: '101', name: '行きたいお店' },
      { id: '102', name: 'お気に入り' },
    ]);
  });
});
