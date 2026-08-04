import { SessionStorageManager } from '@/src/infrastructure/storage/session-storage-manager';
import { detectTabContext } from '@/src/application/tab-context-detector';
import { route, routePermissionGranted } from '@/src/application/message-router';
import type { RouteDeps, RouteResult } from '@/src/application/message-router';
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
import { hasCreatedNewMap, isPickerFrameReady } from '@/src/domain/my-maps/my-maps-detectors';
import { TABELOG_ORIGINS } from '@/src/infrastructure/permissions/tabelog-origins';
import { MY_MAPS_ORIGINS } from '@/src/infrastructure/permissions/my-maps-origins';

const TABELOG_CONTENT_SCRIPT = '/content-scripts/tabelog.js';
const MYMAPS_CONTENT_SCRIPT = '/content-scripts/mymaps.js';
const TAB_NAVIGATION_TIMEOUT_MS = 15_000;
const MAP_CREATION_TIMEOUT_MS = 15_000;
// Overall budget for discovering the picker frame AND getting a reply to MAPS_FEED_KML, covering
// rediscovery retries (see sendFeedKmlWithRetry) — a frame can report ready content
// (isPickerFrameReady) and still have its execution context torn down before the message lands,
// e.g. the picker v2 app finishes its progressive render into a document beyond the one just
// discovered (hypothesis 0.2, spike results §3 third addendum). Kept larger than the old
// single-shot picker-frame timeout (15s) so there's real room for at least one rediscovery-and-resend.
const FEED_KML_RETRY_TIMEOUT_MS = 20_000;
const NAVIGATION_POLL_INTERVAL_MS = 300;
// Safety bound on returnToFirstPage's prev-arrow fallback loop (one page per round trip) — see
// its comment. Generous enough for very long saved lists; only ever hit on a genuine drift/stall,
// since each successful step strictly decreases the remaining distance to page 1.
const MAX_RETURN_TO_FIRST_PAGE_STEPS = 50;
const MY_MAPS_HOME_URL = 'https://www.google.com/maps/d/u/0/';
// Chrome always assigns frameId 0 to a tab's top-level document.
const TOP_FRAME_ID = 0;

// Diagnostic-only: a single greppable prefix for every step-trace line this file emits, so the
// field can be debugged from the service-worker console alone. Never pass page HTML, shop data,
// URLs, or map names here — only step names, jobId, frame counts/ids, role strings, and error
// codes (see docs/reference/extension-error-codes.md §1's "Logging" rule).
const LOG_PREFIX = '[import2gmap]';
function logStep(jobId: JobId, step: string, detail?: string): void {
  console.log(`${LOG_PREFIX} job=${jobId} step=${step}${detail !== undefined ? ` ${detail}` : ''}`);
}

