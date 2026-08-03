import { buildKmlFile } from '@/src/domain/my-maps/build-kml-file';
import {
  detectMapsFrameRole,
  hasImportSucceeded,
  hasMapTitleApplied,
  isLoggedOutRedirect,
  isPickerUploadNavLabel,
  isPickerUploadNavSelected,
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
// Fallback for the picker v2 source-nav layout's upload pane: its own file input markup was never
// directly observed (only the enclosing dialog's `data-sources` config, which lists the same
// `.KML`-inclusive `fileExts` as layout 1), so this is a defensive, unconfirmed fallback — see
// spike results §3 (2026-08-04 addendum). It previously doubled as the test for "are we already on
// the upload pane" in `findKmlFileInput`, which was a bug: the Drive-browsing pane supports
// drag-and-drop upload (`data-target="itemUploadDrop"` tiles) and can itself contain a stray hidden
// file input, so that use could match the *wrong* input and make the handler wrongly skip clicking
// the upload nav — a suspected cause of a field report where the nav stayed `aria-selected="false"`
// and the import stalled (spike results §3, 2026-08-04 second addendum). It must now only be
// reached once the upload pane is confirmed active — see `findKmlFileInputWithFallback` below.
const FILE_INPUT_FALLBACK_SELECTOR = 'input[type="file"]';
// `jsname="Co88hf"` is an optional narrowing hint for the picker's source-nav options, never the
// sole anchor (it's undocumented and could churn); the real identifier is the option's own text.
const PICKER_NAV_OPTION_HINT_SELECTOR = 'div[role="option"][jsname="Co88hf"]';
const PICKER_NAV_OPTION_SELECTOR = 'div[role="option"]';
const LAYER_TITLE_SELECTOR = '#ly0-layer-header .pbTTYe-r4nke';
const DEFAULT_LAYER_TITLE = '無題のレイヤ';
const PREPARE_TIMEOUT_MS = 15_000;
const DRIVE_CONSENT_TIMEOUT_MS = 5_000;
const IMPORT_TIMEOUT_MS = 30_000;
const MAP_TITLE_APPLY_TIMEOUT_MS = 15_000;
const POLL_INTERVAL_MS = 300;
// Bound for each individual upload-nav activation strategy in `activateUploadPaneNav` below — kept
// short (rather than reusing PREPARE_TIMEOUT_MS) so escalating through the ordered list of
// strategies doesn't itself take unreasonably long; a real activation should take effect almost
// immediately if it's going to at all.
const ACTIVATION_STEP_TIMEOUT_MS = 1_000;

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

// Picker frame only. Mirrors findDriveConsentCreateButton's shape: an attribute-ish query first
// (the jsname hint, which narrows but is not the sole anchor), falling back to the bare
// `role="option"` query, then text-matching over whichever candidate set that produced — never
// anchored on position (`name="N"` is a source index that shifts per-account) or hashed classes
// (churn across Google deploys). See spike results §3 (2026-08-04 addendum, picker v2).
function findPickerUploadNavOption(): HTMLElement | null {
  const hinted = document.querySelectorAll<HTMLElement>(PICKER_NAV_OPTION_HINT_SELECTOR);
  const candidates = hinted.length > 0 ? hinted : document.querySelectorAll<HTMLElement>(PICKER_NAV_OPTION_SELECTOR);
  for (const option of candidates) {
    if (isPickerUploadNavLabel(option.textContent ?? '')) return option;
  }
  return null;
}

function findKmlFileInputStrict(): HTMLInputElement | null {
  return document.querySelector<HTMLInputElement>(FILE_INPUT_SELECTOR);
}

// Only safe to call once the upload pane is confirmed active (see FILE_INPUT_FALLBACK_SELECTOR's
// comment above) — never used as the test for "have we reached the upload pane".
function findKmlFileInputWithFallback(): HTMLInputElement | null {
  return findKmlFileInputStrict() ?? document.querySelector<HTMLInputElement>(FILE_INPUT_FALLBACK_SELECTOR);
}

async function waitForKmlFileInput(timeoutMs: number): Promise<HTMLInputElement | null> {
  let fileInput: HTMLInputElement | null = null;
  await pollUntil(() => {
    fileInput = findKmlFileInputWithFallback();
    return fileInput !== null;
  }, timeoutMs);
  return fileInput;
}

function isUploadNavSelected(option: HTMLElement | null): boolean {
  return option !== null && isPickerUploadNavSelected(option.getAttribute('aria-selected'));
}

// Each strategy is applied to the *current* nav option (re-queried by the caller, since delegated
// jsaction handlers can replace the DOM node) and, if it worked, should flip `aria-selected` to
// `"true"`. Ordered from least to most intrusive:
//   1. A plain `.click()` — works if the option has its own click handler.
//   2. A bubbling pointer/mouse sequence — the listbox's `jsaction="click:cOuCgd"` is delegated on
//      the *container*, not the option, and delegation needs real bubbling events, which a bare
//      `HTMLElement.click()` may not synthesize convincingly enough for jsaction to react to.
//   3/4. Keyboard activation (`Enter`, then `' '`/Space) — the listbox also has
//      `jsaction="keydown:I481le"`, a genuinely different activation path from click, worth trying
//      on its own rather than assuming it's covered by the click attempts above.
const ACTIVATION_STRATEGIES: ReadonlyArray<(option: HTMLElement) => void> = [
  (option) => option.click(),
  (option) => {
    for (const type of ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click']) {
      const EventCtor = type.startsWith('pointer') ? PointerEvent : MouseEvent;
      option.dispatchEvent(new EventCtor(type, { bubbles: true }));
    }
  },
  (option) => {
    option.focus();
    option.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  },
  (option) => {
    option.focus();
    option.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
  },
];

// Picker frame only. Escalates through ACTIVATION_STRATEGIES in order, each followed by a bounded
// re-check, until the upload nav option's `aria-selected` flips to `"true"` or the file input
// appears (whichever this frame's layout actually renders). Returns false only once every strategy
// has been tried and neither happened — the caller must treat that as an explicit MyMapsUiChanged,
// never a silent continue (ADR-0003). See spike results §3 (2026-08-04 second addendum).
async function activateUploadPaneNav(): Promise<boolean> {
  for (const applyStrategy of ACTIVATION_STRATEGIES) {
    const option = findPickerUploadNavOption();
    if (!option) return false;
    if (isUploadNavSelected(option)) return true;

    applyStrategy(option);

    const activated = await pollUntil(
      () => isUploadNavSelected(findPickerUploadNavOption()) || findKmlFileInputStrict() !== null,
      ACTIVATION_STEP_TIMEOUT_MS,
    );
    if (activated) return true;
  }
  return false;
}

// Picker frame only (docs.google.com/picker). This is the only frame where the KML file input
// actually exists — see spike results "cross-origin picker iframe". Two layouts are possible (see
// spike results §3, 2026-08-04 addendum + second addendum): layout 1 has the upload pane (and file
// input) present immediately; picker v2 instead renders a source-nav listbox and the upload pane
// doesn't exist in the DOM until "アップロード"/"Upload" is activated. The picker frame may also
// still be loading when this message arrives, so neither may exist yet — hence the bounded poll for
// *either* below, rather than an arbitrary short pre-check timeout.
//
// The layout decision is driven by the nav option's own `aria-selected` state (Module 13.7,
// `isPickerUploadNavSelected`), never by whether some file input happens to already exist in the
// frame — a first fix that used file-input presence as the "already on the upload pane" test did
// not work in the field (the nav stayed `aria-selected="false"`, Drive pane still rendered; see
// spike results §3, 2026-08-04 second addendum), because the Drive-browsing pane can itself contain
// a stray file input (drag-and-drop upload support) that the old bare fallback selector could match.
async function handleFeedKml(jobId: JobId, kml: string, fileName: string): Promise<MapsToWorkerMessage> {
  const navOrStrictInputReady = await pollUntil(
    () => findPickerUploadNavOption() !== null || findKmlFileInputStrict() !== null,
    PREPARE_TIMEOUT_MS,
  );
  if (!navOrStrictInputReady) {
    return { type: 'MAPS_FEED_KML_RESULT', protocolVersion: 1, jobId, ok: false, code: 'MyMapsUiChanged' };
  }

  // If the nav exists but isn't confirmed selected yet, activate it — regardless of whether a file
  // input was already found by some other selector, since that's exactly what let the previous fix
  // misfire (see the handler's own comment above).
  const navOption = findPickerUploadNavOption();
  if (navOption && !isUploadNavSelected(navOption)) {
    const activated = await activateUploadPaneNav();
    if (!activated) {
      return { type: 'MAPS_FEED_KML_RESULT', protocolVersion: 1, jobId, ok: false, code: 'MyMapsUiChanged' };
    }
  }

  // Safe to use the fallback-including lookup here: either there was no source-nav listbox at all
  // (layout 1 — a single pane, already the upload pane), or the nav is now confirmed
  // `aria-selected="true"` (already was, or just activated above).
  const fileInput = await waitForKmlFileInput(PREPARE_TIMEOUT_MS);
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
