const GOOGLE_CALENDAR_SCOPE =
  "https://www.googleapis.com/auth/calendar.app.created";

export function getGoogleCalendarOAuthConfig() {
  const clientId = process.env.TEFF_GOOGLE_CALENDAR_CLIENT_ID?.trim();
  const clientSecret = process.env.TEFF_GOOGLE_CALENDAR_CLIENT_SECRET?.trim();
  const redirectUri = process.env.TEFF_GOOGLE_CALENDAR_REDIRECT_URI?.trim();

  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error("Google Calendar OAuth configuration is incomplete.");
  }

  return { clientId, clientSecret, redirectUri };
}

export function buildGoogleCalendarAuthorizationUrl(state: string): URL {
  const { clientId, redirectUri } = getGoogleCalendarOAuthConfig();
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");

  url.search = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: GOOGLE_CALENDAR_SCOPE,
    access_type: "offline",
    prompt: "consent",
    state,
  }).toString();

  return url;
}
