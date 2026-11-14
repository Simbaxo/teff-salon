import { randomUUID } from "node:crypto";
import { del, put } from "@vercel/blob";
import { auth } from "@/auth";
import { canManageStaff } from "@/lib/auth-roles";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const MAX_IMAGE_BYTES = 3 * 1024 * 1024;
const MAX_NOTE_LENGTH = 200;
const PHOTO_SLOTS = [1, 2, 3, 4];

const IMAGE_EXTENSIONS = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
]);

type RouteContext = {
  params: Promise<{ id: string; serviceId: string }>;
};

export async function POST(request: Request, { params }: RouteContext) {
  const session = await auth();

  if (!session?.user) {
    return Response.json({ error: "Inicia sesión." }, { status: 401 });
  }

  if (!canManageStaff(session.user.role)) {
    return Response.json({ error: "Acceso denegado." }, { status: 403 });
  }

  const { id, serviceId: rawServiceId } = await params;
  const appointmentId = Number(id);
  const serviceId = Number(rawServiceId);

  if (
    !Number.isSafeInteger(appointmentId) ||
    appointmentId <= 0 ||
    !Number.isSafeInteger(serviceId) ||
    serviceId <= 0
  ) {
    return Response.json({ error: "Servicio inválido." }, { status: 400 });
  }

  const token = process.env.CUSTOMER_PHOTOS_BLOB_READ_WRITE_TOKEN;
  if (!token) {
    return Response.json(
      { error: "El almacenamiento de fotos no está configurado." },
      { status: 503 },
    );
  }

  const formData = await request.formData().catch(() => null);
  const image = formData?.get("image");
  const rawNote = formData?.get("note");

  if (!(image instanceof File) || image.size === 0) {
    return Response.json({ error: "Selecciona una foto." }, { status: 400 });
  }

  if (image.size > MAX_IMAGE_BYTES) {
    return Response.json(
      { error: "La foto debe pesar 3 MB o menos." },
      { status: 413 },
    );
  }

  const extension = IMAGE_EXTENSIONS.get(image.type);
  if (!extension) {
    return Response.json(
      { error: "Usa una foto JPEG, PNG o WebP." },
      { status: 415 },
    );
  }

  const note = typeof rawNote === "string" ? rawNote.trim() : "";
  if (note.length > MAX_NOTE_LENGTH) {
    return Response.json(
      { error: "La nota puede tener hasta 200 caracteres." },
      { status: 400 },
    );
  }

  let uploadedBlob: { url: string; pathname: string } | undefined;
  let stage = "service lookup";

  try {
    const service = await prisma.appointmentService.findUnique({
      where: { appointmentId_serviceId: { appointmentId, serviceId } },
      select: {
        appointment: { select: { status: true } },
        photos: { select: { slot: true } },
      },
    });

    if (!service) {
      return Response.json(
        { error: "Servicio no encontrado." },
        { status: 404 },
      );
    }

    if (service.appointment.status !== "COMPLETED") {
      return Response.json(
        { error: "Solo puedes agregar fotos a servicios completados." },
        { status: 409 },
      );
    }

    const occupiedSlots = new Set(service.photos.map(({ slot }) => slot));
    const availableSlots = PHOTO_SLOTS.filter(
      (slot) => !occupiedSlots.has(slot),
    );

    if (availableSlots.length === 0) {
      return Response.json(
        { error: "Este servicio ya tiene cuatro fotos." },
        { status: 409 },
      );
    }

    stage = "Blob upload";
    const blob = await put(
      `customer-photos/${appointmentId}/${serviceId}/${randomUUID()}.${extension}`,
      image,
      { access: "private", contentType: image.type, token },
    );
    uploadedBlob = blob;
    stage = "database write";

    for (const slot of availableSlots) {
      const { count } = await prisma.appointmentServicePhoto.createMany({
        data: {
          appointmentId,
          serviceId,
          slot,
          blobPath: blob.pathname,
          note: note || null,
        },
        skipDuplicates: true,
      });

      if (count === 1) {
        uploadedBlob = undefined;
        return Response.json({ success: true }, { status: 201 });
      }
    }

    return Response.json(
      {
        error:
          "No quedan espacios disponibles. Actualiza el perfil e inténtalo de nuevo.",
      },
      { status: 409 },
    );
  } catch (error) {
    const details =
      error instanceof Error
        ? {
            name: error.name,
            code: "code" in error ? error.code : undefined,
          }
        : { name: "UnknownError" };

    console.error("Customer photo upload failed", {
      stage,
      ...details,
      message:
        error instanceof Error
          ? error.message
              .split(token)
              .join("[redacted]")
              .replace(/https?:\/\/\S+/gi, "[redacted URL]")
              .split("\n")[0]
          : undefined,
    });

    return Response.json(
      { error: "No se pudo guardar la foto." },
      { status: 500 },
    );
  } finally {
    if (uploadedBlob) {
      try {
        const savedPhoto = await prisma.appointmentServicePhoto.findUnique({
          where: { blobPath: uploadedBlob.pathname },
          select: { id: true },
        });

        if (!savedPhoto) {
          await del(uploadedBlob.url, { token });
        }
      } catch {
        console.error("Could not verify or clean up a customer photo upload.");
      }
    }
  }
}
