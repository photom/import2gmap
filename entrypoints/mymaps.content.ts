import { buildKmlFile } from '@/src/domain/my-maps/build-kml-file';
import {
  detectMapsFrameRole,
  hasImportSucceeded,
  hasMapTitleApplied,
  isLoggedOutRedirect,
} from '@/src/domain/my-maps/my-maps-detectors';
import { isWorkerToMapsMessage } from '@/src/domain/messaging/message-types';
import type { JobId, MapsOutcome, MapsToWorkerMessage } from '@/src/domain/messaging/message-types';

const CREATE_MAP_SELECTOR = 'div[aria-label="新しい地図を作成"]';
const DRIVE_CONSENT_SELECTOR = '[data-id="t0O6ic"]';
const DRIVE_CONSENT_TEXT = 'CREATE';
const MAP_TITLE_BAR_SELECTOR = '#map-title-desc-bar .i4ewOd-r4nke';
const MAP_TITLE_DIALOG_INPUT_SELECTOR = '#update-map input[type="text"]';
const MAP_TITLE_DIALOG_SAVE_SELECTOR = '#update-map button[name="save"]';
const IMPORT_LINK_SELECTOR = '#ly0-layerview-import-link';
const FILE_INPUT_SELECTOR = 'input[type="file"][accept*="KML"]';
const LAYER_TITLE_SELECTOR = '#ly0-layer-header .pbTTYe-r4nke';
const DEFAULT_LAYER_TITLE = '無題のレイヤ';
const PREPARE_TIMEOUT_MS = 15_000;
const DRIVE_CONSENT_TIMEOUT_MS = 5_000;
const IMPORT_TIMEOUT_MS = 30_000;
const MAP_TITLE_APPLY_TIMEOUT_MS = 15_000;
const POLL_INTERVAL_MS = 300;

// The worker discovers the picker iframe's frameId by repeatedly re-injecting this script with
// `allFrames: true` (see `waitForPickerFrame` in entrypoints/background.ts) until an injection
// result reports the 'picker' role. That means, in the top frame especially, `main()` can run
// more than once against the SAME still-loaded document. `window` (unlike top-level `const`/
// `function` bindings, which are re-declared fresh on every injection) is the actual DOM object
// and persists across re-injections into the same document, so a flag on it is what lets us
// avoid piling up duplicate `runtime.onMessage` listeners.
const REGISTERED_FLAG = '__import2gmapMymapsRegistered';

function isAlreadyRegisteredInThisDocument(): boolean {
  return Boolean((window as unknown as Record<string, boolean>)[REGISTERED_FLAG]);
}

function markRegisteredInThisDocument(): void {
  (window as unknown as Record<string, boolean>)[REGISTERED_FLAG] = true;
}

async function pollUntil(predicate: () => boolean, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return true;
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
  return predicate();
}

// The My Maps SPA keeps rendering for a moment after the URL/route changes (e.g. right
// after a new map is created), so elements like the layer panel can appear late. Poll
// instead of a single querySelector so we don't act on a DOM that hasn't caught up yet.
async function waitForElement<T extends Element = HTMLElement>(
  selector: string,
  timeoutMs: number,
): Promise<T | null> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const element = document.querySelector<T>(selector);
    if (element || Date.now() > deadline) {
      return element;
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
}

function findDriveConsentCreateButton(): HTMLElement | null {
  const byDataId = document.querySelector<HTMLElement>(DRIVE_CONSENT_SELECTOR);
  if (byDataId) return byDataId;
  const buttons = document.querySelectorAll<HTMLElement>('div[role="button"]');
  for (const button of buttons) {
    if (button.textContent?.trim() === DRIVE_CONSENT_TEXT) return button;
  }
  return null;
}

async function dismissDriveConsentIfPresent(): Promise<void> {
  await pollUntil(() => {
    const button = findDriveConsentCreateButton();
    if (button) {
      button.click();
      return true;
    }
    return false;
  }, DRIVE_CONSENT_TIMEOUT_MS);
}

