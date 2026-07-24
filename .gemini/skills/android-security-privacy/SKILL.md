---
name: android-security-privacy
description: Security principles for Android WebViews, credential non-retention policies, and secure inter-app data sharing via FileProvider.
---

# Android Security & Privacy Skill (`android-security-privacy`)

This skill outlines mandatory security and privacy rules for handling third-party authentication and data extraction within Android applications.

## Key Security Mandates

### 1. Zero Credential Retention Policy
- **NO Password Harvesting**: Never attempt to read, capture, or store user credentials (usernames, passwords, 2FA tokens).
- **Native Browser Delegation**: Authentication MUST take place strictly within the standard Web site login form loaded in `WebView`.
- **No Local Logins Storage**: Do not save session cookies or credentials into application databases or `SharedPreferences`.

### 2. WebView Security Hardening
- **Disable Insecure Features**:
  ```kotlin
  webView.settings.apply {
      allowFileAccess = false
      allowContentAccess = false
      setSupportMultipleWindows(false)
      // Enable JS only for parsing logic
      javaScriptEnabled = true
  }
  ```
- **JavaScript Interface Protection**: If using `@JavascriptInterface`, annotate methods strictly and validate all incoming data payloads to avoid Remote Code Execution (RCE).
- **HTTPS Enforcement**: Block HTTP traffic (`usesCleartextTraffic="false"` in `AndroidManifest.xml`).

### 3. Safe File Sharing via FileProvider
- Never store generated KML files in public external storage without permissions.
- Store temporary KML files in `context.cacheDir` or `context.filesDir` under a `kml/` subdirectory.
- Configure `res/xml/file_paths.xml` strictly:
  ```xml
  <paths>
      <cache-path name="kml_export" path="kml/" />
  </paths>
  ```
- Use `FLAG_GRANT_READ_URI_PERMISSION` when launching the KML Intent.
