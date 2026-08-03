# My Maps Web UI Import — Feasibility Spike Results

Records the outcome of the [ADR-0004 §6](adr/0004-extension-implementation-baseline.md) My Maps feasibility spike (gate before implementing `mymaps.content.ts` automation). Findings come from manual, logged-in browser reconnaissance (2026-08-02) against the live My Maps Web UI — not from a live-fetched spec, since this UI is undocumented and Google-internal.

**Status**: Spike passed. Proceed to Phase 3 (`mymaps.content.ts`) TDD implementation.

**2026-08-02 addendum — major finding missed in the original spike**: the KML upload dialog opened by 「インポート」 is a **cross-origin `docs.google.com/picker` iframe**, not more DOM in the top `www.google.com` My Maps document. The original spike (Section 3 below, as first written) captured the file input's HTML without recording which frame it actually lived in, and the first implementation pass assumed it was reachable from the top frame — it isn't; `document.querySelector('input[type="file"][accept*="KML"]')` run from the top frame's own console (context `top`) returns `null`. This was only caught after a live user manually ran that exact query following an otherwise-working prepare/create-map flow and reported the file picker stalling at `MyMapsUiChanged`. See the revised Section 3 and "Open follow-ups" below for the corrected selector-to-frame mapping and the fix.

**2026-08-02 addendum #2 — map title rename captured and automated.** The former "Map title rename was not captured" open follow-up is now resolved; see the new Section 2b and the "Open follow-ups" entry below.

**2026-08-04 addendum — a second picker layout ("picker v2") causes `MyMapsUiChanged` at `MAPS_FEED_KML` on some accounts.** The `docs.google.com/picker` iframe documented in Section 3 below is not the only rendered layout. On another account (not this spike's own recon session — reported live, then confirmed from that account's own DOM), the picker instead renders a **source-nav listbox** (`Google ドライブ` / `アルバム` / `アップロード`) with `Google ドライブ` preselected, and the upload pane — and therefore the file input — **does not exist in the DOM at all** until the `アップロード` option is clicked. This layout's `data-config` attribute contains `"https://docs.google.com/picker/v2/"` (the original layout's does not). The picker's *configuration* still enables the upload source in both cases — `data-sources` carries the same `.KML`-inclusive `fileExts` list — only the **default rendered selection** differs, so clicking `アップロード` is the correct recovery, not a workaround. The v2 upload pane's own file-input markup was **not** directly observed (only the source-nav listbox and the dialog's `data-config`/`data-sources` attributes were), so the fix falls back from the known `input[type="file"][accept*="KML"]` selector to any `input[type="file"]` in the frame — defensive, not confirmed. See the revised Section 3 below for the corrected two-layout handling, the new nav-option selector rule, and `isPickerUploadNavLabel` (`src/domain/my-maps/my-maps-detectors.ts`).

**2026-08-04 second addendum — the picker v2 fix above did not work in the field.** The first fix (the previous addendum: find the upload-nav option, click it, then poll for the file input; layout was decided by whether *some* file input already existed) shipped, but a live user re-dumped the picker frame afterward and the import was still stalling. The live DOM showed:

```html
<div role="listbox" jsname="T0teYc" jsaction="click:cOuCgd; focusin:TxzmId; focusout:yhTeqf; keydown:I481le"
     jscontroller="ucbshf" tabindex="-1" aria-orientation="vertical" class="PpTbs rkL4We yIIGoc ycrW9">
  <div role="option" tabindex="-1" jsname="Co88hf" name="0" aria-selected="true"  class="X074ib Ss7qXc wThJje">…Google ドライブ</div>
  <div role="option" tabindex="-1" jsname="Co88hf" name="1" aria-selected="false" class="X074ib Ss7qXc wThJje">…アルバム</div>
  <hr class="uPRyu">
  <div role="option" tabindex="0"  jsname="Co88hf" name="2" aria-selected="false" class="X074ib Ss7qXc wThJje">…アップロード</div>
</div>
```

— i.e. the upload nav option (`name="2"`) was still `aria-selected="false"` and the Drive-browsing pane was still rendered: the click never actually activated it (or activated it and then something reset it — not distinguishable from this dump alone). Two candidate causes, **neither confirmed** as *the* actual root cause — the fix below addresses both rather than picking one:

- **H1**: `findKmlFileInput()`'s bare `input[type="file"]` fallback (added for picker v2's never-directly-observed upload-pane input) could match a *different*, stray hidden file input already present in the still-rendered Drive-browsing pane — this dump additionally showed the Drive pane's folder tiles carry `data-target="itemUploadDrop"`, i.e. the Drive pane supports its own drag-and-drop upload and plausibly has its own hidden `<input type="file">`. If that fallback matched *that* input, the handler would conclude "layout 1, already on the upload pane" and never click the nav at all — exactly the observed stall (nav untouched, Drive pane still showing).
- **H2**: the synthetic `.click()` doesn't activate the option. The option itself carries **no** `jsaction` of its own — the click handler (`jsaction="click:cOuCgd"`) is delegated on the **listbox container**, and the container also separately listens for `keydown:I481le`. Delegated jsaction listeners rely on real, bubbling DOM events; a bare `HTMLElement.click()` may not satisfy whatever cOuCgd checks (event target flags, `isTrusted`, etc.) the way a real pointer interaction would.

