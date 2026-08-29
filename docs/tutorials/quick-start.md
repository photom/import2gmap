# Tutorial: Extract a Tabelog Saved List and Prepare Its Google Maps Saved List

This walks through the flow end to end: loading the unpacked extension, extracting your Tabelog
saved list, confirming the result, and ensuring a Google Maps saved list named 「食べログ」 exists
(created automatically if it doesn't). See [ADR-0008](../explanation/adr/0008-google-maps-saved-list-import.md) for why
this replaced an earlier My Maps-based design, and its open items for what this step does **not**
do yet (it does not add any shops to the list — see "Scope decisions" below).

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

You'll see the final shop count, collection count, and a note that the extension will check/create a Google Maps saved list named **食べログ** (this name is fixed, not editable).

Press **保存リストを準備する** to continue, or **戻る** to go back.

## 7. Prepare the Google Maps saved list

Pressing **保存リストを準備する** kicks off the import prelude:

- Chrome asks for permission to access `https://www.google.com/maps/*` — allow it.
- The popup shows **権限確認・Google マップの準備中です…** while the background script drives a new Google Maps tab: it opens the app menu, opens the Saved pane, and checks whether a list named 食べログ already exists. If it doesn't, the extension creates a new list and renames it to 食べログ.
- This step drives Google's own Maps web UI, which isn't a documented or stable API surface. If Google's page differs from what the automation expects, you'll get an explicit `error` screen (see Troubleshooting below) instead of a silent partial success.
- On success, the popup shows:

  > Google マップの保存リスト「食べログ」の準備ができました。

  with a **完了** button that clears the session and returns you to the `ready` screen.

Switch to the Google Maps tab to see the 食べログ list under your saved places.

---

## Scope decisions (not bugs)

A few things are deliberately **not** part of this flow yet, by product decision rather than by accident (see [ADR-0008](../explanation/adr/0008-google-maps-saved-list-import.md)'s open items and the [decision checklist](../explanation/chrome-extension-decision-checklist.md) for the full list):

- **No shop is actually added to the list yet.** This step only ensures the 食べログ list itself exists — checking each extracted shop against the list's contents, searching by address, and adding the resolved place are still unimplemented.
- **Pin colors / list styling per collection aren't applied.** Collections are extracted and shown as a count on the confirm screen, but any future styling mechanism is undecided post-ADR-0008.

---

## Troubleshooting

| Symptom | Likely cause |
| :--- | :--- |
| 抽出する is disabled / wrong-tab message | Active tab isn't the Tabelog PC saved-list page — switch tabs and reopen the popup |
| Extract fails with `IncompleteCrawl` | Page count didn't match unique shops collected; try 再試行 |
| Extract fails with `HostPermissionDenied` | You denied the Tabelog access prompt — 再試行 will ask again |
| Import fails with `HostPermissionDenied` | You denied the Google Maps permission prompt on the confirm screen — 再試行 will ask again |
| Import fails with `GoogleMapsTabOpenFailed` | Opening the Google Maps tab failed — 再試行 |
| Import fails with `GoogleMapsUiChanged` | Google's Maps page differs from what the automation expects (an undocumented UI Google can change at any time, and some steps are still unverified against a live Japanese-locale account — see the [spike notes](../explanation/google-maps-saved-list-spike-notes.md)); this is a real, explicit failure, not a bug you can work around — 再試行 may succeed if it was transient |
| Nothing happens after opening the popup | Check `chrome://extensions` → import2gmap → "Errors" for a background script exception, and confirm you rebuilt/reloaded after any code change |

For the complete, authoritative list of error codes and their retry semantics, see [extension-error-codes.md](../reference/extension-error-codes.md).
