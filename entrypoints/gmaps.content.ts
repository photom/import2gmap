// Automates the Google Maps native saved-list UI (ADR-0008 — supersedes the old My Maps import
// path). Unlike the old mymaps.content.ts, this flow is a genuine single-page app: opening the
// menu, opening the Saved pane, creating a list, and renaming it are all in-place DOM mutations,
// never a full document navigation — so there is no cross-origin iframe and no re-injection dance
// to manage here. One request (GMAPS_ENSURE_LIST) gets exactly one reply once the whole sequence
// either succeeds or fails explicitly.
//
// Two distinct layouts were captured for reaching the saved-lists pane (see spike notes): a
// narrow/compact layout where a "Saved" entry only becomes reachable after opening a hamburger
// Menu, and a wider "navigation rail" layout where "Saved" is already directly clickable with no
// menu to open. `openSavedListsPane` below tries the direct trigger first (short poll) and only
// falls back to opening Menu if that doesn't appear — see `isSavedTrigger` / `isMenuButton`.
//
// The rename step (click "New list" -> the title is already an auto-focused, pre-filled
// <input>/<textarea> -> set its value -> Done) went through several field-debugged revisions the
// same day (2026-08-30) — see the spike notes' §4 "Debugging history" for the full account,
// including why every earlier manual DOM capture of this step was misleading (opening DevTools to
// inspect it blurs the very field being inspected). The remaining confirmed wrinkle: this tab's
// own saved-lists pane display does not reliably reflect the rename afterward — not immediately,
// not after waiting, not after a window resize; only a full page reload does. `createList` below
// therefore reports success based on the DOM-level write having verifiably stuck (not on
// re-parsing this tab's own, provably-stale-until-reload pane) — entrypoints/background.ts is
// responsible for the authoritative reload-and-reverify step afterward.

import {
  isDoneButton,
  isMenuButton,
  isNewListButton,
  isSavedTrigger,
  isUntitledListPlaceholder,
} from '@/src/domain/google-maps/google-maps-detectors';
import {
  detailPaneTitle,
  findListButtonByName,
  findListDetailPaneRoot,
  findSavedListsPaneRoot,
  hasListNamed,
  isListDetailPaneFor,
} from '@/src/domain/google-maps/saved-lists-pane';
import {
  hasPlaceNamed,
  isAddPlaceButton,
  isAddPlaceButtonPressed,
  isAddPlaceSearchInput,
  parseSuggestionRows,
} from '@/src/domain/google-maps/add-place-search';
import {
  isWorkerToGoogleMapsAddShopMessage,
  isWorkerToGoogleMapsMessage,
} from '@/src/domain/messaging/message-types';
import type {
  GoogleMapsAddShopResultMessage,
  GoogleMapsDiagnosticMessage,
  GoogleMapsToWorkerMessage,
  JobId,
} from '@/src/domain/messaging/message-types';

const POLL_INTERVAL_MS = 300;
// How long to wait for the Saved trigger to already be visible (wide/nav-rail layout) before
// giving up on that shortcut and clicking Menu instead (compact layout).
const DIRECT_SAVED_TRIGGER_TIMEOUT_MS = 3_000;
const OPEN_PANE_TIMEOUT_MS = 15_000;
// 2026-08-30: bumped from 15s after a field report that the "Untitled list" trigger sometimes
// takes longer than that to appear (new-list creation plausibly involves a network round trip
// before the detail view renders) — see spike notes §4.
const RENAME_TIMEOUT_MS = 30_000;
// How long to wait after a plain `.click()` on the "Untitled list" trigger before escalating to a
// fuller pointer/mouse event sequence (see dispatchPointerClickSequence).
const CLICK_ACTIVATION_STEP_TIMEOUT_MS = 3_000;
// 2026-08-30: how long createList spends on a best-effort, non-blocking check of whether this
// tab's own saved-lists pane already reflects the rename before returning. It usually doesn't —
// confirmed by field reports that neither waiting, nor a real window resize, nor a synthetic one,
// made it catch up; only a full page reload does (see entrypoints/background.ts's post-create
// reload-and-reverify step, which is the actual authoritative check). This local check exists only
// for the (apparently rare) case where it already updated, and for diagnostics.
const RENAME_DISPLAY_QUICK_CHECK_MS = 5_000;
// ADR-0008 step 2 (per-shop search + add) timeouts. Unconfirmed against a live account — see
// spike notes §6 (search & add) once written.
const OPEN_LIST_DETAIL_TIMEOUT_MS = 15_000;
const ADD_PLACE_SEARCH_OPEN_TIMEOUT_MS = 10_000;
const SUGGESTIONS_TIMEOUT_MS = 15_000;
const ADD_CONFIRM_TIMEOUT_MS = 15_000;
const REGISTERED_FLAG = '__import2gmapGmapsRegistered';

