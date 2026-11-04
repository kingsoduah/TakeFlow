// Confirmed Roqqu integration facts. Header NAMES and base URL only.
// Actual keys live in server-side env vars and are never committed.
// No API calls are made from this module (Phase 1).
export const ROQQU_BASE_URL = 'https://service.roqqu.com/v1';

// Confirmed by the developer via successful Postman staging tests.
export const ROQQU_STAGING_API_KEY_HEADER = 'x-staging-api-key';

// Live header per ROQQU_API_REFERENCE.md (unstaged, unverified in sandbox).
export const ROQQU_LIVE_API_KEY_HEADER = 'x-api-key';
