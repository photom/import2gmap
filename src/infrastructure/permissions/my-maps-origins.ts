// The KML upload dialog is a cross-origin docs.google.com/picker iframe (see messaging
// protocol §6 / spike results); executeScript into it needs its own host permission. Shared
// between the popup (which requests these before opening the My Maps tab) and the background
// worker (which re-checks them via `permissions.contains` when resuming after the permission
// prompt kills the popup — see message-router's `routePermissionGranted`).
export const MY_MAPS_ORIGINS = ['https://www.google.com/maps/*', 'https://docs.google.com/picker*'] as const;
