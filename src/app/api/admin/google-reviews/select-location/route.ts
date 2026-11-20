import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { refreshGoogleReviewsAccessToken } from "@/lib/google-reviews/access-token";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ACCOUNT_NAME = "accounts/111868229707818970925";

const headers = {
  "Cache-Control": "no-store",
};

export async function POST(request: Request) {
  const session = await auth();

  if (session?.user?.role !== "OWNER") {
    return Response.json(
      { error: "Acceso denegado." },
      { status: 403, headers },
    );
  }

  const origin = request.headers.get("origin");
  const expectedOrigin = new URL(request.url).origin;

  if (!origin || origin !== expectedOrigin) {
    return Response.json(
      { error: "Origen de solicitud no válido." },
      { status: 403, headers },
    );
  }

  let locationName: unknown;

  try {
    const body = await request.json();
    locationName = body?.locationName;
  } catch {
    return Response.json(
      { error: "Solicitud no válida." },
      { status: 400, headers },
    );
  }

  if (
    typeof locationName !== "string" ||
    !/^locations\/\d+$/.test(locationName)
  ) {
    return Response.json(
      { error: "Selecciona una ubicación válida." },
      { status: 400, headers },
    );
  }

  try {
    const connection = await prisma.googleReviewsConnection.findUnique({
      where: { id: 1 },
      select: {
        encryptedRefreshToken: true,
        accountName: true,
        locationName: true,
      },
    });

    if (!connection) {
      return Response.json(
        { error: "Primero debes conectar Google." },
        { status: 409, headers },
      );
    }

    // Do not silently switch a previously selected business.
    if (connection.accountName || connection.locationName) {
      return Response.json(
        { error: "El negocio ya está seleccionado." },
        { status: 409, headers },
      );
    }

    const accessToken = await refreshGoogleReviewsAccessToken(
      connection.encryptedRefreshToken,
    );

    let pageToken: string | undefined;
    let found = false;
    const seenTokens = new Set<string>();

    // Verify the chosen location is returned by the authorized account.
    for (let page = 0; page < 20; page++) {
      const url = new URL(
        `https://mybusinessbusinessinformation.googleapis.com/v1/${ACCOUNT_NAME}/locations`,
      );

      url.searchParams.set("readMask", "name,title");
      url.searchParams.set("pageSize", "100");

      if (pageToken) {
        url.searchParams.set("pageToken", pageToken);
      }

      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        cache: "no-store",
        signal: AbortSignal.timeout(10_000),
      });

      if (!response.ok) {
        return Response.json(
          { error: "Google no pudo verificar la ubicación." },
          { status: 502, headers },
        );
      }

      const data = (await response.json()) as {
        locations?: {
          name?: string;
          title?: string;
        }[];
        nextPageToken?: string;
      };

      if (data.locations?.some((location) => location.name === locationName)) {
        found = true;
        break;
      }

      pageToken = data.nextPageToken;

      if (!pageToken) break;

      if (seenTokens.has(pageToken)) {
        throw new Error("Repeated Google pagination token.");
      }

      seenTokens.add(pageToken);
    }

    if (!found) {
      return Response.json(
        { error: "La ubicación no pertenece a la cuenta autorizada." },
        { status: 400, headers },
      );
    }

    // Only select an unconfigured connection.
    // Never overwrite an existing business or encrypted token.
    const result = await prisma.googleReviewsConnection.updateMany({
      where: {
        id: 1,
        accountName: null,
        locationName: null,
      },
      data: {
        accountName: ACCOUNT_NAME,
        locationName,
      },
    });

    if (result.count !== 1) {
      return Response.json(
        { error: "La conexión cambió. Actualiza la página." },
        { status: 409, headers },
      );
    }

    return Response.json(
      { message: "Ubicación de Google guardada correctamente." },
      { headers },
    );
  } catch (error) {
    console.error(
      "Google Reviews location selection error:",
      error instanceof Error ? error.name : "Unknown error",
    );

    return Response.json(
      { error: "No se pudo guardar la ubicación de Google." },
      { status: 500, headers },
    );
  }
}