**Corrected approach**: stop deciding "are we on the upload pane" from file-input presence at all — the nav option's own `aria-selected` is the authoritative signal, and is polled after every activation attempt rather than assumed to have taken effect from a single click. The bare `input[type="file"]` fallback is now scoped so it's only reachable once the upload pane is confirmed active (`aria-selected="true"`, or no nav option ever existed at all — a single-pane layout 1), never used as the "are we there yet" test itself. Activation escalates through an ordered list — plain `.click()`, then a bubbling pointer/mouse sequence (`pointerdown`/`mousedown`/`pointerup`/`mouseup`/`click`), then keyboard (`focus()` + `keydown` `Enter`, then `focus()` + `keydown` `' '`/Space, since the container's `keydown:I481le` is a distinct activation path from click) — checking `aria-selected` after each step before trying the next. See the revised Section 3 below, `isPickerUploadNavSelected` (`src/domain/my-maps/my-maps-detectors.ts`), and `activateUploadPaneNav` (`entrypoints/mymaps.content.ts`). **Not independently re-verified against a live picker v2 account** — this fix could not be tested end-to-end before this write-up; see "Open follow-ups".

**General rule established by this point (fourth recurrence, 2026-08-04)**: every step of this automation so far — the Drive-consent dialog / `mid=` URL after map creation, the KML picker iframe, the title-rename dialog, and now the picker v2 upload-nav click — renders with a **lag after the triggering click**, not synchronously. A single `querySelector` immediately after a click has been wrong four separate times in this file's history. Treat this as a standing rule for `mymaps.content.ts`, not a per-step judgment call: **every DOM lookup that follows a click or navigation must go through the bounded `waitForElement`/`pollUntil` poll, never a bare synchronous lookup — and a timeout is always an explicit `MyMapsUiChanged` failure, never a silent continue.**

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

This is **layout 1**. Call it that because a second layout was found later (2026-08-04 addendum, top of this doc) on a different account — see "Layout 2" below.

**Layout 2 ("picker v2", 2026-08-04)**: on some accounts the picker instead renders a **source-nav listbox** on the left, with `Google ドライブ` preselected, instead of opening directly on the upload pane. The dialog's own `data-config` attribute contains `"https://docs.google.com/picker/v2/"` in this case (absent in layout 1). Confirmed from the live DOM of an affected account:

```html
<div jsname="BleNNd" role="dialog" aria-label="インポートするファイルの選択"
     data-config="...&quot;https://docs.google.com/picker/v2/&quot;,&quot;インポートするファイルの選択&quot;,&quot;ja&quot;..."
     data-sources="...[&quot;upload&quot;,null,&quot;{\&quot;data\&quot;:{...},\&quot;query\&quot;:\&quot;mapspro\&quot;,\&quot;fileExts\&quot;:\&quot;.CSV,.DAT,.GPX,.KML,.KMZ,.ODS,.TAB,.TSV,.TXT,.XLS,.XLT,.XLSX\&quot;}&quot;]...">
  <div role="listbox" jsname="T0teYc" tabindex="0" aria-orientation="vertical" class="PpTbs rkL4We yIIGoc ycrW9">
    <div role="option" tabindex="0"  jsname="Co88hf" name="0" aria-selected="true"  class="X074ib Ss7qXc wThJje">...<span class="KZ90cb">...</span>Google ドライブ</div>
    <div role="option" tabindex="-1" jsname="Co88hf" name="1" aria-selected="false" class="X074ib Ss7qXc wThJje">...<span class="KZ90cb">...</span>アルバム</div>
    <hr class="uPRyu">
    <div role="option" tabindex="-1" jsname="Co88hf" name="2" aria-selected="false" class="X074ib Ss7qXc wThJje">...<span class="KZ90cb">...</span>アップロード</div>
  </div>
  <!-- the visible tabpanel is the Drive browser (マイドライブ / 共有アイテム / 最近使用したアイテム).
       NO input[type="file"] anywhere in the DOM until "アップロード" is clicked. -->
</div>
```

The upload pane's own file-input markup was **not** directly observed in this layout (only the above listbox and the dialog's `data-config`/`data-sources`) — only inferred to likely match layout 1's, since `data-sources` carries the same `.KML`-inclusive `fileExts` list. Note the source is still configured with the upload option enabled in both layouts; only the **default rendered selection** differs.

