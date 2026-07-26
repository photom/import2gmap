# Screen & Functional Specifications: Tabelog to Google Maps Import

## 1. System Overview

This document specifies the user interface flow, screen states, web scraping logic, Google My Maps API integration, and explicit error handling for importing Tabelog saved lists (お気に入り / 保存リスト) into Google Maps.

**Detailed layout, states, copy, and interactions per screen:** [`screen-composition-specifications.md`](./screen-composition-specifications.md)

### 1.1. Extracted & My Maps Target Fields

Scraping and My Maps (KML) conversion use **only** the following restaurant fields:

| Field | Source (example) | KML / My Maps mapping |
| :--- | :--- | :--- |
| 店舗名 (`name`) | Shop title link / copy textarea | `<Placemark><name>` |
| 住所 (`address`) | Copy textarea street address | `<address>` (My Maps geocodes for placement) |
| 食べログ URL (`url`) | Shop detail link / copy textarea | `<description>` (include the URL text) |

- Do **not** extract rating, genre, phone, user notes, or any personal/account information for import.
- **DOM extraction (hardcoded selectors):** [`tabelog-scraping-extraction-spec.md`](./tabelog-scraping-extraction-spec.md)

---

## 2. Screen Specifications & User Workflow

### 2.1. Screen 1: Tabelog WebView Screen (`TabelogWebViewScreen`)

- **Purpose**: Allows user to log into Tabelog, browse, and navigate to their saved list (お気に入り / 保存リスト) page.
- **UI Elements**:
  1. **Navigation Prompt Banner (Top)**:
     - Message: `"食べログにログイン後、保存リスト（お気に入り）画面を開いてから【保存リストをインポート】ボタンを押してください。"`
     - Always visible over the WebView container.
  2. **In-App WebView**:
     - Initial URL: `https://s.tabelog.com/`
     - Mobile User-Agent (スマホ版表示を固定)。
     - Supports JavaScript, cookie persistence, and user authentication.
     - User navigates to 保存リスト; the app does not automate that path.
  3. **Action Button (Bottom Banner / Floating Action)**:
     - Button Text: `「保存リストをインポート」`
     - Action: Triggers DOM validation and initiates the multi-page scraping process.

---

### 2.2. Screen 2: Scraping Progress & Error Screen (`ScrapingProgressScreen`)

- **Purpose**: Executes multi-page pagination crawling on the saved list, extracts restaurant metadata, and shows real-time progress or explicit failure reasons.
- **Workflow**:
  1. Validates that the current WebView page is indeed a Tabelog saved list page.
  2. Injects DOM extraction script to retrieve **店舗名**, **住所**, **食べログ URL** (see §1.1 and extraction spec).
  3. Follows 「さらに読み込む」(`get-next-items`) until exhausted, then enriches address from each shop detail page, and aggregates all shops.
- **UI States**:
  - **Progress State**:
    - Animated progress bar / indicator.
    - Status Text: `"データを取得中... ( … - {N}件の店舗をパース済み )"`（追加読み込み／住所取得フェーズ）
  - **Failure / Error State**:
    - Displays explicit error modal or alert message describing why scraping failed.
    - Error examples:
      - `"保存リスト画面が検出できませんでした。食べログの「お気に入り/保存リスト」画面を開いた状態でもう一度お試しください。"`
      - `"ページ構造のパースに失敗しました (原因: HTML要素が見つかりません)。"`
      - `"ネットワーク通信エラーが発生しました。"`
    - Action Buttons: `「再試行」`, `「WebView画面に戻る」`

---

### 2.3. Screen 3: Import Preview Screen (`ImportPreviewScreen`)

- **Purpose**: Displays the list of scraped restaurants for user review before importing to Google Maps.
- **UI Elements**:
  1. **Summary Bar**:
     - Displays total restaurant count (e.g., `"全 48 件の店舗データを抽出しました"`).
  2. **Restaurant List**:
     - Cards showing **店舗名**, **住所**, and **食べログ URL** only.
  3. **Action Button**:
     - Button Text: `「GoogleMapへ取り込む」`
     - Action: Navigates to Google Authentication & Import Execution Screen.

---

### 2.4. Screen 4: Google Auth & Import Screen (`GoogleAuthAndImportScreen`)

- **Purpose**: Handles Google Account OAuth2 authentication, generates KML document data, and uploads it to user's Google Drive / My Maps via Google APIs.
- **Workflow**:
  1. Prompt user for Google Account login / OAuth2 scope permission (`Google Drive / My Maps`).
  2. Transform `List<Restaurant>` into KML: `name` → `<name>`, `address` → `<address>`, `url` → `<description>` (URL text in description).
  3. Upload KML file and create a new custom map layer on Google My Maps.
- **UI States**:
  - **Auth State**: Prompts Google OAuth login dialog.
  - **Uploading / Importing State**:
    - Progress Indicator.
    - Status Text: `"Google マイマップへデータを書き込み中..."`
  - **Completion State**:
    - Success Icon & Message: `"Google マイマップへの取り込みが完了しました！"`
    - Button: `「Google マップで開く」`
  - **Error State**:
    - Explicit error notification explaining failure reason.
    - Examples: `"Google アカウントの認証に失敗しました。"` / `"Google Drive APIへのアクセス権限が得られませんでした。"` / `"データ送信中に通信エラーが発生しました。"`

---

## 3. Error Handling Policy Matrix

| Error Situation | User Message | Recovery Action |
| :--- | :--- | :--- |
| Not on saved list page when tapping Import | `保存リスト画面が検出できませんでした。食べログの「お気に入り/保存リスト」画面を開いた状態でもう一度お試しください。` | Return to WebView |
| Network disconnect during pagination | `通信エラーが発生しました。インターネット接続を確認して再試行してください。` | Retry / Cancel |
| Scraping DOM structure mismatch | `店舗情報の解析に失敗しました。食べログの表示フォーマットが変更された可能性があります。` | Return / Report |
| Google OAuth denied / cancelled | `Google アカウント認証がキャンセルされました。取り込みには認証が必要です。` | Retry Auth |
| Google Drive / My Maps API error | `Google マイマップへのデータ書き込みに失敗しました (理由: {APIエラー詳細})。` | Retry Upload |
