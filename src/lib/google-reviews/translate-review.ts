// MyMemory limits each translation request to 500 UTF-8 bytes.
// Keep the client independent of database initialization.
const MAX_TRANSLATION_REQUEST_BYTES = 500;

type MyMemoryResponse = {
  responseStatus?: number;
  responseData?: {
    translatedText?: string;
  };
  quotaFinished?: boolean;
};

/**
 * Translate a short English review into Spanish.
 *
 * This function does not reserve quota itself.
 * Call it only after reserveTranslationQuota() succeeds.
 *
 * No account, API key, billing, or paid fallback.
 */
export async function translateEnglishReview(
  originalText: string,
): Promise<string | null> {
  const text = originalText.trim();

  if (
    !text ||
    Buffer.byteLength(text, "utf8") > MAX_TRANSLATION_REQUEST_BYTES
  ) {
    return null;
  }

  const url = new URL("https://api.mymemory.translated.net/get");

  url.searchParams.set("q", text);
  url.searchParams.set("langpair", "en|es");

  try {
    const response = await fetch(url.toString(), {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
      cache: "no-store",
      signal: AbortSignal.timeout(5_000),
    });

    if (!response.ok) {
      return null;
    }

    const data = (await response.json()) as MyMemoryResponse;

    if (data.responseStatus !== 200 || data.quotaFinished === true) {
      return null;
    }

    const translatedText = data.responseData?.translatedText?.trim();

    if (
      !translatedText ||
      translatedText.toUpperCase().includes("MYMEMORY WARNING")
    ) {
      return null;
    }

    return translatedText;
  } catch {
    // Translation is optional.
    // Never interrupt the Google Reviews dashboard.
    return null;
  }
}