// Clicking "新しい地図を作成" causes a full document navigation, which destroys this content
// script's execution context before it could ever observe the result (URL change, layer panel
// render, etc.) or send a further reply. So this handler only does same-document work — it
// checks readiness and replies ok/failure — and returns *before* anything clicks. The actual
// click (and optional Drive-consent click) is triggered by the caller only after the reply has
// been sent (mirrors the TAB_CLICK_NEXT ordering in tabelog.content.ts). The worker then polls
// the tab's URL for `mid=` and re-injects a fresh content script into the new document before
// sending MAPS_OPEN_IMPORT_DIALOG — see entrypoints/background.ts `waitForMapCreatedUrl`.
async function handlePrepareImport(jobId: JobId): Promise<MapsToWorkerMessage> {
  if (isLoggedOutRedirect(window.location.hostname)) {
    return { type: 'MAPS_PREPARE_RESULT', protocolVersion: 1, jobId, ok: false, code: 'MyMapsNotReady' };
  }

  const createButton = await waitForElement<HTMLElement>(CREATE_MAP_SELECTOR, PREPARE_TIMEOUT_MS);
  if (!createButton) {
    return { type: 'MAPS_PREPARE_RESULT', protocolVersion: 1, jobId, ok: false, code: 'MyMapsUiChanged' };
  }

  return { type: 'MAPS_PREPARE_RESULT', protocolVersion: 1, jobId, ok: true };
}

// Must run strictly after MAPS_PREPARE_RESULT has been sent (see handlePrepareImport above).
// Re-queries the create-map control since the value captured during handlePrepareImport cannot
// safely cross the `await sendResponse` boundary in a way that guarantees it's still valid.
function triggerMapCreation(): void {
  const createButton = document.querySelector<HTMLElement>(CREATE_MAP_SELECTOR);
  createButton?.click();

  // Google may show a one-time Drive upload consent dialog here; click through it if present,
  // but don't fail if it's absent (it isn't shown on every account/session). This is a
  // same-document modal that appears, if at all, before the navigation — fire-and-forget since
  // no further reply is expected for this job.
  void dismissDriveConsentIfPresent();
}

// Top frame only. Renames the My Maps document itself to the user's chosen map name — the map
// title bar (`#map-title-desc-bar`) click opens an edit dialog (`#update-map`). Same as every
// other step in this flow, the dialog renders with a lag after the click, so every lookup here is
// a bounded `waitForElement` poll, never a single synchronous `querySelector`. This is a Closure
// app: setting `input.value` alone does not register with its internal state, so both an `input`
// and a `change` event are dispatched before clicking save. Runs before MAPS_OPEN_IMPORT_DIALOG
// so the two modal dialogs (title edit, then KML import) never interleave.
async function handleSetMapTitle(jobId: JobId, mapName: string): Promise<MapsToWorkerMessage> {
  const titleBar = await waitForElement<HTMLElement>(MAP_TITLE_BAR_SELECTOR, PREPARE_TIMEOUT_MS);
  if (!titleBar) {
    return { type: 'MAPS_SET_MAP_TITLE_RESULT', protocolVersion: 1, jobId, ok: false, code: 'MyMapsUiChanged' };
  }
  titleBar.click();

  const titleInput = await waitForElement<HTMLInputElement>(MAP_TITLE_DIALOG_INPUT_SELECTOR, PREPARE_TIMEOUT_MS);
  if (!titleInput) {
    return { type: 'MAPS_SET_MAP_TITLE_RESULT', protocolVersion: 1, jobId, ok: false, code: 'MyMapsUiChanged' };
  }
  titleInput.value = mapName;
  titleInput.dispatchEvent(new Event('input', { bubbles: true }));
  titleInput.dispatchEvent(new Event('change', { bubbles: true }));

  const saveButton = await waitForElement<HTMLElement>(MAP_TITLE_DIALOG_SAVE_SELECTOR, PREPARE_TIMEOUT_MS);
  if (!saveButton) {
    return { type: 'MAPS_SET_MAP_TITLE_RESULT', protocolVersion: 1, jobId, ok: false, code: 'MyMapsUiChanged' };
  }
  saveButton.click();

  const applied = await pollUntil(() => {
    const title = document.querySelector(MAP_TITLE_BAR_SELECTOR)?.textContent ?? '';
    return hasMapTitleApplied(title, mapName);
  }, MAP_TITLE_APPLY_TIMEOUT_MS);

  const outcome: MapsOutcome = applied ? { ok: true } : { ok: false, code: 'MyMapsUiChanged' };
  return { type: 'MAPS_SET_MAP_TITLE_RESULT', protocolVersion: 1, jobId, ...outcome };
}

