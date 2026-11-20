import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { refreshGoogleReviewsAccessToken } from "@/lib/google-reviews/access-token";

const ACCOUNT_NAME = "accounts/111868229707818970925";

export async function GET() {
  const session = await auth();

  if (session?.user?.role !== "OWNER") {
    return Response.json({ error: "Acceso denegado" }, { status: 403 });
  }

  const headers = { "Cache-Control": "no-store" };

  try {
    const connection = await prisma.googleReviewsConnection.findUnique({
      where: { id: 1 },
      select: { encryptedRefreshToken: true },
    });

    if (!connection) {
      return Response.json(
        { error: "Google Business Profile no está conectado." },
        { status: 409, headers },
      );
    }

    const accessToken = await refreshGoogleReviewsAccessToken(
      connection.encryptedRefreshToken,
    );

    const locations: {
      name: string;
      title: string;
      address: string | null;
    }[] = [];

    let pageToken: string | undefined;
    const seenPageTokens = new Set<string>();

    for (let page = 0; page < 20; page++) {
      const url = new URL(
        `https://mybusinessbusinessinformation.googleapis.com/v1/${ACCOUNT_NAME}/locations`,
      );

      url.searchParams.set("readMask", "name,title,storefrontAddress");
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
        console.error(
          "Google Business Profile location lookup failed:",
          response.status,
        );

        return Response.json(
          { error: "No se pudieron consultar las ubicaciones." },
          { status: 502, headers },
        );
      }

      const data = (await response.json()) as {
        locations?: {
          name?: string;
          title?: string;
          storefrontAddress?: {
            addressLines?: string[];
            locality?: string;
          };
        }[];
        nextPageToken?: string;
      };

      for (const location of data.locations ?? []) {
        if (!location.name?.startsWith("locations/")) continue;

        const address = location.storefrontAddress;

        locations.push({
          name: location.name,
          title: location.title ?? "",
          address: address
            ? [...(address.addressLines ?? []), address.locality]
                .filter(Boolean)
                .join(", ")
            : null,
        });
      }

      pageToken = data.nextPageToken;

      if (!pageToken) {
        return Response.json(
          { accountName: ACCOUNT_NAME, locations },
          { headers },
        );
      }

      if (seenPageTokens.has(pageToken)) {
        break;
      }

      seenPageTokens.add(pageToken);
    }

    return Response.json(
      { error: "La consulta superó el límite de páginas." },
      { status: 502, headers },
    );
  } catch (error) {
    console.error(
      "Google Reviews location lookup error:",
      error instanceof Error ? error.name : "Unknown error",
    );

    return Response.json(
      { error: "No se pudo completar la consulta de ubicaciones." },
      { status: 500, headers },
    );
  }
}