**Nav-option selector rule**: do **not** anchor on `name="2"` (or any positional index) — it's the source index, and an account without the アルバム source would shift it. Do not anchor on the hashed classes (`X074ib`, `PpTbs`, …) either — churn-prone. `jsname="Co88hf"` may be used as an optional narrowing hint (all source-nav options share it) but is never the sole anchor, since it's shared by every option, not just the upload one. The reliable anchor is the option's own trimmed text: `アップロード` (also accept `Upload`, mirroring the `DRIVE_CONSENT_TEXT = 'CREATE'` precedent of Google mixing English into a JA UI) — see `isPickerUploadNavLabel` in `src/domain/my-maps/my-maps-detectors.ts`.

**Selector-to-frame mapping** (see also [messaging protocol §6](../reference/extension-messaging-protocol.md#6-service-worker--my-maps-content-script)):

| Selector | Frame |
| :--- | :--- |
| `#ly0-layerview-import-link` (open the picker) | top (`www.google.com`) |
| `input[type="file"][accept*="KML"]` (strict; the authoritative test for "the file input exists"), falling back to any `input[type="file"]` in the frame **only once the upload nav is confirmed `aria-selected="true"`** (or there was no nav at all — layout 1) — see the 2026-08-04 second addendum above for why this fallback must never be used as the "are we on the upload pane" test itself | **picker iframe** (`docs.google.com/picker...`) |
| `div[role="option"]` whose trimmed text is `アップロード`/`Upload`, decided as activated via its own `aria-selected` attribute (`isPickerUploadNavSelected`), not by clicking-and-assuming | **picker iframe** |
| `#ly0-layer-header .pbTTYe-r4nke` (success signal, below) | top |

Prefer the `accept` substring match over the `jsname` attribute for the file input, since `accept` is a meaningful, less likely to silently rename value; treat a missing match (in the picker frame, after also failing to activate the layout-2 upload-nav option) as `MyMapsUiChanged`.

**Behavior across both layouts (revised 2026-08-04, second addendum)**: the layout decision is driven by the nav option's own `aria-selected` state, never by whether some file input happens to already exist in the frame — see the second addendum above for why the file-input-presence test misfired in the field. Bounded-poll until the nav option exists **or** the strict file input exists; if the nav exists and isn't `aria-selected="true"`, activate it (escalating through `.click()` → pointer/mouse sequence → keyboard `Enter` → keyboard Space, each followed by a bounded re-check) regardless of whether some file input was already found elsewhere; only once the nav is confirmed selected (or never existed at all — layout 1) is the fallback-including file-input lookup used. Neither the nav nor the strict file input ever appearing, or activation exhausting every strategy without the nav flipping selected and without a file input appearing, is `MyMapsUiChanged`.

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
- **The picker iframe has a second rendered layout ("picker v2") that hides the file input behind a source-nav click — first fix 2026-08-04 did not work in the field, corrected same day (second addendum); see the addenda at the top of this doc and the revised Section 3.** On some accounts the picker opens on a source-nav listbox (`Google ドライブ` preselected) instead of the upload pane, so the file input doesn't exist in the DOM at all until `アップロード` is activated; `handleFeedKml`'s single `waitForElement(FILE_INPUT_SELECTOR, ...)` polled a DOM that would never contain it and timed out to `MyMapsUiChanged`. No new permission needed — same `docs.google.com/picker*` iframe, still targeted by the previously-discovered `frameId`. The first fix (bounded-poll for *either* the file input *or* the upload-nav option, `isPickerUploadNavLabel`; click the nav if only it appeared) shipped but a live re-dump showed it still stalled — the nav stayed `aria-selected="false"`, Drive pane still rendered. Root cause not confirmed between two candidates (bare file-input fallback misfiring against a stray Drive-pane upload input; a plain `.click()` not reaching the container's delegated `jsaction`) — the corrected fix (second addendum) addresses both: decide "on the upload pane" from the nav's own `aria-selected` (`isPickerUploadNavSelected`) rather than file-input presence, and escalate activation through click → pointer/mouse events → keyboard, verifying `aria-selected` after each step.
- **Repeatedly re-injecting to discover the picker frame also re-executes the script in the top frame every poll tick.** Without a guard, this would register a new `runtime.onMessage` listener in the top frame on every tick (Chrome's isolated-world JS realm persists across multiple `executeScript` calls into the same still-loaded document, so listeners accumulate rather than replace each other). `mymaps.content.ts` guards against this with a flag written directly onto the shared `window` DOM object (`__import2gmapMymapsRegistered`) checked at the top of `main()`, since `window`/`document` — unlike top-level `const`/`function` bindings, which are freshly re-declared on every injection — are the actual DOM objects and persist across re-injections into the same document.
- **Map title rename — resolved 2026-08-02, see Section 2b.** The confirm screen's editable map name (ADR-0004 §2) is now applied to the actual My Maps document before the KML import step runs, via the new `MAPS_SET_MAP_TITLE` / `MAPS_SET_MAP_TITLE_RESULT` messages (top frame only; selectors `#map-title-desc-bar .i4ewOd-r4nke`, `#update-map input[type="text"]`, `#update-map button[name="save"]`). The map no longer keeps Google's default title (「無題の地図」) after a successful import.
- **Navigation destroys the content script's execution context — do not reintroduce logic that runs "after" a navigating click in the same content-script invocation.** Clicking **新しい地図を作成** triggers a full document navigation (`https://www.google.com/maps/d/u/0/` → `.../edit?mid=...`). A content script injected via `browser.scripting.executeScript` (as `mymaps.content.ts` is, since ADR-0004 forbids `content_scripts` manifest entries / broad `host_permissions`) has its execution context torn down the moment that navigation happens, and WXT's `registration: 'runtime'` scripts are **not** automatically reinjected afterward. Concretely: `handlePrepareImport` in `entrypoints/mymaps.content.ts` found `mid=` had already appeared, wait for the import link, and *then* `sendResponse` — but by the time the click landed, the script was usually already gone, so `sendResponse` never fired, the background's `await` on the reply hung until the port closed, and the popup surfaced a bare `InternalError` even though the map itself had been created. Fixed by splitting the flow: the content script now only does same-document checks and replies to `MAPS_PREPARE_RESULT` **before** clicking the create-map control (click is the last thing it does, mirroring the already-correct `TAB_CLICK_NEXT` ordering in `tabelog.content.ts`); the worker (`entrypoints/background.ts`) then polls `browser.tabs.get(tabId).url` for the `mid=` URL itself and re-injects a fresh content script into the new document before sending `MAPS_IMPORT_KML`. The same pattern applies to `tabelog.content.ts`'s pagination (`TAB_CLICK_NEXT` → page navigates → the worker must re-inject before the next `TAB_EXTRACT_PAGE`). Any future step that adds another navigating click (e.g. the deferred map-title rename above) needs the same reply-before-click-then-worker-reinjects treatment.
- **The corrected picker-v2 fix (second addendum, 2026-08-04) has not been verified against a live picker v2 account.** No account exhibiting this layout is available in this environment; `npm test`/`npm run compile` cover the new pure predicate (`isPickerUploadNavSelected`) and confirm the rest of the codebase still type-checks and passes, but the actual DOM behavior of the activation escalation (does the pointer/mouse sequence or the keyboard path actually flip `aria-selected` on the real listbox?) is unverified. If this still doesn't work in the field, the next diagnostic step is a fresh live DOM dump taken *immediately after* each activation attempt (not just at the end) to see which step, if any, changes anything.
- **A "reply arrives before the click" protocol means the worker cannot detect the navigation via `tabs.status` alone — it raced.** A first pass at the fix above re-injected as soon as `browser.tabs.get(tabId).status === 'complete'`. That's correct only for a tab's *first* load (nothing to confuse it with). For a wait that follows a reply-then-click message like `TAB_CLICK_NEXT`, the tab can still legitimately report `status: 'complete'` for the *old* document in the brief window between the reply and the click actually landing — the short-circuit fired immediately, the worker re-injected into the still-old page, and `TAB_EXTRACT_PAGE` silently re-parsed it (dedupe hid the duplicate shops rather than surfacing an error — a silent wrong result, which ADR-0003 forbids). Fix: capture the tab's URL *before* sending the navigating-click message, then wait for both `status: 'complete'` **and** the URL to differ from the captured value (bounded timeout, explicit failure — never silently continue on an ambiguous state). `entrypoints/background.ts` keeps this as two distinct helpers — `waitForTabLoaded` (status-only, first-load-only) and `waitForNavigation` (URL-and-status, for waits after a reply-before-click message) — specifically so they can't be accidentally merged back into one ambiguous helper.