// Diagnostic-only: this content script's own console.log only reaches the page's own (not always
// checked) DevTools console, so every step is also (a) streamed live to the worker as a
// fire-and-forget GMAPS_DIAGNOSTIC message, re-logged immediately to the service-worker console —
// added 2026-08-30 after a field report where the final GMAPS_ENSURE_LIST_RESULT reply never
// reached the worker at all, so the previous batch-only approach (b) never showed anything despite
// steps having actually happened — and (b) still buffered per job and attached to the final
// reply's `diagnostics` field as a redundant backup for the normal case where the reply does
// arrive. Never pass page HTML, shop data, or list names here — only step names and
// boolean/role/jsaction strings (see docs/reference/extension-error-codes.md §1's "Logging" rule).
const diagnosticsByJob = new Map<JobId, string[]>();
function logStep(jobId: JobId, step: string, detail?: string): void {
  const line = `step=${step}${detail !== undefined ? ` ${detail}` : ''}`;
  console.log(`[import2gmap] ${line}`);
  const diagnostic: GoogleMapsDiagnosticMessage = { type: 'GMAPS_DIAGNOSTIC', protocolVersion: 1, jobId, line };
  void browser.runtime.sendMessage(diagnostic).catch(() => {
    // No listener alive to receive it (e.g. worker briefly restarting) — the batched
    // `diagnostics` field on the final reply is the fallback for this rare case.
  });
  const buffered = diagnosticsByJob.get(jobId) ?? [];
  buffered.push(line);
  diagnosticsByJob.set(jobId, buffered);
}
function takeDiagnostics(jobId: JobId): string[] {
  const lines = diagnosticsByJob.get(jobId) ?? [];
  diagnosticsByJob.delete(jobId);
  return lines;
}

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

// 2026-08-30: a `getClientRects().length > 0` "is this actually rendered" filter was tried here
// (speculating that both layout variants' DOM might be mounted at once — see spike notes §1) but
// a live run then failed to find the trigger at all in a case where it should have been present,
// suggesting that filter produced a false negative (or the real issue was timing, not duplication
// — not distinguished). Removed rather than kept as an unproven, actively-regressing guess; see
// findUntitledListTrigger's fallback diagnostics below for what to check if duplication turns out
// to still be the real issue.

function findButton(predicate: (el: Element) => boolean): HTMLElement | null {
  for (const button of document.querySelectorAll<HTMLElement>('button')) {
    if (predicate(button)) return button;
  }
  return null;
}

// The clickable trigger that opens the rename UI — a <button> (aria-label or its own text reads
// "Untitled list"), never the plain display span/div inside it (see file header note).
function findUntitledListTrigger(): HTMLElement | null {
  for (const el of document.querySelectorAll<HTMLElement>('button, [role="button"]')) {
    if (isUntitledListPlaceholder(el.getAttribute('aria-label')) || isUntitledListPlaceholder(el.textContent)) {
      return el;
    }
  }
  return null;
}

// Excluded from every editable-field search below: the top-level Google Maps search box is a
// stray <input> that would otherwise be a false-positive match for "any input on the page".
function isSearchBox(el: Element): boolean {
  return el instanceof HTMLInputElement && el.getAttribute('name') === 'q';
}

type EditableField = HTMLInputElement | HTMLTextAreaElement;

function allEditableFields(): EditableField[] {
  return [...document.querySelectorAll<EditableField>('input, textarea')].filter((el) => !isSearchBox(el));
}

