import { SessionStorageManager } from '@/src/infrastructure/storage/session-storage-manager';
import { detectTabContext } from '@/src/application/tab-context-detector';
import { route } from '@/src/application/message-router';
import { isPopupToWorkerMessage } from '@/src/domain/messaging/message-types';
import type {
  ContentToWorkerMessage,
  JobId,
  MapsToWorkerMessage,
  PopupToWorkerMessage,
  WorkerToPopupMessage,
} from '@/src/domain/messaging/message-types';
import type { CollectionRef } from '@/src/domain/models/extracted-shop';
import type { StoredError, StoredShop } from '@/src/domain/models/session';
import { errorMessageFor } from '@/src/domain/errors/error-messages';
import { KmlBuilder } from '@/src/domain/kml/kml-builder';
import { hasCreatedNewMap } from '@/src/domain/my-maps/my-maps-detectors';

const TABELOG_CONTENT_SCRIPT = '/content-scripts/tabelog.js';
const MYMAPS_CONTENT_SCRIPT = '/content-scripts/mymaps.js';
const TAB_NAVIGATION_TIMEOUT_MS = 15_000;
const MAP_CREATION_TIMEOUT_MS = 15_000;
const PICKER_FRAME_TIMEOUT_MS = 15_000;
const NAVIGATION_POLL_INTERVAL_MS = 300;
const MY_MAPS_HOME_URL = 'https://www.google.com/maps/d/u/0/';
// Chrome always assigns frameId 0 to a tab's top-level document.
const TOP_FRAME_ID = 0;

