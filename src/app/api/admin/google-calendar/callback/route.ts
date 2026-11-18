import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { TEFF_TIME_ZONE } from "@/lib/datetime";
import { getGoogleCalendarOAuthConfig } from "@/lib/google-calendar/oauth";
import { encryptGoogleCalendarRefreshToken } from "@/lib/google-calendar/token-encryption";
import { prisma } from "@/lib/prisma";
import type { NextRequest } from "next/server";

const STATE_COOKIE = "teff_google_calendar_state";
const CALLBACK_PATH = "/api/admin/google-calendar/callback";

export async function GET(request: NextRequest) {
  const session = await auth();

  if (session?.user?.role !== "OWNER") {
    return NextResponse.json({ error: "Acceso denegado" }, { status: 403 });
  }

  function finish(
    body: { message: string } | { error: string },
    status: number,
  ) {
    const response = NextResponse.json(body, {
      status,
      headers: { "Cache-Control": "no-store" },
    });

    response.cookies.set(STATE_COOKIE, "", {
      httpOnly: true,
      secure: request.nextUrl.protocol === "https:",
      sameSite: "lax",
      path: CALLBACK_PATH,
      maxAge: 0,
    });

    return response;
  }

  const expectedState = request.cookies.get(STATE_COOKIE)?.value;
  const state = request.nextUrl.searchParams.get("state");
  const code = request.nextUrl.searchParams.get("code");

  if (!expectedState || state !== expectedState) {
    return finish(
      { error: "La solicitud de conexión no es válida o expiró." },
      400,
    );
  }

  if (request.nextUrl.searchParams.has("error") || !code) {
    return finish({ error: "Google no completó la autorización." }, 400);
  }

  try {
    const existing = await prisma.googleCalendarConnection.findUnique({
      where: { id: 1 },
      select: { id: true },
    });

    if (existing) {
      return finish({ error: "Google Calendar ya está conectado." }, 409);
    }

    const calendarName = process.env.TEFF_GOOGLE_CALENDAR_NAME?.trim();

    if (!calendarName) {
      return finish(
        { error: "Falta configurar el nombre del calendario." },
        500,
      );
    }

    const { clientId, clientSecret, redirectUri } =
      getGoogleCalendarOAuthConfig();

    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
        code,
      }),
      signal: AbortSignal.timeout(10_000),
    });

    if (!tokenResponse.ok) {
      return finish({ error: "Google no pudo validar la autorización." }, 502);
    }

    const tokens = (await tokenResponse.json()) as {
      access_token?: string;
      refresh_token?: string;
    };

    if (!tokens.access_token || !tokens.refresh_token) {
      return finish(
        { error: "Google no entregó las credenciales de sincronización." },
        502,
      );
    }

    const encryptedRefreshToken = encryptGoogleCalendarRefreshToken(
      tokens.refresh_token,
    );

    const calendarResponse = await fetch(
      "https://www.googleapis.com/calendar/v3/calendars",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${tokens.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          summary: calendarName,
          timeZone: TEFF_TIME_ZONE,
        }),
        signal: AbortSignal.timeout(10_000),
      },
    );

    if (!calendarResponse.ok) {
      return finish(
        { error: "Google no pudo crear el calendario de prueba." },
        502,
      );
    }

    const calendar = (await calendarResponse.json()) as { id?: string };

    if (!calendar.id) {
      return finish({ error: "Google no devolvió el ID del calendario." }, 502);
    }

    await prisma.googleCalendarConnection.create({
      data: {
        id: 1,
        calendarId: calendar.id,
        encryptedRefreshToken,
      },
    });

    return finish({ message: "Calendario de prueba conectado." }, 200);
  } catch {
    return finish(
      { error: "No se pudo guardar la conexión con Google Calendar." },
      500,
    );
  }
}