// Primary strategy: whatever editable field appeared that wasn't there before the trigger click —
// works whether it's a genuinely new DOM node (an inline input swapped in, a dialog opening) or
// not, as long as `before` was captured immediately beforehand.
function findNewEditableField(before: ReadonlySet<Element>): EditableField | null {
  return allEditableFields().find((el) => !before.has(el)) ?? null;
}

// Fallback strategy: an already-existing-but-hidden field that became visible/populated rather
// than a freshly created node — identified by still carrying the "Untitled list" placeholder as
// its current value.
function findEditableFieldWithPlaceholderValue(): EditableField | null {
  return allEditableFields().find((el) => isUntitledListPlaceholder(el.value)) ?? null;
}

function setEditableText(el: EditableField, value: string): void {
  el.value = value;
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
}

// Escalation for a jsaction-driven control whose handler didn't seem to fire from a plain
// `.click()` — the old My Maps automation hit this exact class of bug with a delegated listbox
// listener (see the (now-deleted) spike results' `activateUploadPaneNav`): a bare synthetic click
// doesn't always satisfy what jsaction's event dispatcher checks for. Fires a fuller, bubbling
// pointer/mouse sequence instead of relying on `HTMLElement.click()` alone.
function dispatchPointerClickSequence(el: HTMLElement): void {
  const rect = el.getBoundingClientRect();
  const point = { clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2 };
  const init: PointerEventInit & MouseEventInit = { bubbles: true, cancelable: true, composed: true, view: window, ...point };
  el.dispatchEvent(new PointerEvent('pointerdown', init));
  el.dispatchEvent(new MouseEvent('mousedown', init));
  el.dispatchEvent(new PointerEvent('pointerup', init));
  el.dispatchEvent(new MouseEvent('mouseup', init));
  el.dispatchEvent(new MouseEvent('click', init));
}

function fail(jobId: JobId, code: string): GoogleMapsToWorkerMessage {
  return { type: 'GMAPS_ENSURE_LIST_RESULT', protocolVersion: 1, jobId, ok: false, code, diagnostics: takeDiagnostics(jobId) };
}

function succeed(jobId: JobId, created: boolean): GoogleMapsToWorkerMessage {
  return {
    type: 'GMAPS_ENSURE_LIST_RESULT',
    protocolVersion: 1,
    jobId,
    ok: true,
    created,
    diagnostics: takeDiagnostics(jobId),
  };
}

// Try the direct "Saved" trigger first (wide/nav-rail layout — already visible, no menu to open),
// and only fall back to opening Menu if that doesn't show up within a short window (compact
// layout, where "Saved" only exists once the menu dropdown is open).
async function openSavedListsPane(jobId: JobId): Promise<Element | null> {
  let savedTrigger = await waitFor(() => findButton(isSavedTrigger), DIRECT_SAVED_TRIGGER_TIMEOUT_MS);
  if (savedTrigger) {
    logStep(jobId, 'saved_trigger:found_direct');
  } else {
    logStep(jobId, 'saved_trigger:not_direct_trying_menu');
    const menuButton = await waitFor(() => findButton(isMenuButton), OPEN_PANE_TIMEOUT_MS);
    if (!menuButton) {
      logStep(jobId, 'menu_button:missing');
      return null;
    }
    logStep(jobId, 'menu_button:found');
    menuButton.click();

    savedTrigger = await waitFor(() => findButton(isSavedTrigger), OPEN_PANE_TIMEOUT_MS);
    if (!savedTrigger) {
      logStep(jobId, 'saved_trigger:missing_after_menu');
      return null;
    }
    logStep(jobId, 'saved_trigger:found_after_menu');
  }

  savedTrigger.click();
  const pane = await waitFor(() => findSavedListsPaneRoot(document), OPEN_PANE_TIMEOUT_MS);
  logStep(jobId, pane ? 'saved_pane:found' : 'saved_pane:missing');
  return pane;
}

