import assert from "node:assert/strict";
import { test } from "node:test";

import {
  getReviewCommentHash,
  getCachedSpanishTranslation,
} from "../src/lib/google-reviews/translation-cache";

const originalComment = "Excellent service and beautiful nails!";

const spanishTranslation = "¡Excelente servicio y uñas hermosas!";

test("creates a consistent SHA-256 fingerprint", () => {
  const first = getReviewCommentHash(originalComment);
  const second = getReviewCommentHash(originalComment);

  assert.equal(first, second);
  assert.match(first, /^[a-f0-9]{64}$/);
});

test("returns a valid cached Spanish translation", () => {
  const result = getCachedSpanishTranslation({
    comment: originalComment,
    commentEs: spanishTranslation,
    translationSourceHash: getReviewCommentHash(originalComment),
  });

  assert.equal(result, spanishTranslation);
});

test("rejects an outdated translation after a review edit", () => {
  const result = getCachedSpanishTranslation({
    comment: "The service was okay.",
    commentEs: spanishTranslation,
    translationSourceHash: getReviewCommentHash(originalComment),
  });

  assert.equal(result, null);
});

test("rejects a translation without a fingerprint", () => {
  const result = getCachedSpanishTranslation({
    comment: originalComment,
    commentEs: spanishTranslation,
    translationSourceHash: null,
  });

  assert.equal(result, null);
});

test("handles reviews without comments", () => {
  const result = getCachedSpanishTranslation({
    comment: null,
    commentEs: null,
    translationSourceHash: null,
  });

  assert.equal(result, null);
});

test("rejects missing Spanish translations", () => {
  const result = getCachedSpanishTranslation({
    comment: originalComment,
    commentEs: null,
    translationSourceHash: getReviewCommentHash(originalComment),
  });

  assert.equal(result, null);
});

test("different comments produce different fingerprints", () => {
  assert.notEqual(
    getReviewCommentHash("Great service"),
    getReviewCommentHash("Bad service"),
  );
});
