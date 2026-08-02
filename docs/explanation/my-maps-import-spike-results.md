# My Maps Web UI Import — Feasibility Spike Results

Records the outcome of the [ADR-0004 §6](adr/0004-extension-implementation-baseline.md) My Maps feasibility spike (gate before implementing `mymaps.content.ts` automation). Findings come from manual, logged-in browser reconnaissance (2026-08-02) against the live My Maps Web UI — not from a live-fetched spec, since this UI is undocumented and Google-internal.

**Status**: Spike passed. Proceed to Phase 3 (`mymaps.content.ts`) TDD implementation.

**2026-08-02 addendum — major finding missed in the original spike**: the KML upload dialog opened by 「インポート」 is a **cross-origin `docs.google.com/picker` iframe**, not more DOM in the top `www.google.com` My Maps document. The original spike (Section 3 below, as first written) captured the file input's HTML without recording which frame it actually lived in, and the first implementation pass assumed it was reachable from the top frame — it isn't; `document.querySelector('input[type="file"][accept*="KML"]')` run from the top frame's own console (context `top`) returns `null`. This was only caught after a live user manually ran that exact query following an otherwise-working prepare/create-map flow and reported the file picker stalling at `MyMapsUiChanged`. See the revised Section 3 and "Open follow-ups" below for the corrected selector-to-frame mapping and the fix.

**2026-08-02 addendum #2 — map title rename captured and automated.** The former "Map title rename was not captured" open follow-up is now resolved; see the new Section 2b and the "Open follow-ups" entry below.

**General rule established by this point (third recurrence)**: every step of this automation so far — the Drive-consent dialog / `mid=` URL after map creation, the KML picker iframe, and now the title-rename dialog — renders with a **lag after the triggering click**, not synchronously. A single `querySelector` immediately after a click has been wrong three separate times in this file's history. Treat this as a standing rule for `mymaps.content.ts`, not a per-step judgment call: **every DOM lookup that follows a click or navigation must go through the bounded `waitForElement`/`pollUntil` poll, never a bare synchronous lookup — and a timeout is always an explicit `MyMapsUiChanged` failure, never a silent continue.**

---

## 1. Authenticated session detection

Opening `https://www.google.com/maps/d/u/0/` while logged out redirects to:

```
https://accounts.google.com/v3/signin/identifier?continue=https%3A%2F%2Fwww.google.com%2Fmaps%2Fd%2Fu%2F0%2F&...
```

**Detection rule**: after navigating/creating the tab, if the resulting `location.hostname` is `accounts.google.com` (or navigation lands outside `google.com/maps`), treat as logged out → fail with `MyMapsNotReady`. The extension never renders or fills this login form; it only observes the redirect and reports the explicit failure per ADR-0003 (no credential handling).

---

## 2. Create a new map

Button on the My Maps home (`https://www.google.com/maps/d/u/0/`):

```html
<div role="button" class="U26fgb O0WRkf oG5Srb C0oVfc QT3Do-t0O6ic-LgbsSe M9Bg4d"
     aria-label="新しい地図を作成" aria-disabled="false" tabindex="0"> ... </div>
```

**Selector**: `div[role="button"][aria-label="新しい地図を作成"]`. After click, the tab navigates to `https://www.google.com/maps/d/u/0/edit?mid={mapId}&ll=...&z=...` — presence of `mid=` in the URL confirms a new map was created.

**Drive upload consent dialog (optional step)**: clicking **新しい地図を作成** can surface a one-time Google Drive consent modal ("Creating a MyMaps map always uploads title, thumbnail, and associated metadata to Drive", English-language regardless of UI locale) before the map is actually created:

```html
<div role="button" class="U26fgb O0WRkf oG5Srb HQ8yf C0oVfc kHssdc HvOprf H5P3Id M9Bg4d"
     data-id="t0O6ic" aria-disabled="false" tabindex="0" autofocus="">
  ...<span class="RveJvd snByac">CREATE</span>
</div>
```

