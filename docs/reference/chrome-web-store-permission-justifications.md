# Chrome Web Store submission: permission justifications

Text to paste into the Chrome Web Store Developer Dashboard under
**Privacy practices → Permission justification**. Each field has a 1,000-character limit;
every entry below is within it. Reflects the [ADR-0008](../explanation/adr/0008-google-maps-saved-list-import.md) Google Maps native saved-list import path (no My Maps, no `docs.google.com/picker*`).

Manifest for the submitted version (`output/chrome-mv3/manifest.json`):

```json
"permissions": ["storage", "activeTab", "scripting"],
"optional_host_permissions": [
  "https://tabelog.com/*",
  "https://www.tabelog.com/*",
  "https://www.google.com/maps/*"
],
"content_scripts": []
```

Whenever a permission is added or removed, update this document in the same change — a
version that requests an unnecessary permission is rejected during review.

---

## storage justification

```text
This extension stores one session-scoped record so its three execution contexts — the
popup, the MV3 service worker, and the injected content scripts — can share state.

It uses chrome.storage.session only (never local or sync), under a single key. The record
holds the current step of the multi-step UI and the extracted restaurant list (name,
address, and public tabelog.com URL of restaurants the user themselves saved), so it
survives between the extract step and the later import step.

In-memory state is not sufficient: an MV3 service worker is terminated between events, and
Chrome's own optional-permission dialog takes focus and destroys the popup's execution
context, so the state must outlive both.

The data is session-scoped: it is never written to disk, is cleared when the browser
closes, and can be discarded at any time from the popup. Nothing is sent to any server.
```

## activeTab justification

```text
The extension only ever runs when the user clicks its toolbar icon while viewing their own
saved-restaurant list on tabelog.com.

activeTab is used at that moment to read the active tab's URL, so the popup can determine
whether the user is actually on a Tabelog saved-list page, and either enable the extract
button or ask them to open that page first. It also provides the tab id that the extension
needs in order to target its messages and its script injection at that one tab.

activeTab is used instead of the broader "tabs" permission so the extension never has
visibility into any tab other than the one the user explicitly invoked it on.
```

## scripting justification

```text
The manifest declares no static content scripts (content_scripts is empty). Every content
script is injected programmatically with chrome.scripting.executeScript, only after the
user explicitly starts an action and only after they have granted the matching optional
host permission.

Two injections are required:

1. Into the user's Tabelog saved-list tab, to read the entries (restaurant name, address,
public restaurant URL) from the page the user is already viewing, and to follow the list's
pagination.

2. Into the Google Maps tab that the extension opens, to check whether a saved list named
食べログ already exists and create it if it doesn't, using Google Maps' own saved-list UI.

Re-injection is necessary after every page navigation, because a programmatically injected
script's execution context is destroyed when its document navigates.

Injecting on demand rather than declaring static content scripts keeps the extension
completely inert on every page until the user asks for an import.
```

## Are you using remote code?

Select **No, I am not using remote code**.

Everything the extension runs is bundled inside its package. It loads no scripts from
external hosts, has no modules pointing at external files, and evaluates no strings through
`eval()`.

---

# Drafts for fields not visible in the captured screenshot

Because the manifest declares `optional_host_permissions`, the same page should also have a
**Host permission justification** field, and the store listing requires a **Single purpose**
statement. The drafts below have not been checked against the live form — adjust them to
match the actual field wording.

## Host permission justification

```text
All host permissions are optional and are requested at the moment of use, never at install
time. The extension is inert until the user explicitly starts an extraction or an import.

https://tabelog.com/* and https://www.tabelog.com/*
Requested when the user asks to extract. The extension reads the restaurant entries — name,
address, and public restaurant URL — from the saved-restaurant list page the user is
already viewing in their own account, and follows that list's pagination to cover every
page. It does not read account details or the user's private memos.

https://www.google.com/maps/*
Requested when the user asks to import. The extension opens Google Maps and, using its
native saved-list UI, checks whether a saved list named 食べログ already exists and
creates it if not.
```

## Single purpose

```text
Import the restaurants a user has saved on tabelog.com into a Google Maps saved list.
```

---

# Privacy-related submission fields

## Privacy policy URL

**Privacy practices → Privacy policy URL** is mandatory. The published policy lives at
[`PRIVACY.md`](../../PRIVACY.md) in the repository root. Supply either a GitHub Pages URL or
the file's permalink on the public repository.

## Data usage disclosure

Declare as follows, so the submission stays consistent with `PRIVACY.md`. The checkbox
wording changes over time — check the live form and adjust.

| Item | Declare | Reason |
| :--- | :--- | :--- |
| Personally identifiable information | Not collected | The user's name, email and phone number are never read |
| Health / Financial information | Not collected | Payment and loyalty-point data are never read |
| Authentication information | Not collected | Cookies, tokens and passwords are never touched |
| Personal communications | Not collected | Memos and comments on saved restaurants are never read |
| Location | Not collected | The addresses read are those of **restaurants**, not of the user |
| Web history | Not collected | Browsing history is never read |
| User activity | Not collected | The extension contains no analytics or tracking |
| Website content | **Collected** | Restaurant name, address and URL are read from the saved-list page the user has open |

All three certifications apply:

- Data is not being used or transferred for purposes unrelated to the single purpose
- Data is not being sold to third parties
- Data is not being used or transferred to determine creditworthiness or for lending purposes

Declaring "Website content" as collected does not contradict the policy: that data stays on
the device, and reaches the user's own Google Maps saved list only through an explicit user
action. `PRIVACY.md` §5 states this.
