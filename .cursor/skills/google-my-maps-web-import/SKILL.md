---
name: google-my-maps-web-import
description: Automate Google My Maps Web import from a Manifest V3 Chrome extension without Drive API or OAuth token handling.
---

# Google My Maps Web Import

- My Maps has no public KML-to-map creation API; automate only the Web UI in the user authenticated Chrome session.
- Generate KML in memory from name, address, and Tabelog URL only.
- Never read credentials, cookies, or tokens.
- Version selectors, use timeouts, and raise MyMapsUiChanged for any unexpected UI state.
- Require a feasibility spike and sanitized integration fixtures before implementation.
