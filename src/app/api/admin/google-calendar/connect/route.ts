import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import {
  buildGoogleCalendarAuthorizationUrl,
  getGoogleCalendarOAuthConfig,
} from "@/lib/google-calendar/oauth";

export async function POST(request: Request) {
  const session = await auth();

  if (session?.user?.role !== "OWNER") {
    return Response.json({ error: "Acceso denegado" }, { status: 403 });
  }

  const { redirectUri } = getGoogleCalendarOAuthConfig();
  const origin = new URL(redirectUri).origin;

  if (request.headers.get("origin") !== origin) {
    return Response.json({ error: "Origen no permitido" }, { status: 403 });
  }

  const state = randomBytes(32).toString("hex");
  const response = NextResponse.redirect(
    buildGoogleCalendarAuthorizationUrl(state),
    303,
  );

  response.cookies.set("teff_google_calendar_state", state, {
    httpOnly: true,
    secure: new URL(origin).protocol === "https:",
    sameSite: "lax",
    path: "/api/admin/google-calendar/callback",
    maxAge: 10 * 60,
  });

  return response;
}
