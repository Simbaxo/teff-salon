import { auth } from "@/auth";
import { canManageStaff } from "@/lib/auth-roles";
import { prisma } from "@/lib/prisma";
import {
  getCachedSpanishTranslation,
  getReviewCommentHash,
} from "@/lib/google-reviews/translation-cache";
import {
  acquireReviewTranslationLease,
  releaseReviewTranslationLease,
} from "@/lib/google-reviews/translation-lease";
import {
  reserveTranslationQuota,
  MAX_TRANSLATION_REQUEST_BYTES,
} from "@/lib/google-reviews/translation-quota";
import { translateEnglishReview } from "@/lib/google-reviews/translate-review";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ id: string }>;
};

const headers = {
  "Cache-Control": "no-store",
};

export async function POST(request: Request, context: RouteContext) {
  const session = await auth();

  if (!session?.user) {
    return Response.json(
      { error: "Debes iniciar sesión." },
      { status: 401, headers },
    );
  }

  if (!canManageStaff(session.user.role)) {
    return Response.json(
      { error: "Acceso denegado." },
      { status: 403, headers },
    );
  }

  const origin = request.headers.get("origin");

  const expectedOrigin =
    process.env.VERCEL_ENV === "production"
      ? "https://teffbeauty.com"
      : process.env.AUTH_URL
        ? new URL(process.env.AUTH_URL).origin
        : new URL(request.url).origin;

  if (!origin || origin !== expectedOrigin) {
    return Response.json(
      { error: "Origen no permitido." },
      { status: 403, headers },
    );
  }

  const { id } = await context.params;
  const reviewId = Number(id);

  if (!/^[1-9]\d*$/.test(id) || !Number.isSafeInteger(reviewId)) {
    return Response.json(
      { error: "Identificador inválido." },
      { status: 400, headers },
    );
  }

  try {
    const review = await prisma.googleReview.findUnique({
      where: { id: reviewId },
      select: {
        id: true,
        isActive: true,
        comment: true,
        commentEs: true,
        translationSourceHash: true,
      },
    });

    if (!review || !review.isActive) {
      return Response.json(
        { error: "Reseña no encontrada." },
        { status: 404, headers },
      );
    }

    if (!review.comment?.trim()) {
      return Response.json(
        { error: "La reseña no tiene comentario." },
        { status: 422, headers },
      );
    }

    const cached = getCachedSpanishTranslation(review);

    if (cached) {
      return Response.json(
        { status: "cached", translation: cached },
        { headers },
      );
    }

    const token = await acquireReviewTranslationLease(reviewId);

    if (!token) {
      return Response.json(
        {
          status: "in_progress",
          message: "Esta reseña ya se está traduciendo.",
        },
        { status: 409, headers },
      );
    }

    try {
      // Re-read after acquiring the lease to avoid
      // translating an outdated review.
      const current = await prisma.googleReview.findUnique({
        where: { id: reviewId },
        select: {
          isActive: true,
          comment: true,
          commentEs: true,
          translationSourceHash: true,
        },
      });

      if (!current?.isActive || !current.comment?.trim()) {
        return Response.json(
          { error: "La reseña ya no está disponible." },
          { status: 409, headers },
        );
      }

      const existing = getCachedSpanishTranslation(current);

      if (existing) {
        return Response.json(
          { status: "cached", translation: existing },
          { headers },
        );
      }

      const originalComment = current.comment;
      const text = originalComment.trim();

      if (Buffer.byteLength(text, "utf8") > MAX_TRANSLATION_REQUEST_BYTES) {
        return Response.json(
          {
            status: "too_long",
            message: "El comentario supera el límite de traducción gratuita.",
          },
          { status: 422, headers },
        );
      }

      const quotaReserved = await reserveTranslationQuota(text);

      if (!quotaReserved) {
        return Response.json(
          {
            status: "quota_exhausted",
            message: "Se alcanzó el límite gratuito de traducciones por hoy.",
          },
          { status: 429, headers },
        );
      }

      const translation = await translateEnglishReview(text);

      if (!translation) {
        return Response.json(
          {
            status: "unavailable",
            message: "La traducción no está disponible en este momento.",
          },
          { status: 503, headers },
        );
      }

      // Save only when this request still owns
      // the lease and Google's comment is unchanged.
      const saved = await prisma.googleReview.updateMany({
        where: {
          id: reviewId,
          isActive: true,
          comment: originalComment,
          translationLeaseToken: token,
          translationLeaseUntil: {
            gt: new Date(),
          },
        },
        data: {
          commentEs: translation,
          translationSourceHash: getReviewCommentHash(originalComment),
          translatedAt: new Date(),
        },
      });

      if (saved.count !== 1) {
        return Response.json(
          {
            status: "stale",
            message:
              "La reseña cambió durante la traducción. Inténtalo nuevamente.",
          },
          { status: 409, headers },
        );
      }

      return Response.json(
        {
          status: "translated",
          translation,
        },
        { headers },
      );
    } finally {
      await releaseReviewTranslationLease(reviewId, token);
    }
  } catch (error) {
    console.error(
      "Google review translation failed:",
      error instanceof Error ? error.name : "Unknown error",
    );

    return Response.json(
      { error: "No se pudo traducir la reseña." },
      { status: 500, headers },
    );
  }
}
