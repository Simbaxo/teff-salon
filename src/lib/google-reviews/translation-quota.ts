import { prisma } from "@/lib/prisma";

export const DAILY_TRANSLATION_BYTE_LIMIT = 4_000;
export const MAX_TRANSLATION_REQUEST_BYTES = 500;

function getUtcDay(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Reserves daily translation usage before contacting MyMemory.
 *
 * PostgreSQL handles concurrent requests atomically, including
 * requests processed by different Vercel instances.
 *
 * Returns false when TEFF's free allowance is exhausted.
 */
export async function reserveTranslationQuota(text: string): Promise<boolean> {
  const bytes = Buffer.byteLength(text, "utf8");

  if (bytes === 0 || bytes > MAX_TRANSLATION_REQUEST_BYTES) {
    return false;
  }

  const day = getUtcDay();

  const rows = await prisma.$queryRaw<Array<{ day: string }>>`
    INSERT INTO "GoogleReviewTranslationQuota"
      ("day", "usedBytes", "updatedAt")
    VALUES
      (${day}, ${bytes}, CURRENT_TIMESTAMP)
    ON CONFLICT ("day")
    DO UPDATE SET
      "usedBytes" =
        "GoogleReviewTranslationQuota"."usedBytes"
        + EXCLUDED."usedBytes",
      "updatedAt" = CURRENT_TIMESTAMP
    WHERE
      "GoogleReviewTranslationQuota"."usedBytes"
      + EXCLUDED."usedBytes"
      <= ${DAILY_TRANSLATION_BYTE_LIMIT}
    RETURNING "day"
  `;

  return rows.length === 1;
}
