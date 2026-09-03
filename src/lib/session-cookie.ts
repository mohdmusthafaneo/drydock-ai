/** Current session cookie. Legacy `aidos_session` is still read so existing browsers can re-login. */
export const SESSION_COOKIE_NAME = "drydock_session";
export const LEGACY_SESSION_COOKIE_NAME = "aidos_session";
export const SESSION_MAX_AGE = 60 * 60 * 24 * 7;

export const DEV_AUTH_SECRET_FALLBACK =
  "aidos-dev-secret-change-me-in-production-32chars";
