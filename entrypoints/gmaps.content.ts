// Automates the Google Maps native saved-list UI (ADR-0008 — supersedes the old My Maps import
// path). Unlike the old mymaps.content.ts, this flow is a genuine single-page app: opening the
// menu, opening the Saved pane, creating a list, and renaming it are all in-place DOM mutations,
// never a full document navigation — so there is no cross-origin iframe and no re-injection dance
// to manage here. One request (GMAPS_ENSURE_LIST) gets exactly one reply once the whole sequence
// either succeeds or fails explicitly.
//
// The rename step (click "New list" -> find the "Untitled list" placeholder -> type the target
// name -> Done) is the least-confirmed part of this file: the sample captures did not reveal
// whether the placeholder title becomes an editable <input> or is itself contenteditable in
// place. See the (sanitized) spike notes doc — this needs live verification before shipping, same
// caveat the old My Maps spike carried for its own unconfirmed steps.

import {
  isBackButton,
  isDoneButton,
  isMenuButton,
  isNewListButton,
  isSavedMenuItem,
  isUntitledListPlaceholder,
} from '@/src/domain/google-maps/google-maps-detectors';
import { findSavedListsPaneRoot, hasListNamed } from '@/src/domain/google-maps/saved-lists-pane';
import { isWorkerToGoogleMapsMessage } from '@/src/domain/messaging/message-types';
import type { GoogleMapsToWorkerMessage, JobId } from '@/src/domain/messaging/message-types';

const POLL_INTERVAL_MS = 300;
const OPEN_PANE_TIMEOUT_MS = 15_000;
const RENAME_TIMEOUT_MS = 15_000;
const REGISTERED_FLAG = '__import2gmapGmapsRegistered';

function isAlreadyRegisteredInThisDocument(): boolean {
  return Boolean((window as unknown as Record<string, boolean>)[REGISTERED_FLAG]);
}

function markRegisteredInThisDocument(): void {
  (window as unknown as Record<string, boolean>)[REGISTERED_FLAG] = true;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitFor<T>(find: () => T | null | undefined, timeoutMs: number): Promise<T | null> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const found = find();
    if (found) return found;
    if (Date.now() > deadline) return null;
    await sleep(POLL_INTERVAL_MS);
  }
}

function findButton(predicate: (el: Element) => boolean): HTMLElement | null {
  for (const button of document.querySelectorAll<HTMLElement>('button')) {
    if (predicate(button)) return button;
  }
  return null;
}

function findUntitledListTarget(): HTMLElement | null {
  for (const el of document.querySelectorAll<HTMLElement>('input, textarea, span, div')) {
    const value = el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement ? el.value : el.textContent;
    if (isUntitledListPlaceholder(value)) return el;
  }
  return null;
}

function setEditableText(el: HTMLElement, value: string): void {
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    el.value = value;
  } else {
    el.textContent = value;
  }
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
}

function fail(jobId: JobId, code: string): GoogleMapsToWorkerMessage {
  return { type: 'GMAPS_ENSURE_LIST_RESULT', protocolVersion: 1, jobId, ok: false, code };
}

function succeed(jobId: JobId, created: boolean): GoogleMapsToWorkerMessage {
  return { type: 'GMAPS_ENSURE_LIST_RESULT', protocolVersion: 1, jobId, ok: true, created };
}

async function createList(jobId: JobId, listName: string): Promise<GoogleMapsToWorkerMessage> {
  const newListButton = findButton(isNewListButton);
  if (!newListButton) return fail(jobId, 'GoogleMapsUiChanged');
  newListButton.click();

  // Not independently confirmed whether the "Untitled list" placeholder is a plain text element
  // that needs a click to become editable, or is already editable — see the file header note.
  // Defensive best-effort: click it once if it isn't already an <input>/<textarea>, then re-poll
  // briefly in case doing so swapped in a real form control.
  let renameTarget = await waitFor(findUntitledListTarget, RENAME_TIMEOUT_MS);
  if (!renameTarget) return fail(jobId, 'GoogleMapsUiChanged');
  if (!(renameTarget instanceof HTMLInputElement || renameTarget instanceof HTMLTextAreaElement)) {
    renameTarget.click();
    const reacquired = await waitFor(findUntitledListTarget, 2_000);
    if (reacquired) renameTarget = reacquired;
  }
  setEditableText(renameTarget, listName);

  const doneButton = await waitFor(() => findButton(isDoneButton), RENAME_TIMEOUT_MS);
  if (!doneButton) return fail(jobId, 'GoogleMapsUiChanged');
  doneButton.click();

  // Verify by actually finding the list in the pane afterward, rather than trusting the click
  // sequence blindly — the same "positive verification, not an assumed click" lesson the old My
  // Maps automation learned the hard way. Done may or may not already return to the list pane; if
  // it doesn't, look for a Back button once and try again within the remaining time budget.
  let pane = await waitFor(() => findSavedListsPaneRoot(document), 3_000);
  if (!pane) {
    const backButton = findButton(isBackButton);
    backButton?.click();
    pane = await waitFor(() => findSavedListsPaneRoot(document), RENAME_TIMEOUT_MS);
  }
  if (!pane || !hasListNamed(pane, listName)) {
    return fail(jobId, 'GoogleMapsUiChanged');
  }
  return succeed(jobId, true);
}

async function handleEnsureList(jobId: JobId, listName: string): Promise<GoogleMapsToWorkerMessage> {
  try {
    const menuButton = await waitFor(() => findButton(isMenuButton), OPEN_PANE_TIMEOUT_MS);
    if (!menuButton) return fail(jobId, 'GoogleMapsUiChanged');
    menuButton.click();

    const savedMenuItem = await waitFor(() => findButton(isSavedMenuItem), OPEN_PANE_TIMEOUT_MS);
    if (!savedMenuItem) return fail(jobId, 'GoogleMapsUiChanged');
    savedMenuItem.click();

    const pane = await waitFor(() => findSavedListsPaneRoot(document), OPEN_PANE_TIMEOUT_MS);
    if (!pane) return fail(jobId, 'GoogleMapsUiChanged');

    if (hasListNamed(pane, listName)) {
      return succeed(jobId, false);
    }

    return await createList(jobId, listName);
  } catch {
    return fail(jobId, 'InternalError');
  }
}

export default defineContentScript({
  registration: 'runtime',
  main() {
    if (isAlreadyRegisteredInThisDocument()) return;
    markRegisteredInThisDocument();

    browser.runtime.onMessage.addListener((rawMessage, _sender, sendResponse) => {
      if (!isWorkerToGoogleMapsMessage(rawMessage)) {
        return undefined;
      }
      void handleEnsureList(rawMessage.jobId, rawMessage.listName).then(sendResponse);
      return true;
    });
  },
});
