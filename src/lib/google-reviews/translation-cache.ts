import { createHash } from "node:crypto";

export function getReviewCommentHash(comment: string): string {
  return createHash("sha256").update(comment, "utf8").digest("hex");
}

export function getCachedSpanishTranslation(review: {
  comment: string | null;
  commentEs: string | null;
  translationSourceHash: string | null;
}): string | null {
  if (!review.comment || !review.commentEs || !review.translationSourceHash) {
    return null;
  }

  const currentHash = getReviewCommentHash(review.comment);

  if (review.translationSourceHash !== currentHash) {
    return null;
  }

  return review.commentEs;
}
