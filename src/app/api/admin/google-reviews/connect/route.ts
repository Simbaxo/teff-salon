import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import {
  buildGoogleReviewsAuthorizationUrl,
  getGoogleReviewsOAuthConfig,
} from "@/lib/google-reviews/oauth";

export async function POST(request: Request) {
  const session = await auth();

  // Only TEFF's owner can authorize Google Business Profile access.
  if (session?.user?.role !== "OWNER") {
    return Response.json({ error: "Acceso denegado" }, { status: 403 });
  }

  const { redirectUri } = getGoogleReviewsOAuthConfig();
  const origin = new URL(redirectUri).origin;

  // Prevent authorization requests from unexpected origins.
  if (request.headers.get("origin") !== origin) {
    return Response.json({ error: "Origen no permitido" }, { status: 403 });
  }

  const state = randomBytes(32).toString("hex");

  const response = NextResponse.redirect(
    buildGoogleReviewsAuthorizationUrl(state),
    303,
  );

  response.cookies.set("teff_google_reviews_state", state, {
    httpOnly: true,
    secure: new URL(origin).protocol === "https:",
    sameSite: "lax",
    path: "/api/admin/google-reviews/callback",
    maxAge: 10 * 60,
  });

  return response;
}
