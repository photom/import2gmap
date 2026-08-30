import { describe, expect, it } from 'vitest';
import {
  isBackButton,
  isDoneButton,
  isListMetaLine,
  isMenuButton,
  isNewListButton,
  isSavedTrigger,
  isUntitledListPlaceholder,
} from '../../../src/domain/google-maps/google-maps-detectors';

function parseElement(html: string): Element {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const el = doc.body.firstElementChild;
  if (!el) throw new Error('fixture html produced no element');
  return el;
}

describe('isMenuButton', () => {
  it('matches via the compact-layout jsaction handler regardless of label text', () => {
    const el = parseElement('<button jsaction="settings.open" aria-label="something else"></button>');
    expect(isMenuButton(el)).toBe(true);
  });

  it('matches via the wide "navigation rail" layout jsaction handler', () => {
    const el = parseElement('<button jsaction="navigationrail.more" aria-label="Menu"></button>');
    expect(isMenuButton(el)).toBe(true);
  });

  it('matches the English aria-label as a fallback', () => {
    const el = parseElement('<button aria-label="Menu"></button>');
    expect(isMenuButton(el)).toBe(true);
  });

  it('matches the Japanese aria-label as a fallback', () => {
    const el = parseElement('<button aria-label="メニュー"></button>');
    expect(isMenuButton(el)).toBe(true);
  });

  it('rejects an unrelated button', () => {
    const el = parseElement('<button aria-label="Zoom in"></button>');
    expect(isMenuButton(el)).toBe(false);
  });
});

describe('isSavedTrigger', () => {
  it('matches via the compact-layout (menu item) jsaction handler', () => {
    const el = parseElement('<button jsaction="settings.yourplaces"><label>anything</label></button>');
    expect(isSavedTrigger(el)).toBe(true);
  });

  it('matches via the wide "navigation rail" layout jsaction handler, directly visible without opening a menu', () => {
    const el = parseElement(
      '<button jsaction="navigationrail.saved"><div><div>Saved</div></div></button>',
    );
    expect(isSavedTrigger(el)).toBe(true);
  });

  it('matches English or Japanese text as a fallback', () => {
    expect(isSavedTrigger(parseElement('<button><label>Saved</label></button>'))).toBe(true);
    expect(isSavedTrigger(parseElement('<button><label>保存済み</label></button>'))).toBe(true);
  });

  it('rejects an unrelated menu item', () => {
    expect(isSavedTrigger(parseElement('<button><label>Your contributions</label></button>'))).toBe(false);
  });
});

describe('isNewListButton', () => {
  it('matches via data-value', () => {
    const el = parseElement('<button data-value="New list"></button>');
    expect(isNewListButton(el)).toBe(true);
  });

  it('matches English or Japanese aria-label as a fallback', () => {
    expect(isNewListButton(parseElement('<button aria-label="New list"></button>'))).toBe(true);
    expect(isNewListButton(parseElement('<button aria-label="新しいリスト"></button>'))).toBe(true);
  });

  it('rejects an unrelated button', () => {
    expect(isNewListButton(parseElement('<button aria-label="More options"></button>'))).toBe(false);
  });
});

describe('isDoneButton', () => {
  it('matches a jsaction handler ending in .done regardless of its instance id', () => {
    const el = parseElement('<button jsaction="pane.wfvdle636.done"><span>whatever</span></button>');
    expect(isDoneButton(el)).toBe(true);
  });

  it('matches English or Japanese text as a fallback', () => {
    expect(isDoneButton(parseElement('<button><span>Done</span></button>'))).toBe(true);
    expect(isDoneButton(parseElement('<button><span>完了</span></button>'))).toBe(true);
  });

  it('rejects an unrelated button', () => {
    expect(isDoneButton(parseElement('<button><span>Cancel</span></button>'))).toBe(false);
  });
});

describe('isBackButton', () => {
  it('matches via the jsaction handler', () => {
    const el = parseElement('<button jsaction="omnibox.back" aria-label="something else"></button>');
    expect(isBackButton(el)).toBe(true);
  });

  it('matches English or Japanese aria-label as a fallback', () => {
    expect(isBackButton(parseElement('<button aria-label="Back"></button>'))).toBe(true);
    expect(isBackButton(parseElement('<button aria-label="戻る"></button>'))).toBe(true);
  });

  it('rejects an unrelated button', () => {
    expect(isBackButton(parseElement('<button aria-label="Close"></button>'))).toBe(false);
  });
});

describe('isUntitledListPlaceholder', () => {
  it('matches the known English/Japanese placeholder strings', () => {
    expect(isUntitledListPlaceholder('Untitled list')).toBe(true);
    expect(isUntitledListPlaceholder('無題のリスト')).toBe(true);
  });

  it('rejects a real list name', () => {
    expect(isUntitledListPlaceholder('食べログ')).toBe(false);
  });
});

describe('isListMetaLine', () => {
  it('matches a Private/Shared middle-dot count line', () => {
    expect(isListMetaLine('Private · 12 places')).toBe(true);
    expect(isListMetaLine('Shared · 1 place')).toBe(true);
  });

  it('rejects a plain name with no dot/count', () => {
    expect(isListMetaLine('食べログ')).toBe(false);
  });

  it('rejects an empty string', () => {
    expect(isListMetaLine('')).toBe(false);
    expect(isListMetaLine(null)).toBe(false);
  });
});
