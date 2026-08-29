// Google Maps' native saved-list UI (not My Maps) — see ADR-0008. No picker/Drive iframe origin
// is needed here: unlike the superseded My Maps KML upload, this flow never leaves the top frame.
export const GOOGLE_MAPS_ORIGINS = ['https://www.google.com/maps/*'] as const;
