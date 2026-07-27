---
name: google-my-maps-web-import
description: Automate Google My Maps Web import from a Manifest V3 Chrome extension without Drive API or OAuth token handling. Use when implementing or spiking My Maps UI import, map creation, or KML file-input automation.
---

# Google My Maps Web Import

- My Maps has no public KML-to-map creation API; automate only the Web UI in the user authenticated Chrome session.
- Generate KML in memory from name, address, and description (URL-first) only.
- Never read credentials, cookies, or tokens.
- Version selectors, use timeouts, and raise MyMapsUiChanged for any unexpected UI state.
- **v1 scope**: create a **new** map only (existing-map picker deferred).
- Require a feasibility spike meeting [ADR-0004](../../../docs/explanation/adr/0004-extension-implementation-baseline.md) pass criteria before full implementation.
- Inject the My Maps content script programmatically after optional host permission is granted.
