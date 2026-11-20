import { timingSafeEqual } from "node:crypto";
import { previewWhatsAppWorker } from "@/lib/whatsapp/process";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const privateHeaders = {
  "Cache-Control": "no-store",
};

function isAuthorizedCronRequest(request: Request): boolean {
  const secret = process.env.CRON_SECRET;

  if (!secret || secret.length < 32) {
    return false;
  }

  const authorization = request.headers.get("authorization");

  if (!authorization?.startsWith("Bearer ")) {
    return false;
  }

  const provided = authorization.slice("Bearer ".length);

  const expectedBuffer = Buffer.from(secret);
  const providedBuffer = Buffer.from(provided);

  if (expectedBuffer.length !== providedBuffer.length) {
    return false;
  }

  return timingSafeEqual(expectedBuffer, providedBuffer);
}

export async function GET(request: Request) {
  if (!isAuthorizedCronRequest(request)) {
    return Response.json(
      { error: "Unauthorized" },
      {
        status: 401,
        headers: privateHeaders,
      },
    );
  }

  // Preview and sending are independently controlled.
  // Neither is enabled by default.
  const previewEnabled = process.env.TEFF_WHATSAPP_PREVIEW_ENABLED === "true";

  const sendingEnabled = process.env.TEFF_WHATSAPP_SENDING_ENABLED === "true";

  if (!previewEnabled) {
    return Response.json(
      {
        status: "disabled",
        processed: 0,
        sent: 0,
      },
      { headers: privateHeaders },
    );
  }

  // Never send messages from this preview endpoint,
  // even if the sending flag is enabled.
  if (sendingEnabled) {
    return Response.json(
      {
        error: "Preview unavailable while sending is enabled",
        processed: 0,
        sent: 0,
      },
      {
        status: 503,
        headers: privateHeaders,
      },
    );
  }

  try {
    const result = await previewWhatsAppWorker();

    return Response.json(result, {
      headers: privateHeaders,
    });
  } catch {
    // Do not expose database or customer information.
    return Response.json(
      {
        error: "WhatsApp preview unavailable",
        processed: 0,
        sent: 0,
      },
      {
        status: 503,
        headers: privateHeaders,
      },
    );
  }
}
