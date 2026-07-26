---
name: google-my-maps-import
description: Google OAuth2 and Drive API workflow to upload Tabelog shop KML into the user's Google My Maps. Use when implementing Google Maps import, Drive upload, OAuth scopes, or My Maps cloud creation for import2gmap.
---

# Google My Maps Import Skill (`google-my-maps-import`)

This skill defines how **import2gmap** imports scraped restaurants into **Google My Maps** via **Google OAuth2 + Google Drive API (KML upload)**. Canonical decision: `docs/explanation/adr/0002-tabelog-to-google-maps-import-architecture.md`.

## Scope (This Project Only)

| In scope | Out of scope |
| :--- | :--- |
| User Google OAuth2 on Android | Google Places API / Geocoding API as primary placement |
| Drive API v3 KML upload under the user's account | Silent fallbacks (local-only Intent, CSV download, skip-on-error) |
| Creating / attaching a custom My Maps layer from KML | Embedding Maps SDK as the import path |
| Explicit user-visible API/auth errors | Storing credentials, tokens, or PII beyond session needs |

KML XML shape and placemark fields: follow `gis-kml-conversion`. Scraping must remain shop-only: follow `web-scraping-dom-parsing` / `android-security-privacy`.

## Target Flow

1. User confirms `List<Restaurant>` on preview → taps import.
2. Request Google OAuth2 consent (Drive / My Maps capable scopes).
3. Build KML from restaurants (`KmlDocument.toXmlString()`).
4. Upload KML with Drive API → create / open My Maps under the signed-in account.
5. On success: show completion UI + openable My Maps / Maps URL.
6. On any failure: surface the concrete reason; do **not** fall back silently.

Sequence reference: `docs/reference/sequence-and-data-flow.md` (steps 9–15).

## OAuth2 (Android)

- Prefer **Credential Manager** / Google Identity Authorization APIs for user-granted tokens.
- Request the **least privilege** that still allows creating/uploading the map file for this app. Prefer:
  - `https://www.googleapis.com/auth/drive.file`
- Avoid broad `drive` unless a concrete requirement forces it.
- Do **not** persist refresh tokens in plaintext `SharedPreferences`; use EncryptedSharedPreferences / system account storage if refresh is required.
- Cancel / deny → explicit message (see Error Policy). Never continue upload without a valid token.

## Drive API Upload (KML → My Maps)

- Endpoint pattern: Drive API v3 `files.create` with `uploadType=multipart` (metadata + KML body).
- Metadata guidelines:
  - `name`: user-facing title (e.g. `食べログ保存リスト.kml` or dated list name).
  - Media MIME: `application/vnd.google-earth.kml+xml`.
  - When creating a My Maps document via Drive, use Google Apps map MIME `application/vnd.google-apps.map` only where that path is required by the chosen create/import sequence; keep the uploaded payload KML-compatible with `gis-kml-conversion`.
- Placement: rely on KML `<address>` (and optional `<Point>`) so My Maps geocodes on import — do **not** call Places/Geocoding APIs unless a later ADR changes this.
- Return a stable open URL (Drive file link or My Maps `maps/d` URL) to the UI layer.

Pseudo-flow:

```kotlin
// 1) Obtain OAuth access token (drive.file)
// 2) val kml = kmlDocument.toXmlString()
// 3) Drive.Files.Create(metadata, kmlMediaContent).execute()
// 4) Map success → ImportSuccess(mapUrl) / failure → ImportException(detail)
```

## Success & Completion UI

- Status while uploading: `"Google マイマップへデータを書き込み中..."`
- Success: `"Google マイマップへの取り込みが完了しました！"` + button `「Google マップで開く」` using the returned URL.
- Spec: `docs/reference/screen-specifications.md` (§ Google Auth & Import Screen).

## Error Policy (No Silent Fallbacks)

| Situation | User-facing guidance |
| :--- | :--- |
| OAuth cancelled / denied | `Google アカウント認証がキャンセルされました。取り込みには認証が必要です。` |
| Missing Drive scope | `Google Drive APIへのアクセス権限が得られませんでした。` |
| Network / HTTP failure | Include status and short API reason |
| Drive / My Maps write failure | `Google マイマップへのデータ書き込みに失敗しました (理由: {APIエラー詳細})。` |

Rules:
- Propagate API status + message into domain/use-case errors (`ImportException`).
- Never swallow errors into empty success or an unsolicited local Intent share.
- Retry is explicit (user-triggered), not automatic masking.

## Privacy

- Upload **restaurant fields only** (name, address, rating, genre, Tabelog URL, optional notes/coords).
- Never include reviewer nickname, rvwr ID, profile, CSRF/session tokens, or other account PII from Tabelog pages.
- Do not log access tokens or full Authorization headers.

## Coordination With Other Skills

- `gis-kml-conversion` — KML document structure / ExtendedData.
- `android-security-privacy` — credential non-retention, secure file handling.
- `android-app-development` / `kotlin-jetpack` — ViewModel, Coroutines, Hilt wiring for `ExportToGoogleMapsUseCase`.
- `tdd-android` — Test Plan before implementing auth/upload use cases; mock Drive client at the boundary.
