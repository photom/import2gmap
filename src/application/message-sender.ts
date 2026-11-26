// OWASP Browser Extension Security: check who sent a runtime message, not just its shape.
// Popup commands must come from this extension's own pages (no tab); diagnostics must come from
// this extension's content scripts (always attached to a tab).
export type MessageSenderLike = {
  readonly id?: string;
  readonly tab?: unknown;
};

export function isExtensionPageSender(sender: MessageSenderLike, extensionId: string): boolean {
  return sender.id === extensionId && sender.tab === undefined;
}

export function isContentScriptSender(sender: MessageSenderLike, extensionId: string): boolean {
  return sender.id === extensionId && sender.tab !== undefined;
}
