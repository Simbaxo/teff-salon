import { get } from "@vercel/blob";
import { prisma } from "@/lib/prisma";
import { getExpenseStaff } from "@/lib/expenses/staff-auth";

export const runtime = "nodejs";

const noStoreHeaders = {
  "Cache-Control": "private, no-store",
};

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const staff = await getExpenseStaff();

  if (!staff.success) {
    return Response.json(
      { error: staff.error },
      { status: staff.status, headers: noStoreHeaders },
    );
  }

  const { id } = await context.params;
  const receiptId = Number(id);

  if (!Number.isSafeInteger(receiptId) || receiptId <= 0) {
    return Response.json(
      { error: "Recibo inválido." },
      { status: 400, headers: noStoreHeaders },
    );
  }

  const token = process.env.TEFF_RECEIPTS_BLOB_TOKEN;

  if (!token) {
    return Response.json(
      { error: "Almacenamiento de recibos no configurado." },
      { status: 503, headers: noStoreHeaders },
    );
  }

  try {
    const receipt = await prisma.expenseReceipt.findFirst({
      where: {
        id: receiptId,
        ...(staff.role === "RECEPTIONIST"
          ? {
              expense: {
                createdById: staff.userId,
              },
            }
          : {}),
      },
      select: {
        blobPathname: true,
        originalName: true,
        mimeType: true,
        sizeBytes: true,
      },
    });

    if (!receipt) {
      return Response.json(
        { error: "Recibo no encontrado." },
        { status: 404, headers: noStoreHeaders },
      );
    }

    const result = await get(receipt.blobPathname, {
      access: "private",
      token,
      useCache: false,
    });

    if (!result) {
      return Response.json(
        { error: "El archivo del recibo no está disponible." },
        { status: 404, headers: noStoreHeaders },
      );
    }

    if (result.statusCode !== 200) {
      return Response.json(
        { error: "No se pudo recuperar el archivo." },
        { status: 502, headers: noStoreHeaders },
      );
    }

    // Use a fixed extension and safe filename rather than trusting
    // the original filename in an HTTP response header.
    const extension =
      receipt.mimeType === "application/pdf"
        ? "pdf"
        : receipt.mimeType === "image/png"
          ? "png"
          : receipt.mimeType === "image/webp"
            ? "webp"
            : "jpg";

    const filename = `recibo-${receiptId}.${extension}`;

    return new Response(result.stream, {
      status: 200,
      headers: {
        ...noStoreHeaders,
        "Content-Type": receipt.mimeType,
        "Content-Disposition": `attachment; filename="${filename}"`,
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "sandbox",
      },
    });
  } catch (error) {
    console.error("Failed to download expense receipt:", error);

    return Response.json(
      { error: "No se pudo descargar el recibo." },
      { status: 500, headers: noStoreHeaders },
    );
  }
}
