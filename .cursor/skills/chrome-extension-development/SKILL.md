---
name: chrome-extension-development
description: Build desktop Chrome extensions with Manifest V3, TypeScript, service workers, content scripts, and extension UI.
---

# Chrome Extension Development

- Use Manifest V3, bundled code only, and a service worker for coordination.
- Keep popup UI separate from content scripts and validate all messages.
- Prefer activeTab and narrow optional host permissions; explain every permission.
- Isolate target-site selectors and use bounded waits with explicit failures.
