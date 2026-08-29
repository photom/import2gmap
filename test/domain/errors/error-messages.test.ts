import { describe, expect, it } from 'vitest';
import { ERROR_MESSAGES } from '../../../src/domain/errors/error-messages';

describe('ERROR_MESSAGES', () => {
  it('has a Japanese message for IncompleteCrawl', () => {
    expect(ERROR_MESSAGES.IncompleteCrawl).toBe(
      '表示件数と抽出件数が一致しません。最後まで取得できませんでした。',
    );
  });

  it('has a catch-all InternalError message', () => {
    expect(ERROR_MESSAGES.InternalError).toBe('予期しないエラーが発生しました。');
  });

  it('has a message for GoogleMapsTabOpenFailed', () => {
    expect(ERROR_MESSAGES.GoogleMapsTabOpenFailed).toBe('Googleマップのタブを開けませんでした。');
  });

  it('has a message for ReturnToFirstPageFailed', () => {
    expect(ERROR_MESSAGES.ReturnToFirstPageFailed).toBe('保存リストの1ページ目に戻れませんでした。');
  });
});
