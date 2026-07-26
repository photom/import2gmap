# ADR-0002: Tabelog Saved List Scraping and Google My Maps Import Architecture

- **Status**: Accepted
- **Date**: 2026-07-26
- **Authors**: Antigravity Agent & User Pair

## Context & Problem Statement

We are developing an Android application (`import2gmap`) to import user saved restaurant lists (お気に入り / 保存リスト) from Tabelog into Google Maps.
We need to establish the architectural design for:
1. Navigating and scraping multi-page saved lists from Tabelog via in-app `WebView`.
2. Importing extracted restaurant data into Google Maps.
3. Handling operational progress and explicit error reporting to the user.

## Decision Drivers & Constraints

1. **User Control & Simplicity**: User initiates scraping from an in-app WebView after logging in and opening their saved list page.
2. **Multi-Page Pagination**: Tabelog saved lists span multiple pages, requiring full pagination crawling.
3. **Google Maps Import Target**: Require automatic cloud creation of custom map layers under the user's Google Account.
4. **No Silent Fallbacks**: Option 1 (Google My Maps via Google OAuth2 & Drive API) is strictly selected. If scraping or import fails, explicit error messages explaining the failure reason must be presented to the user without silent fallbacks.

## Decision Outcome

### 1. Google Maps Import Strategy (Option 1 Selected)
- **Selected Method**: **Google My Maps via Google OAuth2 & Drive API (KML Upload)**.
- **Rationale**:
  - Allows seamless cloud creation of a custom map layer under the user's Google Account after OAuth2 login.
  - Preserves restaurant name, address, and original Tabelog URL (URL placed in KML `<description>`). Rating, genre, and user notes are out of scope for v1.
  - No fallback mechanisms (e.g., local intent or CSV download) are included per explicit user decision.

### 2. Failure & Error Handling Policy
- **Strict Error Notification**: When any failure occurs during WebView scraping, pagination retrieval, OAuth authentication, or API upload, the application must immediately capture the exact error cause and present a detailed, user-friendly error message on screen.
- **No Masked Errors / No Fallbacks**: Errors must not be swallowed or replaced with empty default states.

### 3. Multi-Page Scraping Architecture
- **In-App WebView**: Mobile User-Agent; initial URL `https://s.tabelog.com/`. User logs in and opens their saved list; the app does not automate that navigation.
- **Top Banner Navigation Prompt**: Displays an explicit prompt instructing the user to open their saved list page before tapping "Import".
- **Pagination Crawler**: On the smartphone saved-list DOM, activates load-more (`get-next-items`) until exhausted, then resolves street addresses from shop detail pages. Aggregates all `Restaurant` entities (name, address, url).

### 4. Smartphone-Only Web Scraping (PC Not Supported)
- **Decision**: Support **smartphone Tabelog only**. Do not implement desktop/PC saved-list scraping or dual layout detection.
- **Reason**: Fixing the WebView to a mobile UA and `https://s.tabelog.com/` yields a single DOM/pager model (load-more). Users reach the saved list themselves. Supporting PC in parallel would duplicate selectors and pagination logic without product benefit for this app.

## Consequences

- **Positive Effects**:
  - Full automation of multi-page scraping once the user reaches their saved list.
  - Direct integration into Google My Maps via user's Google Account.
  - Clear diagnosis and actionable error messages presented directly to the user when operations fail.
- **Trade-offs / Risks**:
  - Dependent on Google OAuth2 and Drive API scope permissions.
  - HTML structure changes on Tabelog require updating DOM parsing rules.