async function createList(jobId: JobId, listName: string): Promise<GoogleMapsToWorkerMessage> {
  const newListButton = findButton(isNewListButton);
  if (!newListButton) {
    logStep(jobId, 'new_list_button:missing');
    return fail(jobId, 'GoogleMapsUiChanged');
  }
  logStep(jobId, 'new_list_button:found');
  newListButton.click();

  // 2026-08-30: confirmed the title starts life ALREADY in edit mode — an auto-focused
  // <input>/<textarea> pre-filled with the placeholder — immediately after creation, not a static
  // <button> that first needs clicking. Every earlier revision of this function chased the button
  // state instead, because every manual attempt to inspect the live DOM (opening DevTools to copy
  // its HTML) itself steals focus from that field, blurring it back into the button state — the
  // observation destroyed the very state being observed, an actual Heisenbug rather than a UI
  // difference between layouts or a display-refresh lag (both of the last two theories, now
  // understood as red herrings: whatever triggered a visible update in those field reports was
  // coincidental, not the real mechanism). Look for the editable field directly first; only fall
  // back to finding-and-clicking the button if it's not there (e.g. it already blurred back before
  // this ever got a chance to run).
  let renameInput = await waitFor(findEditableFieldWithPlaceholderValue, RENAME_TIMEOUT_MS);
  if (renameInput) {
    logStep(jobId, 'rename_input:found_prefilled', renameInput.tagName);
  } else {
    logStep(jobId, 'rename_input:not_prefilled_trying_button');
    const untitledTrigger = await waitFor(findUntitledListTrigger, 3_000);
    if (untitledTrigger) {
      logStep(jobId, 'untitled_trigger:found');
      const editableBefore = new Set<Element>(allEditableFields());
      untitledTrigger.click();
      renameInput = await waitFor(() => findNewEditableField(editableBefore), CLICK_ACTIVATION_STEP_TIMEOUT_MS);
      if (!renameInput) {
        logStep(jobId, 'untitled_trigger:retry_pointer_sequence');
        dispatchPointerClickSequence(untitledTrigger);
        renameInput = await waitFor(() => findNewEditableField(editableBefore), RENAME_TIMEOUT_MS);
      }
    } else {
      logStep(jobId, 'untitled_trigger:also_missing');
    }
  }
  if (!renameInput) {
    // Ground truth for next time without needing another manual (state-destroying) DOM dump.
    const buttonCount = document.querySelectorAll('button').length;
    const inputCount = allEditableFields().length;
    logStep(jobId, 'rename_input:missing', `buttons=${buttonCount} inputs=${inputCount}`);
    return fail(jobId, 'GoogleMapsUiChanged');
  }
  logStep(jobId, 'rename_input:found', renameInput.tagName);
  setEditableText(renameInput, listName);
  // Verifies the assignment actually stuck on the element itself (never trust the click/set
  // sequence blindly) — also catches the field having been silently replaced/detached by the
  // app's own re-render between finding it and setting it, which `.value` alone wouldn't reveal.
  logStep(
    jobId,
    'rename_input:text_set',
    `stuck=${renameInput.value === listName} connected=${renameInput.isConnected}`,
  );

  const doneButton = await waitFor(() => findButton(isDoneButton), RENAME_TIMEOUT_MS);
  if (!doneButton) {
    logStep(jobId, 'done_button:missing');
    return fail(jobId, 'GoogleMapsUiChanged');
  }
  logStep(jobId, 'done_button:found');
  // Re-check right before clicking Done — if something reset the field between text_set and here
  // (an auto-save/re-render cycle, a stray blur), re-apply rather than click Done on a stale value.
  if (renameInput.isConnected && renameInput.value !== listName) {
    logStep(jobId, 'rename_input:value_reset_before_done', `length=${renameInput.value.length}`);
    setEditableText(renameInput, listName);
  }
  doneButton.click();
  logStep(jobId, 'done_button:clicked');

  // 2026-08-30: field-confirmed this tab's own saved-lists pane display does NOT reliably reflect
  // the rename afterward — not immediately, not after waiting, not after a real or synthetic
  // window resize; only reloading the page did. A full reload can't happen inside a content
  // script (it would destroy this very execution before it could reply), so the authoritative
  // check is entrypoints/background.ts's job: reload the tab and re-send GMAPS_ENSURE_LIST after
  // `created: true` comes back. This is only a quick, non-blocking, diagnostic-only look — success
  // is reported either way, based on the strong positive signals already gathered above (the value
  // write to a real, still-connected input field verifiably stuck, and Done was clicked).
  const quickPane = await waitFor(() => {
    const pane = findSavedListsPaneRoot(document);
    return pane && hasListNamed(pane, listName) ? pane : null;
  }, RENAME_DISPLAY_QUICK_CHECK_MS);
  logStep(jobId, quickPane ? 'created_list:display_already_updated' : 'created_list:display_stale_pending_reload_verify');
  return succeed(jobId, true);
}

