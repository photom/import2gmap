import { describe, expect, it } from 'vitest';
import { isContentScriptSender, isExtensionPageSender } from '../../src/application/message-sender';

const OWN_ID = 'own-extension-id';
const TAB = { id: 1 };

describe('isExtensionPageSender', () => {
  it('accepts a sender from this extension with no tab (the popup)', () => {
    expect(isExtensionPageSender({ id: OWN_ID }, OWN_ID)).toBe(true);
  });

  it('rejects a content script of this extension (sender has a tab)', () => {
    expect(isExtensionPageSender({ id: OWN_ID, tab: TAB }, OWN_ID)).toBe(false);
  });

  it('rejects a sender from another extension', () => {
    expect(isExtensionPageSender({ id: 'other-extension-id' }, OWN_ID)).toBe(false);
  });
});

describe('isContentScriptSender', () => {
  it('accepts a content script of this extension (sender has a tab)', () => {
    expect(isContentScriptSender({ id: OWN_ID, tab: TAB }, OWN_ID)).toBe(true);
  });

  it('rejects a sender from this extension with no tab', () => {
    expect(isContentScriptSender({ id: OWN_ID }, OWN_ID)).toBe(false);
  });

  it('rejects a sender from another extension', () => {
    expect(isContentScriptSender({ id: 'other-extension-id', tab: TAB }, OWN_ID)).toBe(false);
  });
});