No `aria-label`; the only anchors are `data-id="t0O6ic"` and the (English) button text `CREATE`. This dialog does not always appear (likely gated by account/session state), so automation must **poll for it with a short bounded timeout and proceed if it never shows**, rather than treat its absence as failure — only click it when present, then continue waiting for the `mid=` URL as before.

A fresh map always has exactly one default layer with id prefix `ly0` (`ly0-layer-header`, `ly0-layerview-import-link`, `ly0-layer-status`), which the v1 "new map only" scope (per the decision checklist) can rely on without a layer picker.

---

## 2b. Rename the map title (captured 2026-08-02, resolves the former "not captured" follow-up)

Runs after the map is created and before the KML import dialog opens, so the two modal dialogs never interleave. Trigger — the map title bar, in the **top** My Maps document:

```html
<div id="map-title-desc-bar">
  <div class="i4ewOd-r4nke" data-tooltip="無題の地図" aria-label="無題の地図">無題の地図</div>
  ...
```

Clicking it opens an edit dialog **with the same rendering lag as every other step in this flow** (see the general rule in the addendum above — do not single-`querySelector` this):

```html
<div class="XKSfm-Sx9Kwc" role="dialog" aria-labelledby=":66" id="update-map" style="...">
  <div class="XKSfm-Sx9Kwc-r4nke XKSfm-Sx9Kwc-r4nke-GIHV4">
    <span class="XKSfm-Sx9Kwc-r4nke-fmcmS" id=":66" role="heading">地図のタイトルと説明を編集</span>
    <span class="XKSfm-Sx9Kwc-r4nke-TvD9Pc" role="button" tabindex="0" aria-label="Close"></span>
  </div>
  <div class="XKSfm-Sx9Kwc-bN97Pc" id=":66.contentEl">
    <label>地図タイトル</label>
    <input type="text" value="無題の地図" class="Sx9Kwc-i4ewOd-rank4-fmcmS tk3N6e-y4JFTd" placeholder="無題の地図" dir="ltr">
    <label>説明</label>
    <textarea class="Sx9Kwc-i4ewOd-Dzid5-fmcmS tk3N6e-B7I4Od VIpgJd-B7I4Od" ...></textarea>
  </div>
  <div class="XKSfm-Sx9Kwc-c6xFrd">
    <button name="save" class="VIpgJd-ldDVFe-zTETae VIpgJd-ldDVFe-JIbuQc">保存</button>
    <button name="cancel">キャンセル</button>
  </div>
</div>
```

**Selectors** (prefer these stable anchors; the hashed `Sx9Kwc-...` classes churn across Google deploys and are not depended on):

