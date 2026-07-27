# ADR-0003: Chrome Extension for Automated My Maps Web Import

- **Status**: Accepted
- **Date**: 2026-07-27
- **Authors**: User & Codex

## Context

The product imports restaurants into the user's My Maps without a manual file handoff.

## Decision

- **Chosen Option**: a desktop Chrome Manifest V3 extension.
- Content scripts extract only name, address, and Tabelog URL; create KML in memory; then use the authenticated My Maps Web UI to create a map/layer and import it.
- The user explicitly starts extraction and import. The extension never reads credentials, cookies, OAuth tokens, or profile data.
- Use narrow Tabelog and My Maps host permissions. Do not use the cookies API, broad-host access, or remote code.
- Selector/UI mismatch is an explicit failure; no partial result is success.

## Consequences

- My Maps UI automation needs a feasibility spike, selector isolation, sanitized fixtures, and Chrome Web Store/target-site policy review.
- Implementation defaults (permissions, UX steps, toolchain, session storage, spike pass criteria) are recorded in [ADR-0004](0004-extension-implementation-baseline.md).
