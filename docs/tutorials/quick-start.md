# Tutorial: Extract a Tabelog Saved List and Import It into Google My Maps

This walks through the full flow end to end: loading the unpacked extension, extracting your Tabelog saved list, confirming the result, and importing it into a brand-new Google My Maps map — with a pin for every shop.

Related: [build how-to](../how-to/build-extension-artifact.md), [UI spec](../reference/extension-ui-specifications.md), [error codes](../reference/extension-error-codes.md), [decision checklist](../explanation/chrome-extension-decision-checklist.md).

---

## Before you start

- You'll need a Tabelog account with a saved list ("保存リスト") that has at least one shop in it.
- You'll need a Google account, and you must already be **signed in to it in this browser profile**. The extension never shows or fills in a Google login form itself — if you're signed out when the import step runs, it fails with an explicit error rather than trying to log you in for you.

## 1. Build and load the extension

Follow [build-extension-artifact.md](../how-to/build-extension-artifact.md) to run `npm install` and `npm run build`, then load `output/chrome-mv3/` as an unpacked extension via `chrome://extensions` → デベロッパーモード → パッケージ化されていない拡張機能を読み込む.

Pin the extension icon to the toolbar so you can find it easily.

## 2. Open your Tabelog saved list

In a normal browser tab, sign in to Tabelog and open your **PC版「保存リスト」** page yourself:

```text
https://tabelog.com/rvwr/{あなたのID}/hozon_restaurants/list
```

The extension never opens or guesses this URL for you — you navigate there first. If you're not sure how to reach it, use Tabelog's own UI (your account menu → 保存リスト).

## 3. Open the extension popup

Click the toolbar icon. If the page above is currently the active tab, you'll see:

> 保存リストページを認識しました。 [抽出する]

If instead you see a message saying the tab isn't a saved-list page (or no usable tab), switch to the saved-list tab first and reopen the popup — the extension only reads pages you already have open.

## 4. Extract

Click **抽出する**.

- The first time, Chrome will ask you to allow access to `tabelog.com` — allow it (this is the `optional_host_permissions` prompt; the extension has no standing access before this).
- The popup switches to **抽出しています…** with a running shop count. Multi-page lists are crawled automatically, page by page, following the pager's next-page link.
- You can press **キャンセル** at any point; a cancelled extract never produces a usable result.
- Closing the popup during this step does **not** cancel it — the crawl keeps running in the background; reopening the popup reconnects to its progress or its final result.

## 5. Extract complete

On success you'll see:

> {n} 件の店舗を抽出しました
> コレクション {c} 種類

Press **次へ** to continue, or **やり直す** to discard this result and start over.

## 6. Confirm

You'll see the final shop count, collection count, and an editable map name (defaults to `食べログ保存リスト YYYY-MM-DD`). Edit the map name here if you want something other than the default — this is the name your My Maps map will get in the next step.

Press **My Maps へインポート** to continue, or **戻る** to go back.

## 7. Import into My Maps

Pressing **My Maps へインポート** kicks off the import:

- Chrome asks for permission again, this time for **two** origins: `https://www.google.com/maps/*` (the My Maps web app itself) and `https://docs.google.com/picker*`. The second one is needed because the KML upload dialog My Maps opens is actually a cross-origin `docs.google.com/picker` iframe embedded in the My Maps tab, and Chrome requires host permission for that frame separately from the top-level page. Allow both.
- The popup shows **権限確認・My Maps タブ準備中です…** while the background script drives a new tab: it opens My Maps, creates a new map, renames it to the map name from the confirm screen, opens the KML import dialog, and feeds it your extracted shops as an in-memory KML file. The KML itself is built in memory and never written to disk, and the extension uses no Drive API and no OAuth tokens to do any of this. That said, the map it creates is stored in your Google account like any other My Maps map, and creating it can surface a one-time Google Drive consent dialog ("Creating a MyMaps map always uploads title, thumbnail, and associated metadata to Drive") — the automation clicks through this dialog on your behalf if it appears, so don't be surprised that it doesn't ask you to confirm it yourself.
- This step drives Google's own My Maps web UI, which isn't a documented or stable API surface. If Google's page differs from what the automation expects, you'll get an explicit `error` screen (see Troubleshooting below) instead of a silent partial import — the popup never reports success unless the map was actually renamed and the KML was actually accepted.
- On success, the popup shows:

  > 「{マップ名}」に{件数}件の店舗をインポートしました。

  with a **完了** button that clears the session and returns you to the `ready` screen.

Switch to the My Maps tab to see your new map, retitled to your chosen map name, with a pin for every extracted shop.

---

## Scope decisions (not bugs)

A few things are deliberately **not** part of this flow, by product decision rather than by accident (see the [decision checklist](../explanation/chrome-extension-decision-checklist.md) for the full list):

- **Every import creates a brand-new map.** There's no way to import into an existing My Maps map yet.
- **There's no way to download the KML yourself.** The KML only ever exists in memory during the import.
- **Pin colors per collection aren't applied.** Collections are extracted and shown as a count on the confirm screen, but styling pins by collection is deferred.

---

## Troubleshooting

| Symptom | Likely cause |
| :--- | :--- |
| 抽出する is disabled / wrong-tab message | Active tab isn't the Tabelog PC saved-list page — switch tabs and reopen the popup |
| Extract fails with `IncompleteCrawl` | Page count didn't match unique shops collected; try 再試行 |
| Extract fails with `HostPermissionDenied` | You denied the Tabelog access prompt — 再試行 will ask again |
| Import fails with `HostPermissionDenied` | You denied the My Maps / picker permission prompt on the confirm screen — 再試行 will ask again |
| Import fails with `MyMapsTabOpenFailed` | Opening (or focusing) the My Maps tab failed — 再試行 |
| Import fails with `MyMapsNotReady` | You aren't signed in to Google in this browser profile — the tab lands on a Google sign-in redirect instead of My Maps; sign in and 再試行 |
| Import fails with `MyMapsUiChanged` | Google's My Maps page differs from what the automation expects (an undocumented UI Google can change at any time); this is a real, explicit failure, not a bug you can work around — 再試行 may succeed if it was transient |
| Nothing happens after opening the popup | Check `chrome://extensions` → import2gmap → "Errors" for a background script exception, and confirm you rebuilt/reloaded after any code change |

For the complete, authoritative list of error codes and their retry semantics, see [extension-error-codes.md](../reference/extension-error-codes.md).
