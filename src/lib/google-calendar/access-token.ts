import { getGoogleCalendarOAuthConfig } from "./oauth";
import { decryptGoogleCalendarRefreshToken } from "./token-encryption";

export async function refreshGoogleCalendarAccessToken(
  encryptedRefreshToken: string,
): Promise<string> {
  const { clientId, clientSecret } = getGoogleCalendarOAuthConfig();
  const refreshToken = decryptGoogleCalendarRefreshToken(encryptedRefreshToken);

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) {
    throw new Error(
      `Google Calendar token refresh failed (HTTP ${response.status}).`,
    );
  }

  const tokens = (await response.json()) as { access_token?: unknown };
  if (typeof tokens.access_token !== "string" || !tokens.access_token) {
    throw new Error("Google did not return a Calendar access token.");
  }

  return tokens.access_token;
}