function failAddShop(jobId: JobId, code: string): GoogleMapsAddShopResultMessage {
  return {
    type: 'GMAPS_ADD_SHOP_RESULT',
    protocolVersion: 1,
    jobId,
    ok: false,
    code,
    diagnostics: takeDiagnostics(jobId),
  };
}

function succeedAddShop(jobId: JobId, status: 'added' | 'already_present'): GoogleMapsAddShopResultMessage {
  return {
    type: 'GMAPS_ADD_SHOP_RESULT',
    protocolVersion: 1,
    jobId,
    ok: true,
    status,
    diagnostics: takeDiagnostics(jobId),
  };
}

// Reuses whatever list detail pane is already open (common case: processing shop 2, 3, ... after
// shop 1 already navigated here — this content script's execution persists across messages as
// long as nothing navigates) rather than re-opening it from the saved-lists overview every time.
async function openListDetailPane(jobId: JobId, listName: string): Promise<Element | null> {
  const existing = findListDetailPaneRoot(document);
  if (existing && isListDetailPaneFor(existing, listName)) {
    logStep(jobId, 'list_detail_pane:already_open');
    return existing;
  }

  const overviewPane = await openSavedListsPane(jobId);
  if (!overviewPane) return null;

  const listButton = findListButtonByName(overviewPane, listName);
  if (!listButton) {
    logStep(jobId, 'list_button:missing');
    return null;
  }
  logStep(jobId, 'list_button:found');
  (listButton as HTMLElement).click();

  const detailPane = await waitFor(() => {
    const pane = findListDetailPaneRoot(document);
    return pane && isListDetailPaneFor(pane, listName) ? pane : null;
  }, OPEN_LIST_DETAIL_TIMEOUT_MS);
  logStep(jobId, detailPane ? 'list_detail_pane:found' : 'list_detail_pane:missing');
  return detailPane;
}

// The "Add a place" control is a toggle (`aria-pressed`) that reveals the search box below it —
// reused across shops the same way the detail pane itself is, so it's only clicked once per pane.
async function ensureAddPlaceSearchOpen(jobId: JobId): Promise<HTMLInputElement | null> {
  const alreadyOpen = [...document.querySelectorAll('input')].find(isAddPlaceSearchInput);
  if (alreadyOpen) {
    logStep(jobId, 'add_place_search:already_open');
    return alreadyOpen;
  }

  const addPlaceButton = findButton(isAddPlaceButton);
  if (!addPlaceButton) {
    logStep(jobId, 'add_place_button:missing');
    return null;
  }
  if (isAddPlaceButtonPressed(addPlaceButton)) {
    logStep(jobId, 'add_place_button:already_pressed');
  } else {
    logStep(jobId, 'add_place_button:clicking');
    addPlaceButton.click();
  }

  const input = await waitFor(
    () => [...document.querySelectorAll('input')].find(isAddPlaceSearchInput) ?? null,
    ADD_PLACE_SEARCH_OPEN_TIMEOUT_MS,
  );
  logStep(jobId, input ? 'add_place_search:found' : 'add_place_search:missing');
  return input;
}

