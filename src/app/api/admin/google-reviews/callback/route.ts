import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getGoogleReviewsOAuthConfig } from "@/lib/google-reviews/oauth";
import { encryptGoogleReviewsRefreshToken } from "@/lib/google-reviews/token-encryption";

const STATE_COOKIE = "teff_google_reviews_state";
const CALLBACK_PATH = "/api/admin/google-reviews/callback";

export async function GET(request: NextRequest) {
  const session = await auth();

  if (session?.user?.role !== "OWNER") {
    return NextResponse.json({ error: "Acceso denegado" }, { status: 403 });
  }

  // Always clear the temporary OAuth state cookie.
  function finish(
    body: { message: string } | { error: string },
    status: number,
  ) {
    const response = NextResponse.json(body, {
      status,
      headers: {
        "Cache-Control": "no-store",
      },
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
  const receivedState = request.nextUrl.searchParams.get("state");
  const code = request.nextUrl.searchParams.get("code");

  if (!expectedState || receivedState !== expectedState) {
    return finish(
      { error: "La solicitud de conexión no es válida o expiró." },
      400,
    );
  }

  if (request.nextUrl.searchParams.has("error") || !code) {
    return finish({ error: "Google no completó la autorización." }, 400);
  }

  try {
    const existing = await prisma.googleReviewsConnection.findUnique({
      where: { id: 1 },
      select: { id: true },
    });

    if (existing) {
      return finish({ error: "Google Reviews ya está conectado." }, 409);
    }

    const { clientId, clientSecret, redirectUri } =
      getGoogleReviewsOAuthConfig();

    const expectedCallback = new URL(redirectUri);

    if (request.nextUrl.pathname !== expectedCallback.pathname) {
      return finish({ error: "La ruta de conexión no coincide." }, 400);
    }

    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
        code,
      }),
      cache: "no-store",
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
        {
          error:
            "Google no entregó las credenciales necesarias para la conexión.",
        },
        502,
      );
    }

    const encryptedRefreshToken = encryptGoogleReviewsRefreshToken(
      tokens.refresh_token,
    );

    await prisma.googleReviewsConnection.create({
      data: {
        id: 1,
        encryptedRefreshToken,
      },
    });

    return finish(
      {
        message:
          "Autorización de Google Reviews guardada correctamente. Falta seleccionar la ubicación del negocio.",
      },
      200,
    );
  } catch {
    return finish(
      { error: "No se pudo guardar la conexión con Google Reviews." },
      500,
    );
  }
}
