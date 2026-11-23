import assert from "node:assert/strict";
import { test } from "node:test";

import { translateEnglishReview } from "../src/lib/google-reviews/translate-review";

async function withMockFetch(mock: typeof fetch, run: () => Promise<void>) {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = mock;

  try {
    await run();
  } finally {
    globalThis.fetch = originalFetch;
  }
}

test("translates English to Spanish using the free endpoint", async () => {
  let requests = 0;

  await withMockFetch(
    async (input) => {
      requests++;

      const url = new URL(String(input));

      assert.equal(url.origin, "https://api.mymemory.translated.net");
      assert.equal(url.pathname, "/get");
      assert.equal(url.searchParams.get("langpair"), "en|es");
      assert.equal(url.searchParams.get("q"), "Excellent service!");

      assert.equal(url.searchParams.has("key"), false);

      return Response.json({
        responseStatus: 200,
        responseData: {
          translatedText: "¡Excelente servicio!",
        },
      });
    },
    async () => {
      const result = await translateEnglishReview("Excellent service!");

      assert.equal(result, "¡Excelente servicio!");
    },
  );

  assert.equal(requests, 1);
});

test("rejects comments exceeding 500 UTF-8 bytes", async () => {
  await withMockFetch(
    async () => {
      throw new Error("Fetch must not be called");
    },
    async () => {
      const result = await translateEnglishReview("a".repeat(501));

      assert.equal(result, null);
    },
  );
});

test("rejects empty comments", async () => {
  await withMockFetch(
    async () => {
      throw new Error("Fetch must not be called");
    },
    async () => {
      assert.equal(await translateEnglishReview("   "), null);
    },
  );
});

test("handles exhausted MyMemory quota", async () => {
  await withMockFetch(
    async () =>
      Response.json({
        responseStatus: 200,
        quotaFinished: true,
        responseData: {
          translatedText: "Translation unavailable",
        },
      }),
    async () => {
      assert.equal(await translateEnglishReview("Great nails"), null);
    },
  );
});

test("handles MyMemory HTTP errors", async () => {
  await withMockFetch(
    async () => new Response(null, { status: 429 }),
    async () => {
      assert.equal(await translateEnglishReview("Great service"), null);
    },
  );
});

test("handles network failures without throwing", async () => {
  await withMockFetch(
    async () => {
      throw new Error("Network unavailable");
    },
    async () => {
      assert.equal(await translateEnglishReview("Great service"), null);
    },
  );
});

test("rejects MyMemory warning messages", async () => {
  await withMockFetch(
    async () =>
      Response.json({
        responseStatus: 200,
        responseData: {
          translatedText: "MYMEMORY WARNING: LIMIT REACHED",
        },
      }),
    async () => {
      assert.equal(await translateEnglishReview("Great service"), null);
    },
  );
});
