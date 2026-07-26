---
name: android-app-development
description: Guidelines and best practices for developing Android applications using Kotlin, Jetpack Compose, Android Architecture Components, and Intent integrations.
---

# Android App Development Skill (`android-app-development`)

This skill provides guidelines and standards for building modern, robust, and maintainable Android applications using **Kotlin** and **Jetpack Compose**.

## Core Architecture
- **Language**: Kotlin (Modern idiomatic Kotlin, Coroutines, Flow).
- **UI Framework**: Jetpack Compose.
- **Architecture Pattern**: MVVM (Model-View-ViewModel) or Unidirectional Data Flow (UDF).
- **State Management**: `StateFlow` / `SharedFlow` with `ViewModel`.
- **Dependency Injection**: Hilt / Koin (or lightweight manual DI for simple prototypes).

## Key Components for Tabelog → Google Maps App
1. **WebView Integration**:
   - Use `AndroidView` to wrap `android.webkit.WebView` inside Jetpack Compose.
   - Configure `WebSettings` carefully (`javaScriptEnabled = true`, `domStorageEnabled = true`).
   - Implement `WebViewClient` and `WebChromeClient` for navigation and JS injection hooks.

2. **File Sharing & Intents**:
   - Use `FileProvider` (`androidx.core.content.FileProvider`) for sharing KML files to external apps safely.
   - Trigger Google Maps app using `Intent(Intent.ACTION_VIEW)` with MIME type `application/vnd.google-earth.kml+xml`.

3. **Asynchronous Processing**:
   - Use Kotlin Coroutines (`Dispatchers.IO`) for DOM parsing, file writing, and background tasks.
   - Expose UI states using `StateFlow` to decouple UI from business logic.

## Best Practices
- Never execute long-running file or parsing operations on `Dispatchers.Main`.
- Handle Android activity lifecycle changes (orientation, configuration changes) without losing WebView session or parsed state.
- Strictly validate external Intent resolution using `intent.resolveActivity(packageManager)` to prevent app crashes.
