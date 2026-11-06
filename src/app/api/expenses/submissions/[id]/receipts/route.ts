import { createHash } from "node:crypto";
import { del, put } from "@vercel/blob";
import { prisma } from "@/lib/prisma";
import { getExpenseStaff } from "@/lib/expenses/staff-auth";

export const runtime = "nodejs";

const noStoreHeaders = {
  "Cache-Control": "private, no-store",
};

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_PDF_BYTES = 10 * 1024 * 1024;
const MAX_RECEIPTS = 5;
const MAX_REQUEST_BYTES = MAX_PDF_BYTES + 256 * 1024;

function detectFileType(bytes: Uint8Array): {
  mimeType: string;
  extension: string;
  maxBytes: number;
} | null {
  if (
    bytes.length >= 3 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff
  ) {
    return {
      mimeType: "image/jpeg",
      extension: "jpg",
      maxBytes: MAX_IMAGE_BYTES,
    };
  }

  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return {
      mimeType: "image/png",
      extension: "png",
      maxBytes: MAX_IMAGE_BYTES,
    };
  }

  if (
    bytes.length >= 12 &&
    String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
    String.fromCharCode(...bytes.slice(8, 12)) === "WEBP"
  ) {
    return {
      mimeType: "image/webp",
      extension: "webp",
      maxBytes: MAX_IMAGE_BYTES,
    };
  }

  if (
    bytes.length >= 5 &&
    String.fromCharCode(...bytes.slice(0, 5)) === "%PDF-"
  ) {
    return {
      mimeType: "application/pdf",
      extension: "pdf",
      maxBytes: MAX_PDF_BYTES,
    };
  }

  return null;
}

function parseIdempotencyKey(
  value: FormDataEntryValue | null,
): string | null | "INVALID" {
  if (value === null) return null;

  if (
    typeof value !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      value,
    )
  ) {
    return "INVALID";
  }

  return value.toLowerCase();
}

type ReceiptDetails = {
  id: number;
  expenseId: number;
  uploadedById: number;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  contentSha256: string | null;
  createdAt: Date;
};

function retryResponse(
  receipt: ReceiptDetails,
  expenseId: number,
  userId: number,
  file: File,
  mimeType: string,
  checksum: string,
): Response {
  if (receipt.expenseId !== expenseId || receipt.uploadedById !== userId) {
    return Response.json(
      { error: "Referencia de comprobante no disponible." },
      { status: 409, headers: noStoreHeaders },
    );
  }

  if (
    receipt.contentSha256 !== checksum ||
    receipt.originalName !== file.name ||
    receipt.mimeType !== mimeType ||
    receipt.sizeBytes !== file.size
  ) {
    return Response.json(
      { error: "Esta referencia pertenece a otro archivo." },
      { status: 409, headers: noStoreHeaders },
    );
  }

  return Response.json(
    {
      success: true,
      duplicate: true,
      receipt: {
        id: receipt.id,
        originalName: receipt.originalName,
        mimeType: receipt.mimeType,
        sizeBytes: receipt.sizeBytes,
        createdAt: receipt.createdAt,
      },
    },
    { status: 200, headers: noStoreHeaders },
  );
}

