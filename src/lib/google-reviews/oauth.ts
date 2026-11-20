const GOOGLE_REVIEWS_SCOPE = "https://www.googleapis.com/auth/business.manage";

export function getGoogleReviewsOAuthConfig() {
  const clientId = process.env.TEFF_GOOGLE_REVIEWS_CLIENT_ID?.trim();
  const clientSecret = process.env.TEFF_GOOGLE_REVIEWS_CLIENT_SECRET?.trim();
  const redirectUri = process.env.TEFF_GOOGLE_REVIEWS_REDIRECT_URI?.trim();

  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error("Google Reviews OAuth configuration is incomplete.");
  }

  return { clientId, clientSecret, redirectUri };
}

export function buildGoogleReviewsAuthorizationUrl(state: string): URL {
  const { clientId, redirectUri } = getGoogleReviewsOAuthConfig();

  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");

  url.search = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: GOOGLE_REVIEWS_SCOPE,
    access_type: "offline",
    prompt: "consent",
    state,
  }).toString();

  return url;
}