export default defineBackground(() => {
  const sessionManager = new SessionStorageManager();

  browser.runtime.onMessage.addListener((rawMessage, _sender, sendResponse) => {
    if (!isPopupToWorkerMessage(rawMessage)) {
      return undefined;
    }
    void handlePopupMessage(rawMessage, sendResponse);
    return true;
  });

  async function handlePopupMessage(
    message: PopupToWorkerMessage,
    sendResponse: (reply: WorkerToPopupMessage | undefined) => void,
  ): Promise<void> {
    const tab = await getActiveTab();
    const tabContext = detectTabContext(tab?.url);
    const session = await sessionManager.read();
    const result = route(session, tabContext, message, {
      newJobId: () => crypto.randomUUID(),
      now: () => Date.now(),
    });

    if (Object.keys(result.patch).length > 0) {
      await sessionManager.patch(result.patch);
    }
    sendResponse(result.reply);

    if (result.tabCommand?.kind === 'start_extract' && tab?.id !== undefined) {
      void runExtractJob(tab.id, result.tabCommand.jobId);
    }
    if (result.tabCommand?.kind === 'open_my_maps') {
      void runImportJob(result.tabCommand.jobId, result.tabCommand.mapName);
    }
  }

  async function getActiveTab() {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    return tab;
  }

  async function sendToTab(tabId: number, message: unknown): Promise<ContentToWorkerMessage | undefined> {
    return browser.tabs.sendMessage(tabId, message);
  }

  function broadcastToPopup(message: WorkerToPopupMessage): void {
    browser.runtime.sendMessage(message).catch(() => {
      // No popup listening; safe to ignore.
    });
  }

  async function failExtract(jobId: JobId, code: string): Promise<void> {
    const error: StoredError = { code, message: errorMessageFor(code), retryStep: 'extract', jobId, at: Date.now() };
    await sessionManager.patch({ uiStep: 'error', activeJob: undefined, lastError: error });
    broadcastToPopup({ type: 'EXTRACT_FAILED', protocolVersion: 1, jobId, ...error });
  }

  // For a tab's FIRST load only (e.g. right after browser.tabs.create) — there is no prior
  // document to confuse the "already complete" short-circuit with, so checking current status
  // first is safe here and avoids registering the onUpdated listener too late.
  async function waitForTabLoaded(tabId: number): Promise<void> {
    const currentTab = await browser.tabs.get(tabId);
    if (currentTab.status === 'complete') {
      return;
    }

    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        browser.tabs.onUpdated.removeListener(onUpdated);
        reject(new Error('ExtractTimeout'));
      }, TAB_NAVIGATION_TIMEOUT_MS);

      function onUpdated(updatedTabId: number, info: { status?: string }) {
        if (updatedTabId === tabId && info.status === 'complete') {
          clearTimeout(timer);
          browser.tabs.onUpdated.removeListener(onUpdated);
          resolve();
        }
      }

      browser.tabs.onUpdated.addListener(onUpdated);
    });
  }

  // For waiting on a navigation AWAY from a document we were already on (e.g. after a content
  // script replies to TAB_CLICK_NEXT and then clicks the next-page link). Checking `status`
  // alone would race here: by the time our await resolves, the tab can still be reporting
  // `status: 'complete'` for the OLD document (the click that triggers the navigation happens
  // strictly after the reply, so it may not have committed yet) — a bare status check would
  // return instantly and the caller would re-inject into, and re-extract, the wrong page. Poll
  // until the tab's URL actually differs from the one captured before the navigating action AND
  // the new document has finished loading; bounded by a timeout, an explicit failure like every
  // other DOM/navigation wait in this file (never continue silently on an ambiguous state).
  async function waitForNavigation(tabId: number, previousUrl: string | undefined): Promise<void> {
    const deadline = Date.now() + TAB_NAVIGATION_TIMEOUT_MS;
    for (;;) {
      const tab = await browser.tabs.get(tabId);
      if (tab.status === 'complete' && tab.url !== undefined && tab.url !== previousUrl) {
        return;
      }
      if (Date.now() > deadline) {
        throw new Error('ExtractTimeout');
      }
      await new Promise((resolve) => setTimeout(resolve, NAVIGATION_POLL_INTERVAL_MS));
    }
  }

  // A programmatically injected content script's execution context is destroyed when its
  // document navigates; WXT's `registration: 'runtime'` scripts are not auto-reinjected. The
  // worker must explicitly re-inject after every navigation, before sending the next message.
  async function ensureContentScript(tabId: number, file: ScriptPublicPath): Promise<void> {
    await browser.scripting.executeScript({ target: { tabId }, files: [file] });
  }

  // The My Maps content script triggers the map-creation click only after it has already
  // replied to MAPS_PREPARE_IMPORT (its context dies on the resulting navigation), so the
  // worker itself must observe the `mid=` URL landing rather than rely on a content-script reply.
  async function waitForMapCreatedUrl(tabId: number, timeoutMs: number): Promise<boolean> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const tab = await browser.tabs.get(tabId);
      if (tab.url && hasCreatedNewMap(tab.url)) {
        return true;
      }
      if (Date.now() > deadline) {
        return false;
      }
      await new Promise((resolve) => setTimeout(resolve, NAVIGATION_POLL_INTERVAL_MS));
    }
  }

  async function runExtractJob(tabId: number, jobId: JobId): Promise<void> {
    try {
      await ensureContentScript(tabId, TABELOG_CONTENT_SCRIPT);

      const shops: StoredShop[] = [];
      const seenUrls = new Set<string>();
      const catalogById = new Map<string, CollectionRef>();
      let totalShopsDeclared: number | undefined;

      for (;;) {
        const pageResult = await sendToTab(tabId, { type: 'TAB_EXTRACT_PAGE', protocolVersion: 1, jobId });
        if (!pageResult || pageResult.type !== 'TAB_PAGE_RESULT') {
          await failExtract(jobId, pageResult?.type === 'TAB_EXTRACT_FAILED' ? pageResult.code : 'InternalError');
          return;
        }

        for (const shop of pageResult.shops as StoredShop[]) {
          if (seenUrls.has(shop.url)) continue;
          seenUrls.add(shop.url);
          shops.push(shop);
        }
        for (const ref of pageResult.catalogDelta as CollectionRef[]) {
          catalogById.set(ref.id, ref);
        }
        if (pageResult.pageMeta?.totalShopsDeclared !== undefined) {
          totalShopsDeclared = pageResult.pageMeta.totalShopsDeclared;
        }

        await sessionManager.patch({
          activeJob: { jobId, kind: 'extract', startedAt: Date.now(), progress: { shopsCollected: shops.length } },
        });
        broadcastToPopup({
          type: 'EXTRACT_PROGRESS',
          protocolVersion: 1,
          jobId,
          progress: { shopsCollected: shops.length },
        });

        // Capture the URL before sending TAB_CLICK_NEXT: the content script replies
        // {kind:'navigating'} first and clicks the next-page link only afterward, so this is
        // the last point at which `tabId` is guaranteed to still show the current page.
        const currentPageUrl = (await browser.tabs.get(tabId)).url;
        const nextResult = await sendToTab(tabId, { type: 'TAB_CLICK_NEXT', protocolVersion: 1, jobId });
        if (nextResult?.type !== 'TAB_NEXT_RESULT' || nextResult.kind === 'no_next') {
          break;
        }
        await waitForNavigation(tabId, currentPageUrl);
        await ensureContentScript(tabId, TABELOG_CONTENT_SCRIPT);
      }

      if (totalShopsDeclared !== undefined && totalShopsDeclared !== shops.length) {
        await failExtract(jobId, 'IncompleteCrawl');
        return;
      }

      const collectionsCatalog = [...catalogById.values()];
      await sessionManager.writeExtractResult({
        jobId,
        completedAt: Date.now(),
        shops,
        collectionsCatalog,
        shopCount: shops.length,
        collectionCount: collectionsCatalog.length,
      });
      broadcastToPopup({
        type: 'EXTRACT_SUCCEEDED',
        protocolVersion: 1,
        jobId,
        shopCount: shops.length,
        collectionCount: collectionsCatalog.length,
      });
    } catch {
      await failExtract(jobId, 'InternalError');
    }
  }

  // Always frame-targeted (never a bare tabs.sendMessage broadcast): the import flow spans two
  // frames — the top My Maps document and the cross-origin docs.google.com/picker iframe (see
  // messaging protocol §6) — and an untargeted send would reach every frame's listener at once,
  // making it ambiguous which reply is "the" reply.
  async function sendToMapsTab(
    tabId: number,
    message: unknown,
    frameId: number,
  ): Promise<MapsToWorkerMessage | undefined> {
    return browser.tabs.sendMessage(tabId, message, { frameId });
  }

  // The KML upload picker (docs.google.com/picker) is a cross-origin IFRAME that doesn't exist
  // in the DOM until after MAPS_OPEN_IMPORT_DIALOG's click, and loads asynchronously after that.
  // There's no permission-free way to be notified the instant it appears (that would need
  // `webNavigation`), so instead we re-inject with `allFrames: true` and check each injection
  // result's `result` field for the 'picker' role that mymaps.content.ts's `main()` returns
  // (see detectMapsFrameRole) until it shows up or we time out. Frames the extension lacks host
  // permission for are silently skipped by `executeScript`, so unrelated iframes on the page
  // never show up here. Re-injecting also re-executes the script in the top frame every poll
  // tick; mymaps.content.ts guards against re-registering its onMessage listener more than once
  // per document, so this doesn't pile up duplicate listeners there.
  async function waitForPickerFrame(tabId: number, timeoutMs: number): Promise<number | undefined> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const results = await browser.scripting.executeScript({
        target: { tabId, allFrames: true },
        files: [MYMAPS_CONTENT_SCRIPT],
      });
      const pickerFrame = results.find((result) => result.result === 'picker');
      if (pickerFrame) {
        return pickerFrame.frameId;
      }
      if (Date.now() > deadline) {
        return undefined;
      }
      await new Promise((resolve) => setTimeout(resolve, NAVIGATION_POLL_INTERVAL_MS));
    }
  }

  async function failImport(jobId: JobId, code: string): Promise<void> {
    const error: StoredError = { code, message: errorMessageFor(code), retryStep: 'import', jobId, at: Date.now() };
    await sessionManager.patch({ uiStep: 'error', activeJob: undefined, lastError: error });
    broadcastToPopup({ type: 'IMPORT_FAILED', protocolVersion: 1, jobId, ...error });
  }

  async function runImportJob(jobId: JobId, mapName: string): Promise<void> {
    try {
      const session = await sessionManager.read();
      if (!session.extractResult) {
        await failImport(jobId, 'NoExtractResult');
        return;
      }

      const tab = await browser.tabs.create({ url: MY_MAPS_HOME_URL });
      if (tab.id === undefined) {
        await failImport(jobId, 'MyMapsTabOpenFailed');
        return;
      }
      const tabId = tab.id;
      broadcastToPopup({ type: 'IMPORT_PRELUDE_STARTED', protocolVersion: 1, jobId });

      await waitForTabLoaded(tabId);
      await ensureContentScript(tabId, MYMAPS_CONTENT_SCRIPT);

      // MAPS_PREPARE_RESULT ok:true means the content script found the create-map control and
      // triggered its click; the click's navigation destroys that script's context before it can
      // observe the outcome, so the worker must poll the tab URL itself and re-inject a fresh
      // content script into the new document before continuing.
      const prepareResult = await sendToMapsTab(
        tabId,
        { type: 'MAPS_PREPARE_IMPORT', protocolVersion: 1, jobId },
        TOP_FRAME_ID,
      );
      if (!prepareResult || prepareResult.type !== 'MAPS_PREPARE_RESULT' || !prepareResult.ok) {
        await failImport(jobId, prepareResult?.type === 'MAPS_PREPARE_RESULT' ? prepareResult.code : 'InternalError');
        return;
      }

      const mapCreated = await waitForMapCreatedUrl(tabId, MAP_CREATION_TIMEOUT_MS);
      if (!mapCreated) {
        await failImport(jobId, 'MyMapsUiChanged');
        return;
      }
      await ensureContentScript(tabId, MYMAPS_CONTENT_SCRIPT);

      // Rename the map to the user's chosen name before opening the KML import dialog, so the
      // two modal dialogs (title edit, then import) never interleave. Treated as an explicit hard
      // failure, not a best-effort skip: the eventual import_succeeded popup screen asserts
      // 「{mapName}」に{shopCount}件... — if the rename silently failed, that message would name a
      // map that doesn't exist, which is exactly the "no silent false success" ADR-0003 forbids.
      const setTitleResult = await sendToMapsTab(
        tabId,
        { type: 'MAPS_SET_MAP_TITLE', protocolVersion: 1, jobId, mapName },
        TOP_FRAME_ID,
      );
      if (!setTitleResult || setTitleResult.type !== 'MAPS_SET_MAP_TITLE_RESULT' || !setTitleResult.ok) {
        await failImport(
          jobId,
          setTitleResult?.type === 'MAPS_SET_MAP_TITLE_RESULT' ? setTitleResult.code : 'InternalError',
        );
        return;
      }

      // Opening the import dialog (top frame) is what makes Google start loading the KML upload
      // picker — a cross-origin docs.google.com/picker iframe (see messaging protocol §6 / spike
      // results). The file input the user "sees" next only exists inside that iframe, not here.
      const openDialogResult = await sendToMapsTab(
        tabId,
        { type: 'MAPS_OPEN_IMPORT_DIALOG', protocolVersion: 1, jobId },
        TOP_FRAME_ID,
      );
      if (!openDialogResult || openDialogResult.type !== 'MAPS_OPEN_IMPORT_DIALOG_RESULT' || !openDialogResult.ok) {
        await failImport(
          jobId,
          openDialogResult?.type === 'MAPS_OPEN_IMPORT_DIALOG_RESULT' ? openDialogResult.code : 'InternalError',
        );
        return;
      }

      const pickerFrameId = await waitForPickerFrame(tabId, PICKER_FRAME_TIMEOUT_MS);
      if (pickerFrameId === undefined) {
        await failImport(jobId, 'MyMapsUiChanged');
        return;
      }

      const kml = new KmlBuilder().build(mapName, session.extractResult.shops);
      const fileName = `${mapName.replace(/[/\\]/g, '_')}.kml`;
      const feedResult = await sendToMapsTab(
        tabId,
        { type: 'MAPS_FEED_KML', protocolVersion: 1, jobId, kml, fileName },
        pickerFrameId,
      );
      if (!feedResult || feedResult.type !== 'MAPS_FEED_KML_RESULT' || !feedResult.ok) {
        await failImport(jobId, feedResult?.type === 'MAPS_FEED_KML_RESULT' ? feedResult.code : 'InternalError');
        return;
      }

      // Success renders back in the top frame (the layer title changing), not the picker iframe.
      const importResult = await sendToMapsTab(
        tabId,
        { type: 'MAPS_AWAIT_IMPORT_RESULT', protocolVersion: 1, jobId },
        TOP_FRAME_ID,
      );
      if (!importResult || importResult.type !== 'MAPS_IMPORT_RESULT' || !importResult.ok) {
        await failImport(jobId, importResult?.type === 'MAPS_IMPORT_RESULT' ? importResult.code : 'InternalError');
        return;
      }

      await sessionManager.patch({ uiStep: 'import_succeeded', activeJob: undefined, lastError: undefined });
      broadcastToPopup({ type: 'IMPORT_SUCCEEDED', protocolVersion: 1, jobId });
    } catch {
      await failImport(jobId, 'InternalError');
    }
  }
});
