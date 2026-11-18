import { del, get } from "@vercel/blob";
import { auth } from "@/auth";
import { canManageStaff } from "@/lib/auth-roles";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const responseHeaders = {
  "Cache-Control": "private, no-store",
  "X-Content-Type-Options": "nosniff",
};

type RouteContext = {
  params: Promise<{ photoId: string }>;
};

export async function GET(_request: Request, { params }: RouteContext) {
  const session = await auth();

  if (!session?.user) {
    return new Response(null, { status: 401, headers: responseHeaders });
  }

  if (!canManageStaff(session.user.role)) {
    return new Response(null, { status: 403, headers: responseHeaders });
  }

  const { photoId: rawPhotoId } = await params;
  const photoId = Number(rawPhotoId);

  if (
    !Number.isSafeInteger(photoId) ||
    photoId <= 0 ||
    photoId > 2_147_483_647
  ) {
    return new Response(null, { status: 400, headers: responseHeaders });
  }

  const token = process.env.CUSTOMER_PHOTOS_BLOB_READ_WRITE_TOKEN;
  if (!token) {
    return new Response(null, { status: 503, headers: responseHeaders });
  }

  try {
    const photo = await prisma.appointmentServicePhoto.findUnique({
      where: { id: photoId },
      select: { blobPath: true },
    });

    if (!photo) {
      return new Response(null, { status: 404, headers: responseHeaders });
    }

    const result = await get(photo.blobPath, { access: "private", token });

    if (!result) {
      return new Response(null, { status: 404, headers: responseHeaders });
    }

    if (
      result.statusCode !== 200 ||
      !IMAGE_TYPES.has(result.blob.contentType)
    ) {
      return new Response(null, { status: 502, headers: responseHeaders });
    }

    return new Response(result.stream, {
      headers: {
        ...responseHeaders,
        "Content-Type": result.blob.contentType,
      },
    });
  } catch {
    console.error("Could not load a private customer photo.");
    return new Response(null, { status: 500, headers: responseHeaders });
  }
}

export async function DELETE(_request: Request, { params }: RouteContext) {
  const session = await auth();

  if (!session?.user) {
    return Response.json(
      { error: "Inicia sesión." },
      { status: 401, headers: responseHeaders },
    );
  }

  if (!canManageStaff(session.user.role)) {
    return Response.json(
      { error: "Acceso denegado." },
      { status: 403, headers: responseHeaders },
    );
  }

  const { photoId: rawPhotoId } = await params;
  const photoId = Number(rawPhotoId);

  if (
    !Number.isSafeInteger(photoId) ||
    photoId <= 0 ||
    photoId > 2_147_483_647
  ) {
    return Response.json(
      { error: "Foto inválida." },
      { status: 400, headers: responseHeaders },
    );
  }

  const token = process.env.CUSTOMER_PHOTOS_BLOB_READ_WRITE_TOKEN;
  if (!token) {
    return Response.json(
      { error: "El almacenamiento de fotos no está configurado." },
      { status: 503, headers: responseHeaders },
    );
  }

  try {
    const photo = await prisma.appointmentServicePhoto.findUnique({
      where: { id: photoId },
      select: { blobPath: true },
    });

    if (photo) {
      await del(photo.blobPath, { token });
      await prisma.appointmentServicePhoto.deleteMany({
        where: { id: photoId },
      });
    }

    return new Response(null, { status: 204, headers: responseHeaders });
  } catch {
    console.error("Could not remove a private customer photo.");
    return Response.json(
      { error: "No se pudo eliminar la foto. Inténtalo de nuevo." },
      { status: 500, headers: responseHeaders },
    );
  }
}
