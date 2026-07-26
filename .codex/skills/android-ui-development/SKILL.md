---
name: android-ui-development
description: Standards for building responsive Android interfaces using Jetpack Compose, featuring hybrid WebView layouts, control panels, and mobile UX optimization.
---

# Android UI Development Skill (`android-ui-development`)

This skill defines UI/UX principles and layout guidelines for building hybrid Android applications using **Jetpack Compose**.

## Layout Architecture
The target application uses a **Split/Hybrid Screen Layout**:
1. **Top Area (WebView Container)**:
   - Occupies the main screen area (e.g., 60-70% height).
   - Embedded `android.webkit.WebView` displaying Tabelog login and bookmark pages.
   - Smooth progress indicators and reload/navigation status.
2. **Bottom Area (Control Panel)**:
   - Occupies the bottom fixed area (e.g., 30-40% height).
   - Displays real-time status: Parsed shop count, active status, extraction progress bar.
   - Action Button: **"Google Maps に一括送信" (Export to Google Maps)**.

## Jetpack Compose Guidelines
- **Theme & Styling**:
  - Use Material 3 (`androidx.compose.material3`).
  - Dark/Light mode support with harmonious color palette.
- **State Hoisting**:
  - Keep Composables stateless where possible. Pass `uiState` data classes and event lambdas down.
- **Responsive Layouts**:
  - Adjust weight dynamically for portrait and landscape modes using `Column` / `Row` weights (`Modifier.weight()`).
  - Provide fallback scrollable containers when keyboard is active (`WindowInsets.ime`).

## UI Component Checklist
- `TabelogWebView`: Embedded web view with loading bar overlay.
- `ParsingStatusCard`: Summary card showing count of extracted items and last sync timestamp.
- `ExportActionButton`: Prominent primary button with icon, disabled when 0 items extracted.
- `LogViewerSheet`: Expandable bottom sheet for debugging logs and raw data inspection.
