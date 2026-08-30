import { SessionStorageManager } from '@/src/infrastructure/storage/session-storage-manager';
import { detectTabContext } from '@/src/application/tab-context-detector';
import { route, routePermissionGranted } from '@/src/application/message-router';
import type { RouteDeps, RouteResult } from '@/src/application/message-router';
import { isGoogleMapsDiagnosticMessage, isPopupToWorkerMessage } from '@/src/domain/messaging/message-types';
import type {
  ContentToWorkerMessage,
  GoogleMapsAddShopResultMessage,
  GoogleMapsToWorkerMessage,
  JobId,
  PopupToWorkerMessage,
  WorkerToPopupMessage,
} from '@/src/domain/messaging/message-types';
import type { CollectionRef } from '@/src/domain/models/extracted-shop';
import type { StoredError, StoredShop } from '@/src/domain/models/session';
import { errorMessageFor } from '@/src/domain/errors/error-messages';
import { TARGET_SAVED_LIST_NAME } from '@/src/domain/google-maps/constants';
import { TABELOG_ORIGINS } from '@/src/infrastructure/permissions/tabelog-origins';
import { GOOGLE_MAPS_ORIGINS } from '@/src/infrastructure/permissions/google-maps-origins';

const TABELOG_CONTENT_SCRIPT = '/content-scripts/tabelog.js';
const GMAPS_CONTENT_SCRIPT = '/content-scripts/gmaps.js';
const TAB_NAVIGATION_TIMEOUT_MS = 15_000;
const NAVIGATION_POLL_INTERVAL_MS = 300;
// Safety bound on returnToFirstPage's prev-arrow fallback loop (one page per round trip) — see
// its comment. Generous enough for very long saved lists; only ever hit on a genuine drift/stall,
// since each successful step strictly decreases the remaining distance to page 1.
const MAX_RETURN_TO_FIRST_PAGE_STEPS = 50;
const GOOGLE_MAPS_HOME_URL = 'https://www.google.com/maps';
// The bare /maps URL commonly client-redirects to a location-specific URL (e.g. /maps/@lat,lng,z)
// shortly after "load" — if that redirect is a real navigation, it tears down whatever was just
// injected. Best-effort (never fails the job): wait for the tab's URL to stop changing for
// GMAPS_URL_QUIET_MS before injecting, bounded by GMAPS_URL_SETTLE_TIMEOUT_MS.
const GMAPS_URL_SETTLE_TIMEOUT_MS = 5_000;
const GMAPS_URL_QUIET_MS = 800;
// Generous upper bound on entrypoints/gmaps.content.ts's own worst-case internal wait budget
// (every step's bounded poll summed) — a wrapper-level timeout this far out essentially only ever
// fires when the message never reached a live listener at all (e.g. the tab navigated again after
// injection, tearing the listener down), not from legitimate UI slowness. One retry (re-inject +
// resend) covers exactly that case.
const GMAPS_ATTEMPT_TIMEOUT_MS = 120_000;
const GMAPS_MAX_ATTEMPTS = 2;

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

  // Streamed live from entrypoints/gmaps.content.ts's `logStep`, independent of whether the final
  // GMAPS_ENSURE_LIST_RESULT reply ever arrives — see that file's comment. Fire-and-forget: no
  // sendResponse, no `return true`.
  browser.runtime.onMessage.addListener((rawMessage) => {
    if (!isGoogleMapsDiagnosticMessage(rawMessage)) {
      return undefined;
    }
    console.log(rawMessage.line);
    return undefined;
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
    if (result.tabCommand?.kind === 'ensure_saved_list') {
      void runEnsureListJob(result.tabCommand.jobId);
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
    const requiredOrigins = pending.step === 'extract' ? TABELOG_ORIGINS : GOOGLE_MAPS_ORIGINS;
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


  async function failImport(jobId: JobId, code: string): Promise<void> {
    logStep(jobId, 'import:failed', `code=${code}`);
    const error: StoredError = { code, message: errorMessageFor(code), retryStep: 'import', jobId, at: Date.now() };
    await sessionManager.patch({ uiStep: 'error', activeJob: undefined, lastError: error });
    broadcastToPopup({ type: 'IMPORT_FAILED', protocolVersion: 1, jobId, ...error });
  }

  // Best-effort only — never throws, never fails the job. See GMAPS_URL_SETTLE_TIMEOUT_MS comment:
  // the bare /maps URL can still be mid-redirect right after `waitForTabLoaded` resolves.
  async function waitForUrlToSettle(tabId: number): Promise<void> {
    const deadline = Date.now() + GMAPS_URL_SETTLE_TIMEOUT_MS;
    let lastUrl: string | undefined;
    let stableSince = Date.now();
    for (;;) {
      const tab = await browser.tabs.get(tabId).catch(() => undefined);
      if (tab?.url !== lastUrl) {
        lastUrl = tab?.url;
        stableSince = Date.now();
      }
      if (Date.now() - stableSince >= GMAPS_URL_QUIET_MS) return;
      if (Date.now() > deadline) return;
      await new Promise((resolve) => setTimeout(resolve, NAVIGATION_POLL_INTERVAL_MS));
    }
  }

  // Races one GMAPS_ENSURE_LIST send against a hard timeout, and swallows a rejection (e.g. "no
  // receiving end") into `undefined` too — both cases mean "no reply", the single signal the
  // retry loop below acts on. tabs.sendMessage can otherwise hang indefinitely with zero
  // diagnostic output if the target frame's listener died between injection and send (e.g. a
  // navigation tore it down) — this bounds that.
  async function sendGmapsMessageOnce<T>(tabId: number, message: unknown, timeoutMs: number): Promise<T | undefined> {
    const sendPromise = (async (): Promise<T | undefined> => {
      try {
        return (await browser.tabs.sendMessage(tabId, message)) as T | undefined;
      } catch {
        return undefined;
      }
    })();
    return Promise.race([
      sendPromise,
      new Promise<undefined>((resolve) => setTimeout(() => resolve(undefined), timeoutMs)),
    ]);
  }

  async function sendEnsureListWithRetry(
    tabId: number,
    jobId: JobId,
    listName: string,
  ): Promise<GoogleMapsToWorkerMessage | undefined> {
    const message = { type: 'GMAPS_ENSURE_LIST', protocolVersion: 1, jobId, listName };
    for (let attempt = 1; attempt <= GMAPS_MAX_ATTEMPTS; attempt++) {
      if (attempt > 1) {
        logStep(jobId, 'GMAPS_ENSURE_LIST:retry', `attempt=${attempt}`);
        await ensureContentScript(tabId, GMAPS_CONTENT_SCRIPT);
      }
      logStep(jobId, 'GMAPS_ENSURE_LIST:send', `attempt=${attempt}`);
      const reply = await sendGmapsMessageOnce<GoogleMapsToWorkerMessage>(tabId, message, GMAPS_ATTEMPT_TIMEOUT_MS);
      if (reply) return reply;
      logStep(jobId, 'GMAPS_ENSURE_LIST:no_reply', `attempt=${attempt}`);
    }
    return undefined;
  }

  // ADR-0008 step 2 (per-shop search + add). Same retry shape as sendEnsureListWithRetry, for the
  // same reason (a torn-down listener otherwise hangs tabs.sendMessage indefinitely).
  async function sendAddShopWithRetry(
    tabId: number,
    jobId: JobId,
    listName: string,
    shopName: string,
    shopAddress: string,
  ): Promise<GoogleMapsAddShopResultMessage | undefined> {
    const message = { type: 'GMAPS_ADD_SHOP', protocolVersion: 1, jobId, listName, shopName, shopAddress };
    for (let attempt = 1; attempt <= GMAPS_MAX_ATTEMPTS; attempt++) {
      if (attempt > 1) {
        logStep(jobId, 'GMAPS_ADD_SHOP:retry', `attempt=${attempt}`);
        await ensureContentScript(tabId, GMAPS_CONTENT_SCRIPT);
      }
      const reply = await sendGmapsMessageOnce<GoogleMapsAddShopResultMessage>(
        tabId,
        message,
        GMAPS_ATTEMPT_TIMEOUT_MS,
      );
      if (reply) return reply;
      logStep(jobId, 'GMAPS_ADD_SHOP:no_reply', `attempt=${attempt}`);
    }
    return undefined;
  }

  // The Google Maps saved-list flow (ADR-0008) never leaves the top frame and never navigates to
  // a new document once its content script is actually running — opening the menu, opening the
  // Saved pane, and creating/renaming a list are all in-place SPA mutations — so, unlike the
  // superseded My Maps flow, there is no frame targeting and no multi-message sequencing here.
  // The one navigation risk is the initial /maps -> /maps/@lat,lng,z redirect racing the first
  // injection, handled by waitForUrlToSettle + sendEnsureListWithRetry's re-inject-and-resend.
  async function runEnsureListJob(jobId: JobId): Promise<void> {
    logStep(jobId, 'runEnsureListJob:start');
    try {
      const session = await sessionManager.read();
      if (!session.extractResult) {
        await failImport(jobId, 'NoExtractResult');
        return;
      }

      logStep(jobId, 'open_tab:start');
      const tab = await browser.tabs.create({ url: GOOGLE_MAPS_HOME_URL });
      if (tab.id === undefined) {
        await failImport(jobId, 'GoogleMapsTabOpenFailed');
        return;
      }
      const tabId = tab.id;
      logStep(jobId, 'open_tab:ok', `tabId=${tabId}`);
      broadcastToPopup({ type: 'IMPORT_PRELUDE_STARTED', protocolVersion: 1, jobId });

      await waitForTabLoaded(tabId);
      await waitForUrlToSettle(tabId);
      await ensureContentScript(tabId, GMAPS_CONTENT_SCRIPT);

      const result = await sendEnsureListWithRetry(tabId, jobId, TARGET_SAVED_LIST_NAME);

      // Re-log the content script's own step trace here — its console.log only reaches the page's
      // own DevTools console, which isn't always what gets checked when debugging a field report.
      if (result?.diagnostics) {
        for (const line of result.diagnostics) {
          console.log(line);
        }
      }

      if (!result || result.type !== 'GMAPS_ENSURE_LIST_RESULT') {
        await failImport(jobId, 'GoogleMapsUiChanged');
        return;
      }
      if (!result.ok) {
        await failImport(jobId, result.code);
        return;
      }
      logStep(jobId, 'GMAPS_ENSURE_LIST:ok', `created=${result.created}`);

      // 2026-08-30, field-confirmed: right after creating+renaming a list, this tab's own
      // saved-lists pane does NOT reliably show the new name — not immediately, not after
      // waiting, not after a real or synthetic window resize; only reloading the page did (see
      // gmaps.content.ts's file header and the spike notes' §4 debugging history). A freshly
      // created list is the only case that needs this: an already-existing list (`created: false`)
      // was already confirmed present by a normal, non-stale read of the pane.
      if (result.created) {
        logStep(jobId, 'reload_verify:start');
        await browser.tabs.reload(tabId);
        await waitForTabLoaded(tabId);
        await waitForUrlToSettle(tabId);
        await ensureContentScript(tabId, GMAPS_CONTENT_SCRIPT);

        const reloadResult = await sendEnsureListWithRetry(tabId, jobId, TARGET_SAVED_LIST_NAME);
        if (reloadResult?.diagnostics) {
          for (const line of reloadResult.diagnostics) {
            console.log(line);
          }
        }
        if (!reloadResult || reloadResult.type !== 'GMAPS_ENSURE_LIST_RESULT' || !reloadResult.ok) {
          logStep(jobId, 'reload_verify:failed');
          await failImport(
            jobId,
            reloadResult?.type === 'GMAPS_ENSURE_LIST_RESULT' && !reloadResult.ok
              ? reloadResult.code
              : 'GoogleMapsUiChanged',
          );
          return;
        }
        logStep(jobId, 'reload_verify:ok');
      }

      // ADR-0008 step 2: search + add each extracted shop. A per-shop failure (no search match,
      // an add that never confirmed, etc.) is tallied and reported in the final summary — it does
      // NOT abort the whole job, per ADR-0008's "skip that shop... never a guess" policy; only a
      // structural failure earlier (list itself unreachable) does that.
      const shops = session.extractResult.shops;
      logStep(jobId, 'add_shops:start', `total=${shops.length}`);
      let addedCount = 0;
      let skippedCount = 0;
      let failedCount = 0;
      for (let i = 0; i < shops.length; i++) {
        const shop = shops[i];
        const shopResult = await sendAddShopWithRetry(tabId, jobId, TARGET_SAVED_LIST_NAME, shop.name, shop.address);
        if (shopResult?.diagnostics) {
          for (const line of shopResult.diagnostics) {
            console.log(line);
          }
        }
        if (shopResult?.type === 'GMAPS_ADD_SHOP_RESULT' && shopResult.ok) {
          if (shopResult.status === 'added') addedCount++;
          else skippedCount++;
        } else {
          failedCount++;
          const code = shopResult?.type === 'GMAPS_ADD_SHOP_RESULT' && !shopResult.ok ? shopResult.code : 'no_reply';
          logStep(jobId, 'add_shop:failed', `index=${i} code=${code}`);
        }
        broadcastToPopup({
          type: 'IMPORT_SHOPS_PROGRESS',
          protocolVersion: 1,
          jobId,
          processed: i + 1,
          total: shops.length,
        });
      }
      logStep(jobId, 'add_shops:done', `added=${addedCount} skipped=${skippedCount} failed=${failedCount}`);

      await sessionManager.patch({
        uiStep: 'import_succeeded',
        activeJob: undefined,
        lastError: undefined,
        importSummary: { addedCount, skippedCount, failedCount },
      });
      broadcastToPopup({
        type: 'IMPORT_SUCCEEDED',
        protocolVersion: 1,
        jobId,
        addedCount,
        skippedCount,
        failedCount,
      });
      logStep(jobId, 'runEnsureListJob:succeeded');
    } catch {
      logStep(jobId, 'runEnsureListJob:exception');
      await failImport(jobId, 'InternalError');
    }
  }
});
