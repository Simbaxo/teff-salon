import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { refreshGoogleReviewsAccessToken } from "@/lib/google-reviews/access-token";

export async function GET() {
  const session = await auth();

  if (session?.user?.role !== "OWNER") {
    return Response.json({ error: "Acceso denegado" }, { status: 403 });
  }

  try {
    const connection = await prisma.googleReviewsConnection.findUnique({
      where: { id: 1 },
      select: { encryptedRefreshToken: true },
    });

    if (!connection) {
      return Response.json(
        { error: "Google Business Profile no está conectado." },
        { status: 409 },
      );
    }

    const accessToken = await refreshGoogleReviewsAccessToken(
      connection.encryptedRefreshToken,
    );

    const accounts: {
      name: string;
      accountName: string;
      type: string;
    }[] = [];

    let pageToken: string | undefined;

    // Google returns at most 20 accounts per page.
    // Limit requests to avoid unexpected pagination loops.
    for (let page = 0; page < 20; page++) {
      const url = new URL(
        "https://mybusinessaccountmanagement.googleapis.com/v1/accounts",
      );

      url.searchParams.set("pageSize", "20");

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
          "Google Business Profile account lookup failed:",
          response.status,
        );

        return Response.json(
          {
            error:
              "No se pudieron consultar las cuentas de Google Business Profile.",
          },
          {
            status: 502,
            headers: { "Cache-Control": "no-store" },
          },
        );
      }

      const data = (await response.json()) as {
        accounts?: {
          name?: string;
          accountName?: string;
          type?: string;
        }[];
        nextPageToken?: string;
      };

      for (const account of data.accounts ?? []) {
        if (account.name?.startsWith("accounts/")) {
          accounts.push({
            name: account.name,
            accountName: account.accountName ?? "",
            type: account.type ?? "",
          });
        }
      }

      pageToken = data.nextPageToken;

      if (!pageToken) {
        return Response.json(
          { accounts },
          { headers: { "Cache-Control": "no-store" } },
        );
      }
    }

    return Response.json(
      { error: "La consulta de cuentas superó el límite de páginas." },
      { status: 502, headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error(
      "Google Reviews account lookup error:",
      error instanceof Error ? error.name : "Unknown error",
    );

    return Response.json(
      { error: "No se pudo completar la consulta de cuentas." },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