export default defineBackground(() => {
  const sessionManager = new SessionStorageManager();

  browser.runtime.onMessage.addListener((rawMessage, _sender, sendResponse) => {
    if (!isPopupToWorkerMessage(rawMessage)) {
      return undefined;
    }
    void handlePopupMessage(rawMessage, sendResponse);
    return true;
  });

  // Chrome's optional-host-permission confirmation dialog takes focus and destroys the popup's
  // execution context, so a `permissions.request()` promise awaited in the popup never resolves
  // once the dialog appears — the popup dies before it can send EXTRACT_START/IMPORT_START. The
  // worker survives the popup's death, so it resumes the recorded step itself once the grant
  // lands. See message-router's `routePermissionGranted`, session model's `PendingPermission`,
  // and test-plan-phase2 Module 19. Deliberately does NOT act on a bare `onAdded` with no
  // recorded intent (that also fires for a permission granted by hand from chrome://extensions;
  // ADR-0003 requires the user to explicitly start extraction/import).
  browser.permissions.onAdded.addListener(() => {
    void handlePermissionGranted();
  });

  function routeDeps(): RouteDeps {
    return { newJobId: () => crypto.randomUUID(), now: () => Date.now() };
  }

  async function applyRouteResult(result: RouteResult, tab: { id?: number } | undefined): Promise<void> {
    if (Object.keys(result.patch).length > 0) {
      await sessionManager.patch(result.patch);
    }
    if (result.tabCommand?.kind === 'start_extract' && tab?.id !== undefined) {
      void runExtractJob(tab.id, result.tabCommand.jobId);
    }
    if (result.tabCommand?.kind === 'open_my_maps') {
      void runImportJob(result.tabCommand.jobId, result.tabCommand.mapName);
    }
  }

  async function handlePopupMessage(
    message: PopupToWorkerMessage,
    sendResponse: (reply: WorkerToPopupMessage | undefined) => void,
  ): Promise<void> {
    const tab = await getActiveTab();
    const tabContext = detectTabContext(tab?.url);
    const session = await sessionManager.read();
    const result = route(session, tabContext, message, routeDeps());

    await applyRouteResult(result, tab);
    sendResponse(result.reply);
  }

  async function handlePermissionGranted(): Promise<void> {
    const session = await sessionManager.read();
    const pending = session.pendingPermission;
    if (!pending) {
      return;
    }
    // Re-check via `contains` rather than trusting the onAdded event's own `origins` delta: if
    // part of the required set was already granted earlier (e.g. Tabelog granted for a prior
    // extract, now waiting on the Maps origins for import), the event's delta alone would be a
    // strict subset of what this step actually needs.
    const requiredOrigins = pending.step === 'extract' ? TABELOG_ORIGINS : MY_MAPS_ORIGINS;
    const satisfied = await browser.permissions.contains({ origins: [...requiredOrigins] });
    if (!satisfied) {
      return;
    }
    const tab = await getActiveTab();
    const tabContext = detectTabContext(tab?.url);
    const result = routePermissionGranted(session, tabContext, routeDeps());
    await applyRouteResult(result, tab);
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
    logStep(jobId, 'extract:failed', `code=${code}`);
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

  // Bounded prelude run once before the forward crawl: if the user started 抽出する while sitting
  // on page 2+ of the saved list, the forward-only crawl below would collect fewer shops than the
  // page declares and fail with IncompleteCrawl even though a full crawl from page 1 would have
  // succeeded (real-DOM field report, PG=3). Reuses the exact reply-before-navigate discipline
  // TAB_CLICK_NEXT already established: capture the tab URL before sending, and only
  // waitForNavigation/re-inject when the content script says it's about to click something.
  // Returns true once the content script confirms `already_first`; false after having already
  // called failExtract (SelectorDrift / the content script's own detection failure / exceeding
  // MAX_RETURN_TO_FIRST_PAGE_STEPS via ReturnToFirstPageFailed) — the caller must return without
  // starting the crawl loop.
  async function returnToFirstPage(tabId: number, jobId: JobId): Promise<boolean> {
    for (let step = 0; step < MAX_RETURN_TO_FIRST_PAGE_STEPS; step++) {
      const currentPageUrl = (await browser.tabs.get(tabId)).url;
      const result = await sendToTab(tabId, { type: 'TAB_GO_TO_FIRST_PAGE', protocolVersion: 1, jobId });
      if (!result) {
        await failExtract(jobId, 'InternalError');
        return false;
      }
      if (result.type === 'TAB_EXTRACT_FAILED') {
        await failExtract(jobId, result.code);
        return false;
      }
      if (result.type !== 'TAB_FIRST_PAGE_RESULT') {
        await failExtract(jobId, 'InternalError');
        return false;
      }
      if (result.kind === 'already_first') {
        return true;
      }
      await waitForNavigation(tabId, currentPageUrl);
      await ensureContentScript(tabId, TABELOG_CONTENT_SCRIPT);
    }
    await failExtract(jobId, 'ReturnToFirstPageFailed');
    return false;
  }

  async function runExtractJob(tabId: number, jobId: JobId): Promise<void> {
    try {
      await ensureContentScript(tabId, TABELOG_CONTENT_SCRIPT);

      const reachedFirstPage = await returnToFirstPage(tabId, jobId);
      if (!reachedFirstPage) {
        return;
      }

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

  // Compact, diagnostics-rule-safe (role strings + booleans only) summary of one injection result
  // for the tick log below — never the raw `result` value itself.
  function describeFrameResult(value: unknown): string {
    if (typeof value === 'object' && value !== null && 'role' in value && 'hasPickerContent' in value) {
      const { role, hasPickerContent } = value as { role: unknown; hasPickerContent: unknown };
      return `${String(role)}:${String(hasPickerContent)}`;
    }
    return String(value);
  }

  // The KML upload picker (docs.google.com/picker) is a cross-origin IFRAME that doesn't exist
  // in the DOM until after MAPS_OPEN_IMPORT_DIALOG's click, and loads asynchronously after that.
  // There's no permission-free way to be notified the instant it appears (that would need
  // `webNavigation`), so instead we re-inject with `allFrames: true` and check each injection
  // result's `result` field — `{ role, hasPickerContent }`, as returned by mymaps.content.ts's
  // `main()` — until a frame is both role 'picker' AND has actually rendered picker content
  // (`isPickerFrameReady`), or we time out. Hostname alone used to be treated as sufficient (bare
  // `result === 'picker'`); that could latch onto a still-loading `docs.google.com` frame, or
  // (defensively) a nested `docs.google.com` frame inside the picker gadget that never renders the
  // nav/file input at all — see hypothesis 0.1, spike results §3 third addendum. Frames the
  // extension lacks host permission for are silently skipped by `executeScript`, so unrelated
  // iframes on the page never show up here. Re-injecting also re-executes the script in the top
  // frame every poll tick; mymaps.content.ts guards against re-registering its onMessage listener
  // more than once per document, so this doesn't pile up duplicate listeners there.
  async function waitForPickerFrame(tabId: number, timeoutMs: number, jobId: JobId): Promise<number | undefined> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const results = await browser.scripting.executeScript({
        target: { tabId, allFrames: true },
        files: [MYMAPS_CONTENT_SCRIPT],
      });
      // One compact line per tick: frame count plus each frame's reported role:hasPickerContent,
      // so a stall here can be told apart as "picker frame never injected into" (few/no frames) vs.
      // "found but not ready yet" (a 'picker' role present but hasPickerContent still false).
      logStep(
        jobId,
        'waitForPickerFrame:tick',
        `frames=${results.length} roles=${results.map((result) => describeFrameResult(result.result)).join(',')}`,
      );
      const pickerFrame = results.find((result) => isPickerFrameReady(result.result));
      if (pickerFrame) {
        return pickerFrame.frameId;
      }
      if (Date.now() > deadline) {
        return undefined;
      }
      await new Promise((resolve) => setTimeout(resolve, NAVIGATION_POLL_INTERVAL_MS));
    }
  }

  // Wraps picker-frame discovery + MAPS_FEED_KML delivery in a loop bounded by
  // FEED_KML_RETRY_TIMEOUT_MS: the frame `waitForPickerFrame` finds can still have its execution
  // context torn down before the message lands (hypothesis 0.2) — `sendToMapsTab` then rejects or
  // resolves `undefined`, which (unlike an explicit `{ok:false,code}` from a still-alive content
  // script) is indistinguishable from "nothing ever ran there". On that signal, rediscover
  // (re-inject) and resend rather than fail outright. Any actual reply — success or an explicit
  // content-script-observed failure — is returned immediately; it is never retried past.
  async function sendFeedKmlWithRetry(
    tabId: number,
    jobId: JobId,
    kml: string,
    fileName: string,
  ): Promise<MapsToWorkerMessage | undefined> {
    const deadline = Date.now() + FEED_KML_RETRY_TIMEOUT_MS;
    for (;;) {
      const remaining = deadline - Date.now();
      if (remaining <= 0) {
        return undefined;
      }
      logStep(jobId, 'waitForPickerFrame:start');
      const pickerFrameId = await waitForPickerFrame(tabId, remaining, jobId);
      if (pickerFrameId === undefined) {
        logStep(jobId, 'waitForPickerFrame:timeout');
        return undefined;
      }
      logStep(jobId, 'waitForPickerFrame:ok', `frameId=${pickerFrameId}`);

      logStep(jobId, 'MAPS_FEED_KML:send', `frameId=${pickerFrameId}`);
      let feedResult: MapsToWorkerMessage | undefined;
      try {
        feedResult = await sendToMapsTab(
          tabId,
          { type: 'MAPS_FEED_KML', protocolVersion: 1, jobId, kml, fileName },
          pickerFrameId,
        );
      } catch {
        feedResult = undefined;
      }
      if (feedResult) {
        return feedResult;
      }
      logStep(jobId, 'MAPS_FEED_KML:noReply', `frameId=${pickerFrameId}`);
    }
  }

  async function failImport(jobId: JobId, code: string): Promise<void> {
    logStep(jobId, 'import:failed', `code=${code}`);
    const error: StoredError = { code, message: errorMessageFor(code), retryStep: 'import', jobId, at: Date.now() };
    await sessionManager.patch({ uiStep: 'error', activeJob: undefined, lastError: error });
    broadcastToPopup({ type: 'IMPORT_FAILED', protocolVersion: 1, jobId, ...error });
  }

  async function runImportJob(jobId: JobId, mapName: string): Promise<void> {
    logStep(jobId, 'runImportJob:start');
    try {
      const session = await sessionManager.read();
      if (!session.extractResult) {
        await failImport(jobId, 'NoExtractResult');
        return;
      }

      logStep(jobId, 'open_tab:start');
      const tab = await browser.tabs.create({ url: MY_MAPS_HOME_URL });
      if (tab.id === undefined) {
        await failImport(jobId, 'MyMapsTabOpenFailed');
        return;
      }
      const tabId = tab.id;
      logStep(jobId, 'open_tab:ok', `tabId=${tabId}`);
      broadcastToPopup({ type: 'IMPORT_PRELUDE_STARTED', protocolVersion: 1, jobId });

      await waitForTabLoaded(tabId);
      await ensureContentScript(tabId, MYMAPS_CONTENT_SCRIPT);

      // MAPS_PREPARE_RESULT ok:true means the content script found the create-map control and
      // triggered its click; the click's navigation destroys that script's context before it can
      // observe the outcome, so the worker must poll the tab URL itself and re-inject a fresh
      // content script into the new document before continuing.
      logStep(jobId, 'MAPS_PREPARE_IMPORT:send');
      const prepareResult = await sendToMapsTab(
        tabId,
        { type: 'MAPS_PREPARE_IMPORT', protocolVersion: 1, jobId },
        TOP_FRAME_ID,
      );
      if (!prepareResult || prepareResult.type !== 'MAPS_PREPARE_RESULT' || !prepareResult.ok) {
        await failImport(jobId, prepareResult?.type === 'MAPS_PREPARE_RESULT' ? prepareResult.code : 'InternalError');
        return;
      }
      logStep(jobId, 'MAPS_PREPARE_IMPORT:ok');

      logStep(jobId, 'waitForMapCreatedUrl:start');
      const mapCreated = await waitForMapCreatedUrl(tabId, MAP_CREATION_TIMEOUT_MS);
      if (!mapCreated) {
        logStep(jobId, 'waitForMapCreatedUrl:timeout');
        await failImport(jobId, 'MyMapsUiChanged');
        return;
      }
      logStep(jobId, 'waitForMapCreatedUrl:ok');
      await ensureContentScript(tabId, MYMAPS_CONTENT_SCRIPT);

      // Rename the map to the user's chosen name before opening the KML import dialog, so the
      // two modal dialogs (title edit, then import) never interleave. Treated as an explicit hard
      // failure, not a best-effort skip: the eventual import_succeeded popup screen asserts
      // 「{mapName}」に{shopCount}件... — if the rename silently failed, that message would name a
      // map that doesn't exist, which is exactly the "no silent false success" ADR-0003 forbids.
      logStep(jobId, 'MAPS_SET_MAP_TITLE:send');
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
      logStep(jobId, 'MAPS_SET_MAP_TITLE:ok');

      // Opening the import dialog (top frame) is what makes Google start loading the KML upload
      // picker — a cross-origin docs.google.com/picker iframe (see messaging protocol §6 / spike
      // results). The file input the user "sees" next only exists inside that iframe, not here.
      logStep(jobId, 'MAPS_OPEN_IMPORT_DIALOG:send');
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
      logStep(jobId, 'MAPS_OPEN_IMPORT_DIALOG:ok');

      const kml = new KmlBuilder().build(mapName, session.extractResult.shops);
      const fileName = `${mapName.replace(/[/\\]/g, '_')}.kml`;
      const feedResult = await sendFeedKmlWithRetry(tabId, jobId, kml, fileName);
      // Re-log the picker frame's own step trace here — its console.log only ever reached the
      // (invisible-to-the-user) picker frame's own console; see mymaps.content.ts's logStep
      // comment and hypothesis 4 / spike results §3 third addendum.
      if (feedResult?.type === 'MAPS_FEED_KML_RESULT' && feedResult.diagnostics) {
        for (const line of feedResult.diagnostics) {
          console.log(line);
        }
      }
      if (!feedResult) {
        await failImport(jobId, 'MyMapsUiChanged');
        return;
      }
      if (feedResult.type !== 'MAPS_FEED_KML_RESULT' || !feedResult.ok) {
        await failImport(jobId, feedResult.type === 'MAPS_FEED_KML_RESULT' ? feedResult.code : 'InternalError');
        return;
      }
      logStep(jobId, 'MAPS_FEED_KML:ok');

      // Success renders back in the top frame (the layer title changing), not the picker iframe.
      logStep(jobId, 'MAPS_AWAIT_IMPORT_RESULT:send');
      const importResult = await sendToMapsTab(
        tabId,
        { type: 'MAPS_AWAIT_IMPORT_RESULT', protocolVersion: 1, jobId },
        TOP_FRAME_ID,
      );
      if (!importResult || importResult.type !== 'MAPS_IMPORT_RESULT' || !importResult.ok) {
        await failImport(jobId, importResult?.type === 'MAPS_IMPORT_RESULT' ? importResult.code : 'InternalError');
        return;
      }
      logStep(jobId, 'MAPS_AWAIT_IMPORT_RESULT:ok');

      await sessionManager.patch({ uiStep: 'import_succeeded', activeJob: undefined, lastError: undefined });
      broadcastToPopup({ type: 'IMPORT_SUCCEEDED', protocolVersion: 1, jobId });
      logStep(jobId, 'runImportJob:succeeded');
    } catch {
      logStep(jobId, 'runImportJob:exception');
      await failImport(jobId, 'InternalError');
    }
  }
});
