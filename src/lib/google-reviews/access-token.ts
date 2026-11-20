import { getGoogleReviewsOAuthConfig } from "./oauth";
import { decryptGoogleReviewsRefreshToken } from "./token-encryption";

export async function refreshGoogleReviewsAccessToken(
  encryptedRefreshToken: string,
): Promise<string> {
  const { clientId, clientSecret } = getGoogleReviewsOAuthConfig();

  const refreshToken = decryptGoogleReviewsRefreshToken(encryptedRefreshToken);

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) {
    throw new Error(
      `Google Reviews token refresh failed (HTTP ${response.status}).`,
    );
  }

  const tokens = (await response.json()) as {
    access_token?: unknown;
  };

  if (typeof tokens.access_token !== "string" || !tokens.access_token) {
    throw new Error("Google did not return a Reviews access token.");
  }

  return tokens.access_token;
}
