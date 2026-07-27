# Extension Error Codes

Stable error `code` values for popup display, messaging, and tests. Japanese `message` strings are the default UI copy (may be overridden only with the same meaning).

Related: [extraction spec](tabelog-pc-saved-list-extraction-spec.md), [UI spec](extension-ui-specifications.md), [messaging](extension-messaging-protocol.md).

---

## 1. Conventions

| Rule | Detail |
| :--- | :--- |
| Format | PascalCase English identifier |
| Payload | `{ code, message, retryStep }` (+ optional `jobId`) |
| Logging | May log `code` + safe detail; never log full page HTML or PII |
| Unknown | Map to `InternalError` in UI |

`retryStep`:

- `extract` — **再試行** restarts extract (from `ready` / inject again)
- `import` — **再試行** restarts import prelude
- `none` — fix context manually (e.g. open saved list); button may return to `ready` only

---

## 2. Context & permissions

| Code | Japanese message (default) | retryStep | When |
| :--- | :--- | :--- | :--- |
| `NotSavedListPage` | 食べログのPC版「保存リスト」ページを開いてから、もう一度お試しください。 | `none` | Tab fails saved-list detection |
| `WrongTab` | 取り込み対象のタブがありません。保存リストを表示したタブで拡張機能を開いてください。 | `none` | No usable active tab |
| `HostPermissionDenied` | サイトへのアクセスが許可されませんでした。許可したうえで再試行してください。 | `extract` or `import` | Optional host permission denied (step-specific) |
| `ProtocolMismatch` | 拡張機能の通信バージョンが一致しません。拡張機能を再読み込みしてください。 | `none` | `protocolVersion` mismatch |

---

## 3. Extraction / DOM

| Code | Japanese message (default) | retryStep | When |
| :--- | :--- | :--- | :--- |
| `EmptyList` | 保存リストに店舗が見つかりませんでした。 | `extract` | Zero `div.js-bookmark` on a valid page |
| `ItemNameMissing` | 店舗名を取得できない項目がありました。 | `extract` | Required name empty after sanitize |
| `ItemUrlMissing` | 店舗URLを取得できない項目がありました。 | `extract` | No URL candidate |
| `InvalidShopUrl` | 不正な店舗URLが含まれていました。 | `extract` | URL fail allowlist |
| `AddressMissing` | 住所を取得できない項目がありました。 | `extract` | Address parse/sanitize failed |
| `SelectorDrift` | ページ構造が想定と異なります。時間をおいて再試行するか、仕様の更新が必要です。 | `extract` | Expected nodes missing |
| `BookmarksDataInvalid` | コレクション情報の読み取りに失敗しました。 | `extract` | `#js-bookmarks-data` present but invalid |
| `CollectionCatalogInvalid` | コレクション一覧の読み取りに失敗しました。 | `extract` | `#js-collection` present but invalid |
| `IncompleteCrawl` | 表示件数と抽出件数が一致しません。最後まで取得できませんでした。 | `extract` | unique shops ≠ declared total |
| `ExtractCancelled` | 抽出をキャンセルしました。 | `none` | User cancel (not shown as hard error if returning to `ready`; use if `error` screen is shown) |
| `TabNavigatedAway` | 抽出中にページが移動したため中断しました。 | `extract` | Tab URL left saved-list unexpectedly |
| `TabClosed` | 抽出中のタブが閉じられました。 | `extract` | Target tab gone |
| `ExtractTimeout` | 抽出が時間内に終わりませんでした。 | `extract` | Bounded wait exceeded |

---

## 4. Session / internal

| Code | Japanese message (default) | retryStep | When |
| :--- | :--- | :--- | :--- |
| `SessionCorrupt` | 保存中のデータが壊れていました。もう一度抽出してください。 | `extract` | Session guard failed |
| `SessionQuotaExceeded` | 保存容量を超えたため抽出結果を保持できません。 | `extract` | Quota |
| `NoExtractResult` | インポートできる抽出結果がありません。先に抽出してください。 | `extract` | Import without success payload |
| `InvalidMapName` | マップ名を入力してください。 | `none` | Empty/invalid map name on import |
| `InternalError` | 予期しないエラーが発生しました。 | `extract` | Catch-all |

---

## 5. Import prelude (pre–Maps automation)

| Code | Japanese message (default) | retryStep | When |
| :--- | :--- | :--- | :--- |
| `MyMapsTabOpenFailed` | Googleマイマップのタブを開けませんでした。 | `import` | `tabs.create` / focus failed |
| `MyMapsNotReady` | マイマップページの準備を確認できませんでした。ログイン状態を確認して再試行してください。 | `import` | Prelude prepare failed |
| `MyMapsUiChanged` | マイマップの画面構成が想定と異なります。 | `import` | Unexpected DOM (also used after spike) |
| `ImportCancelled` | インポートをキャンセルしました。 | `none` | User cancel in prelude |

Full Maps automation codes may extend this table after the ADR-0004 spike.

---

## 6. UI mapping

| uiStep / situation | Typical codes |
| :--- | :--- |
| Disabled extract | `NotSavedListPage`, `WrongTab` (message area; not always `error` step) |
| `error` after extract | Section 3 / 4 extract-related |
| `error` after import start | Section 2 `HostPermissionDenied` (import), Section 5 |

Popup always shows **`code` + `message`**. Do not show raw exception strings to users.
