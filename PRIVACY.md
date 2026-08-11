# Privacy Policy

**Applies to:** tabelog2gmap (Chrome extension)

**Contact:** Please open an issue at
[github.com/photom/import2gmap/issues](https://github.com/photom/import2gmap/issues) for any
question or request regarding this policy.

**Revision history:** This document is version-controlled. Its full change history, including
the date of every revision, is available in the repository's commit log.

---

## 1. Overview

tabelog2gmap is a Chrome extension that imports the restaurants a user has saved on
tabelog.com into that user's own Google My Maps.

**The extension has no developer-operated server.** No data is transmitted to the developer
or to any third-party analytics service. All processing happens locally in the user's
browser.

## 2. Data the extension reads

Only when the user clicks the extension's button to start an extraction, and only from the
Tabelog saved-list page the user is already viewing, the extension reads:

| Data | Purpose |
| :--- | :--- |
| Restaurant name | Name of the placemark in My Maps |
| Restaurant street address | To place the placemark on the map |
| Restaurant's public tabelog.com URL | Placemark description; duplicate detection |
| Area / cuisine-category text | Placemark description |
| Collection (label) name and id | Retained as the restaurant's grouping information |
| List counts and pagination controls | To crawl every page without missing entries |

## 3. Data the extension does NOT read

The extension never reads or stores:

- Cookies, access tokens, passwords, or any other credentials
- The user's account information (email address, phone number, profile photo, etc.)
- Personal memos or comments attached to saved restaurants
- Restaurant telephone numbers (skipped while parsing out the address)
- Payment information, loyalty points, or follow-graph data
- Any other page content

## 4. Storage and retention

Extracted data is stored only in `chrome.storage.session`.

- It is **never written to disk**.
- It is **cleared automatically when the browser session ends**.
- The user can discard it at any time from the popup.

`chrome.storage.local` and `chrome.storage.sync` are not used to store restaurant data.

## 5. Disclosure to third parties

No data is disclosed to the developer or to any third party. The extension contains no
advertising, analytics, or tracking components, and no data is ever sold.

The one exception, performed only at the user's explicit request: when the user chooses
"import to My Maps", the extracted restaurants are handed to **the user's own Google My
Maps account** as a KML file, through the user's own already-authenticated browser session.
The extension does not handle Google credentials or tokens at any point. Once imported, the
data is governed by Google's privacy policy.

## 6. Permissions

Host access to tabelog.com and Google My Maps is declared as **optional** and is requested
at the moment the user starts an extraction or an import — never at install time. If the
user declines, the extension does not act on any page.

The extension does not use remote code.

## 7. Changes to this policy

This page is updated in place when the policy changes. Because the document is
version-controlled, the exact content of any previous revision — and the date it changed —
can be inspected in the repository's commit history.

---

The developer-facing design document behind this policy is
[docs/explanation/security-privacy-model.md](docs/explanation/security-privacy-model.md).
If the two ever disagree, update both.