export async function POST(
  request: Request,
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
  const expenseId = Number(id);

  if (!Number.isSafeInteger(expenseId) || expenseId <= 0) {
    return Response.json(
      { error: "Gasto inválido." },
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
    const expense = await prisma.expense.findFirst({
      where: {
        id: expenseId,
        ...(staff.role === "RECEPTIONIST" ? { createdById: staff.userId } : {}),
      },
      select: {
        id: true,
        reviewStatus: true,
        _count: { select: { receipts: true } },
      },
    });

    if (!expense) {
      return Response.json(
        { error: "Gasto no encontrado." },
        { status: 404, headers: noStoreHeaders },
      );
    }

    const contentLength = request.headers.get("content-length");

    if (contentLength !== null) {
      const declaredSize = Number(contentLength);

      if (
        !Number.isSafeInteger(declaredSize) ||
        declaredSize < 0 ||
        declaredSize > MAX_REQUEST_BYTES
      ) {
        return Response.json(
          { error: "El archivo supera el tamaño permitido." },
          { status: 413, headers: noStoreHeaders },
        );
      }
    }

    const contentType = request.headers.get("content-type") ?? "";

    if (!/^multipart\/form-data\s*;/i.test(contentType)) {
      return Response.json(
        { error: "La solicitud debe contener un archivo." },
        { status: 415, headers: noStoreHeaders },
      );
    }

    const formData = await request.formData();
    const file = formData.get("file");
    const idempotencyKey = parseIdempotencyKey(formData.get("idempotencyKey"));

    if (idempotencyKey === "INVALID") {
      return Response.json(
        { error: "Referencia de comprobante inválida." },
        { status: 400, headers: noStoreHeaders },
      );
    }

    if (!(file instanceof File)) {
      return Response.json(
        { error: "Selecciona una imagen o PDF." },
        { status: 400, headers: noStoreHeaders },
      );
    }

    if (
      file.size === 0 ||
      file.size > MAX_PDF_BYTES ||
      file.name.length > 255
    ) {
      return Response.json(
        { error: "Archivo vacío, demasiado grande o nombre inválido." },
        { status: 400, headers: noStoreHeaders },
      );
    }

    const bytes = new Uint8Array(await file.arrayBuffer());
    const detected = detectFileType(bytes);

    if (!detected || file.size > detected.maxBytes) {
      return Response.json(
        { error: "Formato o tamaño no permitido." },
        { status: 400, headers: noStoreHeaders },
      );
    }

    const contentSha256 = createHash("sha256").update(bytes).digest("hex");

    // Completed retries must work even after approval or receipt limit.
    if (idempotencyKey !== null) {
      const existing = await prisma.expenseReceipt.findUnique({
        where: { idempotencyKey },
        select: {
          id: true,
          expenseId: true,
          uploadedById: true,
          originalName: true,
          mimeType: true,
          sizeBytes: true,
          contentSha256: true,
          createdAt: true,
        },
      });

      if (existing) {
        return retryResponse(
          existing,
          expenseId,
          staff.userId,
          file,
          detected.mimeType,
          contentSha256,
        );
      }
    }

    if (expense.reviewStatus !== "PENDING_REVIEW") {
      return Response.json(
        { error: "Solo puedes adjuntar recibos a gastos pendientes." },
        { status: 409, headers: noStoreHeaders },
      );
    }

    if (expense._count.receipts >= MAX_RECEIPTS) {
      return Response.json(
        { error: "Este gasto ya tiene el máximo de cinco recibos." },
        { status: 409, headers: noStoreHeaders },
      );
    }

    const pathname =
      `expense-receipts/${expenseId}/` +
      `${crypto.randomUUID()}.${detected.extension}`;

    const blob = await put(pathname, file, {
      access: "private",
      token,
      contentType: detected.mimeType,
      addRandomSuffix: true,
      maximumSizeInBytes: detected.maxBytes,
    });

    try {
      const result = await prisma.$transaction(async (tx) => {
        await tx.$queryRaw`
          SELECT id
          FROM "Expense"
          WHERE id = ${expenseId}
          FOR UPDATE
        `;

        // A concurrent request may have saved the same UUID.
        if (idempotencyKey !== null) {
          const existing = await tx.expenseReceipt.findUnique({
            where: { idempotencyKey },
            select: {
              id: true,
              expenseId: true,
              uploadedById: true,
              originalName: true,
              mimeType: true,
              sizeBytes: true,
              contentSha256: true,
              createdAt: true,
            },
          });

          if (existing) {
            return { existing } as const;
          }
        }

        const currentExpense = await tx.expense.findFirst({
          where: {
            id: expenseId,
            reviewStatus: "PENDING_REVIEW",
            ...(staff.role === "RECEPTIONIST"
              ? { createdById: staff.userId }
              : {}),
          },
          select: { id: true },
        });

        if (!currentExpense) {
          return {
            error: "El gasto ya no está pendiente o no tienes acceso.",
            status: 409,
          } as const;
        }

        const receiptCount = await tx.expenseReceipt.count({
          where: { expenseId },
        });

        if (receiptCount >= MAX_RECEIPTS) {
          return {
            error: "Este gasto ya tiene el máximo de cinco recibos.",
            status: 409,
          } as const;
        }

        const receipt = await tx.expenseReceipt.create({
          data: {
            expenseId,
            uploadedById: staff.userId,
            originalName: file.name,
            mimeType: detected.mimeType,
            sizeBytes: file.size,
            idempotencyKey,
            contentSha256,
            blobPathname: blob.pathname,
          },
          select: {
            id: true,
            originalName: true,
            mimeType: true,
            sizeBytes: true,
            createdAt: true,
          },
        });

        return { receipt } as const;
      });

      if ("existing" in result && result.existing) {
        await del(blob.pathname, { token }).catch((error) => {
          console.error("Failed to clean duplicate Blob:", error);
        });

        return retryResponse(
          result.existing,
          expenseId,
          staff.userId,
          file,
          detected.mimeType,
          contentSha256,
        );
      }

      if ("error" in result && result.error) {
        await del(blob.pathname, { token }).catch((error) => {
          console.error("Failed to clean rejected Blob:", error);
        });

        return Response.json(
          { error: result.error },
          { status: result.status, headers: noStoreHeaders },
        );
      }

      if ("receipt" in result && result.receipt) {
        return Response.json(
          { success: true, receipt: result.receipt },
          { status: 201, headers: noStoreHeaders },
        );
      }

      throw new Error("Unexpected receipt transaction result");
    } catch (error) {
      await del(blob.pathname, { token }).catch((cleanupError) => {
        console.error("Failed to clean orphaned Blob:", cleanupError);
      });

      throw error;
    }
  } catch (error) {
    console.error("Failed to upload expense receipt:", error);

    return Response.json(
      { error: "No se pudo adjuntar el recibo." },
      { status: 500, headers: noStoreHeaders },
    );
  }
}