// Top frame only. Clicking the import link (「インポート」) is what makes Google start loading
// the KML upload dialog — a cross-origin `docs.google.com/picker` IFRAME, not more DOM in this
// document (see spike results). So this handler's job ends at the click; it does not (and
// cannot, from this frame) look for the file input. The worker discovers the picker iframe
// itself afterward (`waitForPickerFrame`) and sends MAPS_FEED_KML directly to it.
async function handleOpenImportDialog(jobId: JobId): Promise<MapsToWorkerMessage> {
  const importLink = await waitForElement<HTMLElement>(IMPORT_LINK_SELECTOR, PREPARE_TIMEOUT_MS);
  if (!importLink) {
    return { type: 'MAPS_OPEN_IMPORT_DIALOG_RESULT', protocolVersion: 1, jobId, ok: false, code: 'MyMapsUiChanged' };
  }
  importLink.click();
  return { type: 'MAPS_OPEN_IMPORT_DIALOG_RESULT', protocolVersion: 1, jobId, ok: true };
}

// Picker frame only (docs.google.com/picker). This is the only frame where the KML file input
// actually exists — see spike results "cross-origin picker iframe".
async function handleFeedKml(jobId: JobId, kml: string, fileName: string): Promise<MapsToWorkerMessage> {
  const fileInput = await waitForElement<HTMLInputElement>(FILE_INPUT_SELECTOR, PREPARE_TIMEOUT_MS);
  if (!fileInput) {
    return { type: 'MAPS_FEED_KML_RESULT', protocolVersion: 1, jobId, ok: false, code: 'MyMapsUiChanged' };
  }

  const dataTransfer = new DataTransfer();
  dataTransfer.items.add(buildKmlFile(kml, fileName));
  fileInput.files = dataTransfer.files;
  fileInput.dispatchEvent(new Event('change', { bubbles: true }));

  return { type: 'MAPS_FEED_KML_RESULT', protocolVersion: 1, jobId, ok: true };
}

// Top frame only. The success signal (layer title changing away from its default) renders back
// in the top My Maps document, not the picker iframe, once Google finishes processing the file
// fed to it via MAPS_FEED_KML.
async function handleAwaitImportResult(jobId: JobId): Promise<MapsToWorkerMessage> {
  const succeeded = await pollUntil(() => {
    const title = document.querySelector(LAYER_TITLE_SELECTOR)?.textContent ?? '';
    return hasImportSucceeded(title, DEFAULT_LAYER_TITLE);
  }, IMPORT_TIMEOUT_MS);

  const outcome: MapsOutcome = succeeded ? { ok: true } : { ok: false, code: 'MyMapsUiChanged' };
  return { type: 'MAPS_IMPORT_RESULT', protocolVersion: 1, jobId, ...outcome };
}

function registerMymapsFrameListener(): void {
  browser.runtime.onMessage.addListener((rawMessage, _sender, sendResponse) => {
    if (!isWorkerToMapsMessage(rawMessage)) {
      return undefined;
    }
    if (rawMessage.type === 'MAPS_PREPARE_IMPORT') {
      void handlePrepareImport(rawMessage.jobId).then((result) => {
        sendResponse(result);
        if (result.type === 'MAPS_PREPARE_RESULT' && result.ok) {
          triggerMapCreation();
        }
      });
      return true;
    }
    if (rawMessage.type === 'MAPS_SET_MAP_TITLE') {
      void handleSetMapTitle(rawMessage.jobId, rawMessage.mapName).then(sendResponse);
      return true;
    }
    if (rawMessage.type === 'MAPS_OPEN_IMPORT_DIALOG') {
      void handleOpenImportDialog(rawMessage.jobId).then(sendResponse);
      return true;
    }
    if (rawMessage.type === 'MAPS_AWAIT_IMPORT_RESULT') {
      void handleAwaitImportResult(rawMessage.jobId).then(sendResponse);
      return true;
    }
    // MAPS_FEED_KML is picker-frame-only; ignore it if it somehow reaches this frame.
    return undefined;
  });
}

function registerPickerFrameListener(): void {
  browser.runtime.onMessage.addListener((rawMessage, _sender, sendResponse) => {
    if (!isWorkerToMapsMessage(rawMessage) || rawMessage.type !== 'MAPS_FEED_KML') {
      return undefined;
    }
    void handleFeedKml(rawMessage.jobId, rawMessage.kml, rawMessage.fileName).then(sendResponse);
    return true;
  });
}

export default defineContentScript({
  registration: 'runtime',
  main() {
    // Returned so the worker can learn this frame's role (and frameId) from the
    // `browser.scripting.executeScript` injection result — see `waitForPickerFrame` in
    // entrypoints/background.ts. WXT surfaces a content script's `main()` return value there.
    const role = detectMapsFrameRole(window.location.hostname);

    if (!isAlreadyRegisteredInThisDocument()) {
      markRegisteredInThisDocument();
      if (role === 'picker') {
        registerPickerFrameListener();
      } else {
        registerMymapsFrameListener();
      }
    }

    return role;
  },
});