| Selector | Role |
| :--- | :--- |
| `#map-title-desc-bar .i4ewOd-r4nke` | Trigger (click to open the dialog) **and** verification (poll its text after save) |
| `#update-map` | The dialog itself (stable `id`, unlike its `aria-labelledby`, which is a per-session generated id like `:66` — never hardcode that) |
| `#update-map input[type="text"]` | The title field (scoped under the dialog so it can't match the description `<textarea>`) |
| `#update-map button[name="save"]` | Save button |

**Setting the value**: this is a Closure-compiled app, so a bare `input.value = mapName` assignment is not enough — it must be followed by dispatching **both** `new Event('input', {bubbles:true})` **and** `new Event('change', {bubbles:true})` before clicking save, or the app's internal state never picks up the new value. Leave the description `<textarea>` untouched (nothing to put there, and ADR-0003 keeps this minimal).

**Detection rule**: after clicking save, poll `#map-title-desc-bar .i4ewOd-r4nke`'s text until it equals the requested map name (trimmed) — bounded timeout, same pattern as every other step. Failure (missing trigger, missing dialog input/save button, or the title never actually changes) is an **explicit hard failure** (`MyMapsUiChanged`), not a best-effort skip: the `import_succeeded` popup screen asserts 「{mapName}」に{shopCount}件…, so a silently-failed rename would make that message name a map that doesn't exist — exactly what ADR-0003 forbids.

---

## 3. Import KML and detect success

Import link under the default layer, in the **top** My Maps document:

```html
<div id="ly0-layerview-import-link" class="..." data-tooltip="CSV ファイル、スプレッドシート、KML からデータをインポート"
     aria-label="CSV ファイル、スプレッドシート、KML からデータをインポート">インポート</div>
```

**Clicking it does not open a dialog in the same document — it loads a cross-origin IFRAME**, the Google Picker, hosting the actual upload UI:

```html
<iframe id="azo1mlmk4joc"
        src="https://docs.google.com/picker?protocol=gadgets&amp;origin=https%3A%2F%2Fwww.google.com&amp;...&amp;hostId=MapsPro&amp;nav=((%22upload%22...">
</iframe>
```

The `nav=((%22upload%22...` query parameter preselects the picker's "upload" tab, so the file input below is present without any further click inside the iframe. The file input itself lives **inside that iframe's own document** (`docs.google.com`), not the top frame:

```html
<input type="file" style="display: none" jsname="G1bupd" multiple
       accept=".CSV,.DAT,.GPX,.KML,.KMZ,.ODS,.TAB,.TSV,.TXT,.XLS,.XLT,.XLSX">
```

**Selector-to-frame mapping** (see also [messaging protocol §6](../reference/extension-messaging-protocol.md#6-service-worker--my-maps-content-script)):

| Selector | Frame |
| :--- | :--- |
| `#ly0-layerview-import-link` (open the picker) | top (`www.google.com`) |
| `input[type="file"][accept*="KML"]` (the file input) | **picker iframe** (`docs.google.com/picker...`) |
| `#ly0-layer-header .pbTTYe-r4nke` (success signal, below) | top |

Prefer the `accept` substring match over the `jsname` attribute for the file input, since `accept` is a meaningful, less likely to silently rename value; treat a missing match (in the picker frame) as `MyMapsUiChanged`.

**Consequence for automation**: a single content-script handler cannot span both frames. `mymaps.content.ts` is injected with `{ allFrames: true }` for this phase and each injected instance identifies its own frame via `detectMapsFrameRole(location.hostname)` (`'mymaps'` for anything other than `docs.google.com`, `'picker'` for `docs.google.com`); the worker discovers the picker iframe's `frameId` from the injection results (WXT surfaces a content script's `main()` return value there) and targets `MAPS_FEED_KML` at it directly via `browser.tabs.sendMessage(tabId, msg, { frameId })`. This needed one new permission — `https://docs.google.com/picker*` (path-narrowed) in `optional_host_permissions` — since `scripting.executeScript` into a frame requires host permission for that frame's origin; see [ADR-0004 §1](adr/0004-extension-implementation-baseline.md#1-permissions--content-script-injection) (2026-08-02 addendum, user-approved). No `webNavigation`, no Drive API/OAuth, no `<all_urls>`: the picker's upload posts directly to My Maps (observed request header `My-Maps-Upload-Origin: scotty`), not a Drive API call.

**Feeding the file**: construct an in-memory KML `File`/`Blob`, assign it via a `DataTransfer` (`dataTransfer.items.add(file); input.files = dataTransfer.files;`), then dispatch a `change` event on the input — the standard technique for scripting a native file input, since `input.files` is otherwise read-only. This runs inside the picker frame's `MAPS_FEED_KML` handler.

**Success signal**: back in the **top** frame, the layer title element's text changes from the default to the uploaded file's name:

```html
<div id="ly0-layer-header" class="pbTTYe-tJHJj">
  <div id="ly0-layer-status">...</div>
  <div class="pbTTYe-r4nke" data-tooltip="無題のレイヤ" aria-label="無題のレイヤ">無題のレイヤ</div>
  ...
</div>
```

**Detection rule**: poll (or `MutationObserver`) `#ly0-layer-header .pbTTYe-r4nke` (also check the mirrored `aria-label`/`data-tooltip`) until its text no longer equals the pre-upload default (`無題のレイヤ`) — bounded by a timeout. Verified manually: importing a 5-placemark/1-polygon KML renamed the layer to the uploaded filename and listed every placemark by name in the sidebar.

---

## 4. Unexpected DOM / failure handling

Selecting a non-KML file (`eicar.txt`) produced an inline toast: `選択したファイル「eicar.txt」のアップロードはサポートされていません。` with a 閉じる (close) action. The toast's exact selector was not captured (transient, unlabeled by id/class in the sample), so v1 automation does **not** parse it directly.

**Chosen detection strategy**: rely on the **bounded timeout** from Section 3 as the single explicit-failure signal — if the success text change does not occur within the timeout, fail with `MyMapsUiChanged` (or a more specific import-failure code) rather than trying to positively match every possible Google-side error toast. This satisfies ADR-0003's "no silent partial success" rule without depending on fragile, uncaptured toast markup.

---

## 5. Chrome Web Store / target-site policy risk note

- This automation scripts an **undocumented, internal, Closure-compiled Google UI** (hashed class names like `UywwFc-LgbsSe-OWXEXe-dgl2Hf` churn across Google deploys; only `aria-label`, `data-tooltip`, and a handful of stable `id`s like `ly0-layer-header` were usable as anchors). It **will** break silently-to-us whenever Google changes this markup, which is exactly why every step above fails explicitly on a missing selector or timeout instead of guessing.
- The extension only acts after an explicit user click (抽出する / My Maps へインポート) and never touches Google's login form, cookies, or OAuth — consistent with ADR-0003's privacy stance.
- Google's general Terms of Service restrict automated/scripted access to their services in some contexts; this extension's automation is scoped to a single user's own authenticated session, triggered manually, mimicking normal UI interaction (not bulk/headless scraping). Before any Chrome Web Store listing (still deferred per the decision checklist), this should get a dedicated policy review — this note is not a legal sign-off, just the spike-required flag for that future review.

---

## Open follow-ups (not blocking the spike, but worth tracking)

- Toast/error markup for import failures was not captured; if precise failure-reason messaging is wanted later, redo this recon with DevTools open during a failed import.
- `ly0` layer-id assumption only holds for a freshly created map (v1 scope); an existing-map/multi-layer picker (out of scope, decision checklist) would need re-recon.
- **DOM readiness race after map creation.** The URL gains `mid=` before the layer panel (`#ly0-layerview-import-link`) finishes rendering; acting immediately on the URL change can click nothing / silently no-op. Fix: the content script that handles `MAPS_OPEN_IMPORT_DIALOG` (freshly re-injected after the worker observes `mid=`, see below) polls for the import link itself before doing anything else — same bounded-poll pattern (not a single `querySelector`) used around every DOM lookup in `mymaps.content.ts`, including the file input (now inside the picker iframe's `MAPS_FEED_KML` handler, per the cross-origin-iframe finding below).
- **The KML upload dialog is a cross-origin iframe — resolved 2026-08-02, see the addendum at the top of this doc and the revised Section 3.** The file input the automation feeds is not reachable from the top My Maps document; it lives inside a `docs.google.com/picker` iframe that only starts loading after the import-link click and appears asynchronously. This was missed in the original spike (which captured the file input's HTML but not which frame it was in) and only surfaced once the prepare/create-map navigation bug above was fixed and the flow actually reached this step. Fixed by splitting the single `MAPS_IMPORT_KML` message into `MAPS_OPEN_IMPORT_DIALOG` (top frame, clicks the import link) → worker discovers the picker iframe's `frameId` by polling `browser.scripting.executeScript({allFrames:true,...})` injection results for the `'picker'` role → `MAPS_FEED_KML` (sent directly to that `frameId`) → `MAPS_AWAIT_IMPORT_RESULT` (top frame again, for the success signal). Needed one new approved permission, `https://docs.google.com/picker*` (see ADR-0004 §1). Any future step that needs to reach into a Google-hosted iframe should expect the same pattern: no `webNavigation`, discover the frame via a content script's `main()` return value plus a bounded re-injection poll, and request the narrowest possible `optional_host_permissions` pattern for that iframe's origin.
- **Repeatedly re-injecting to discover the picker frame also re-executes the script in the top frame every poll tick.** Without a guard, this would register a new `runtime.onMessage` listener in the top frame on every tick (Chrome's isolated-world JS realm persists across multiple `executeScript` calls into the same still-loaded document, so listeners accumulate rather than replace each other). `mymaps.content.ts` guards against this with a flag written directly onto the shared `window` DOM object (`__import2gmapMymapsRegistered`) checked at the top of `main()`, since `window`/`document` — unlike top-level `const`/`function` bindings, which are freshly re-declared on every injection — are the actual DOM objects and persist across re-injections into the same document.
- **Map title rename — resolved 2026-08-02, see Section 2b.** The confirm screen's editable map name (ADR-0004 §2) is now applied to the actual My Maps document before the KML import step runs, via the new `MAPS_SET_MAP_TITLE` / `MAPS_SET_MAP_TITLE_RESULT` messages (top frame only; selectors `#map-title-desc-bar .i4ewOd-r4nke`, `#update-map input[type="text"]`, `#update-map button[name="save"]`). The map no longer keeps Google's default title (「無題の地図」) after a successful import.
- **Navigation destroys the content script's execution context — do not reintroduce logic that runs "after" a navigating click in the same content-script invocation.** Clicking **新しい地図を作成** triggers a full document navigation (`https://www.google.com/maps/d/u/0/` → `.../edit?mid=...`). A content script injected via `browser.scripting.executeScript` (as `mymaps.content.ts` is, since ADR-0004 forbids `content_scripts` manifest entries / broad `host_permissions`) has its execution context torn down the moment that navigation happens, and WXT's `registration: 'runtime'` scripts are **not** automatically reinjected afterward. Concretely: `handlePrepareImport` in `entrypoints/mymaps.content.ts` found `mid=` had already appeared, wait for the import link, and *then* `sendResponse` — but by the time the click landed, the script was usually already gone, so `sendResponse` never fired, the background's `await` on the reply hung until the port closed, and the popup surfaced a bare `InternalError` even though the map itself had been created. Fixed by splitting the flow: the content script now only does same-document checks and replies to `MAPS_PREPARE_RESULT` **before** clicking the create-map control (click is the last thing it does, mirroring the already-correct `TAB_CLICK_NEXT` ordering in `tabelog.content.ts`); the worker (`entrypoints/background.ts`) then polls `browser.tabs.get(tabId).url` for the `mid=` URL itself and re-injects a fresh content script into the new document before sending `MAPS_IMPORT_KML`. The same pattern applies to `tabelog.content.ts`'s pagination (`TAB_CLICK_NEXT` → page navigates → the worker must re-inject before the next `TAB_EXTRACT_PAGE`). Any future step that adds another navigating click (e.g. the deferred map-title rename above) needs the same reply-before-click-then-worker-reinjects treatment.
- **A "reply arrives before the click" protocol means the worker cannot detect the navigation via `tabs.status` alone — it raced.** A first pass at the fix above re-injected as soon as `browser.tabs.get(tabId).status === 'complete'`. That's correct only for a tab's *first* load (nothing to confuse it with). For a wait that follows a reply-then-click message like `TAB_CLICK_NEXT`, the tab can still legitimately report `status: 'complete'` for the *old* document in the brief window between the reply and the click actually landing — the short-circuit fired immediately, the worker re-injected into the still-old page, and `TAB_EXTRACT_PAGE` silently re-parsed it (dedupe hid the duplicate shops rather than surfacing an error — a silent wrong result, which ADR-0003 forbids). Fix: capture the tab's URL *before* sending the navigating-click message, then wait for both `status: 'complete'` **and** the URL to differ from the captured value (bounded timeout, explicit failure — never silently continue on an ambiguous state). `entrypoints/background.ts` keeps this as two distinct helpers — `waitForTabLoaded` (status-only, first-load-only) and `waitForNavigation` (URL-and-status, for waits after a reply-before-click message) — specifically so they can't be accidentally merged back into one ambiguous helper.