// ADR-0008 step 2: search this shop by name+address in the currently open list's own "Add a
// place" box and click the top suggestion. Not yet live-verified — see the (sanitized) spike
// notes once this step's own field notes are recorded. Deliberately does not force a page reload
// per shop the way the rename step's verification does (§4) — that would be impractical for a
// list of any size — so the "added" confirmation below is a direct, live re-check, not proven
// immune to the same kind of display staleness the rename step hit.
async function handleAddShop(
  jobId: JobId,
  listName: string,
  shopName: string,
  shopAddress: string,
): Promise<GoogleMapsAddShopResultMessage> {
  try {
    logStep(jobId, 'handleAddShop:start');
    const pane = await openListDetailPane(jobId, listName);
    if (!pane) return failAddShop(jobId, 'GoogleMapsUiChanged');

    if (hasPlaceNamed(pane, shopName)) {
      logStep(jobId, 'shop:already_present');
      return succeedAddShop(jobId, 'already_present');
    }

    const searchInput = await ensureAddPlaceSearchOpen(jobId);
    if (!searchInput) return failAddShop(jobId, 'GoogleMapsUiChanged');

    setEditableText(searchInput, `${shopName} ${shopAddress}`);
    logStep(jobId, 'search_input:text_set');

    const suggestions = await waitFor(() => {
      const rows = parseSuggestionRows(document);
      return rows.length > 0 ? rows : null;
    }, SUGGESTIONS_TIMEOUT_MS);
    if (!suggestions) {
      logStep(jobId, 'suggestions:missing');
      return failAddShop(jobId, 'GoogleMapsUiChanged');
    }
    logStep(jobId, 'suggestions:found', `count=${suggestions.length}`);

    const topSuggestion = suggestions[0];
    (topSuggestion.element as HTMLElement).click();
    logStep(jobId, 'suggestion:clicked');

    // 2026-08-30 field observation: the search box visibly clears the moment an add completes —
    // a faster signal than waiting for the place-card list itself to re-render (which worked, but
    // felt slow moving on to the next shop). Race both: whichever confirms first wins. Re-derive
    // both the input and the pane fresh on every poll tick rather than reusing the references
    // captured above — a re-render on adding a place could in principle replace either node, the
    // same class of risk the rename step's staleness bug came from (see spike notes §4).
    const confirmed = await waitFor(() => {
      const currentInput = searchInput.isConnected
        ? searchInput
        : ([...document.querySelectorAll('input')].find(isAddPlaceSearchInput) ?? searchInput);
      if (currentInput.value.trim().length === 0) return true;
      const currentPane = findListDetailPaneRoot(document);
      return currentPane && hasPlaceNamed(currentPane, shopName) ? true : null;
    }, ADD_CONFIRM_TIMEOUT_MS);
    if (!confirmed) {
      logStep(jobId, 'shop:not_confirmed');
      return failAddShop(jobId, 'GoogleMapsUiChanged');
    }
    logStep(jobId, 'shop:added');
    return succeedAddShop(jobId, 'added');
  } catch {
    logStep(jobId, 'handleAddShop:exception');
    return failAddShop(jobId, 'InternalError');
  }
}

async function handleEnsureList(jobId: JobId, listName: string): Promise<GoogleMapsToWorkerMessage> {
  try {
    logStep(jobId, 'handleEnsureList:start');
    const pane = await openSavedListsPane(jobId);
    if (!pane) return fail(jobId, 'GoogleMapsUiChanged');

    if (hasListNamed(pane, listName)) {
      logStep(jobId, 'list:already_exists');
      return succeed(jobId, false);
    }

    logStep(jobId, 'list:not_found_creating');
    return await createList(jobId, listName);
  } catch {
    logStep(jobId, 'handleEnsureList:exception');
    return fail(jobId, 'InternalError');
  }
}

export default defineContentScript({
  registration: 'runtime',
  main() {
    if (isAlreadyRegisteredInThisDocument()) return;
    markRegisteredInThisDocument();

    browser.runtime.onMessage.addListener((rawMessage, _sender, sendResponse) => {
      if (isWorkerToGoogleMapsMessage(rawMessage)) {
        void handleEnsureList(rawMessage.jobId, rawMessage.listName).then(sendResponse);
        return true;
      }
      if (isWorkerToGoogleMapsAddShopMessage(rawMessage)) {
        void handleAddShop(rawMessage.jobId, rawMessage.listName, rawMessage.shopName, rawMessage.shopAddress).then(
          sendResponse,
        );
        return true;
      }
      return undefined;
    });
  },
});
