"use client";

import { useState } from "react";

type ReviewTranslationProps = {
  reviewId: number;
  comment: string | null;
  initialTranslation: string | null;
};

type TranslationResponse = {
  status?: string;
  translation?: string;
  message?: string;
  error?: string;
};

export default function ReviewTranslation({
  reviewId,
  comment,
  initialTranslation,
}: ReviewTranslationProps) {
  const [translation, setTranslation] = useState(initialTranslation);
  const [showOriginal, setShowOriginal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function handleTranslate() {
    if (!comment || loading) return;

    setLoading(true);
    setMessage(null);

    try {
      const response = await fetch(
        `/api/staff/google-reviews/${reviewId}/translate`,
        {
          method: "POST",
          cache: "no-store",
        },
      );

      const data = (await response.json()) as TranslationResponse;

      if (!response.ok || !data.translation) {
        setMessage(
          data.message ?? data.error ?? "No se pudo traducir la reseña.",
        );
        return;
      }

      setTranslation(data.translation);
      setShowOriginal(false);
    } catch {
      setMessage("La traducción no está disponible en este momento.");
    } finally {
      setLoading(false);
    }
  }

  if (!comment?.trim()) {
    return (
      <p className="mt-2 text-sm text-neutral-500">Reseña sin comentario.</p>
    );
  }

  const showingTranslation = Boolean(translation && !showOriginal);

  return (
    <div className="mt-3 space-y-2">
      {showingTranslation && (
        <p className="text-xs font-semibold text-[#1F5A43]">
          Traducción al español
        </p>
      )}

      <p className="whitespace-pre-wrap text-sm leading-relaxed text-neutral-700">
        {showingTranslation ? translation : comment}
      </p>

      {translation ? (
        <button
          type="button"
          onClick={() => setShowOriginal((value) => !value)}
          className="min-h-10 rounded-lg px-2 py-2 text-sm font-semibold text-[#174632] hover:bg-green-50"
        >
          {showOriginal ? "Ver traducción" : "Ver original"}
        </button>
      ) : (
        <button
          type="button"
          onClick={handleTranslate}
          disabled={loading}
          className="min-h-10 rounded-lg border border-[#1F5A43] px-3 py-2 text-sm font-semibold text-[#174632] hover:bg-green-50 disabled:cursor-wait disabled:opacity-60"
        >
          {loading ? "Traduciendo..." : "Traducir al español"}
        </button>
      )}

      {message && (
        <p role="status" className="text-xs text-amber-700">
          {message}
        </p>
      )}
    </div>
  );
}
