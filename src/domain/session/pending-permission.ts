// Pure TTL check for `SessionRoot.pendingPermission` (see session model + message-router's
// `routePermissionGranted`). A permission grant can arrive long after the popup that requested
// it died on denial (see App.tsx), so a stale intent must not trigger a job off some much-later
// unrelated grant. Boundary is inclusive: exactly `ttlMs` old still counts as fresh.
export function isPendingPermissionFresh(pendingAt: number, now: number, ttlMs: number): boolean {
  return now - pendingAt <= ttlMs;
}
