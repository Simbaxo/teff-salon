import assert from "node:assert/strict";
import { test } from "node:test";
import { GET } from "../src/app/api/cron/google-calendar/route";

const TEST_SECRET = "teff-mock-cron-secret";

function createRequest(authorization?: string): Request {
  return new Request("http://localhost/api/cron/google-calendar", {
    method: "GET",
    headers: authorization ? { Authorization: authorization } : {},
  });
}

async function withEnvironment(
  secret: string | undefined,
  syncEnabled: string | undefined,
  callback: () => Promise<void>,
) {
  const previousSecret = process.env.CRON_SECRET;
  const previousSync = process.env.TEFF_GOOGLE_CALENDAR_SYNC_ENABLED;

  try {
    if (secret === undefined) {
      delete process.env.CRON_SECRET;
    } else {
      process.env.CRON_SECRET = secret;
    }

    if (syncEnabled === undefined) {
      delete process.env.TEFF_GOOGLE_CALENDAR_SYNC_ENABLED;
    } else {
      process.env.TEFF_GOOGLE_CALENDAR_SYNC_ENABLED = syncEnabled;
    }

    await callback();
  } finally {
    if (previousSecret === undefined) {
      delete process.env.CRON_SECRET;
    } else {
      process.env.CRON_SECRET = previousSecret;
    }

    if (previousSync === undefined) {
      delete process.env.TEFF_GOOGLE_CALENDAR_SYNC_ENABLED;
    } else {
      process.env.TEFF_GOOGLE_CALENDAR_SYNC_ENABLED = previousSync;
    }
  }
}

test("rejects requests without authorization", async () => {
  await withEnvironment(TEST_SECRET, "true", async () => {
    const response = await GET(createRequest());

    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), {
      error: "Unauthorized",
    });
  });
});

test("rejects an incorrect bearer token", async () => {
  await withEnvironment(TEST_SECRET, "true", async () => {
    const response = await GET(createRequest("Bearer incorrect-secret"));

    assert.equal(response.status, 401);
  });
});

test("rejects an incorrect token of equal length", async () => {
  await withEnvironment(TEST_SECRET, "true", async () => {
    const incorrectSecret = "x".repeat(TEST_SECRET.length);

    const response = await GET(createRequest(`Bearer ${incorrectSecret}`));

    assert.equal(response.status, 401);
  });
});

test("rejects requests when CRON_SECRET is missing", async () => {
  await withEnvironment(undefined, "true", async () => {
    const response = await GET(createRequest(`Bearer ${TEST_SECRET}`));

    assert.equal(response.status, 401);
  });
});

test("rejects malformed authorization headers", async () => {
  await withEnvironment(TEST_SECRET, "true", async () => {
    const response = await GET(createRequest(TEST_SECRET));

    assert.equal(response.status, 401);
  });
});

test("authorized request skips processing when sync is disabled", async () => {
  await withEnvironment(TEST_SECRET, "false", async () => {
    const response = await GET(createRequest(`Bearer ${TEST_SECRET}`));

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      result: "disabled",
    });
  });
});

test("synchronization is disabled when the flag is missing", async () => {
  await withEnvironment(TEST_SECRET, undefined, async () => {
    const response = await GET(createRequest(`Bearer ${TEST_SECRET}`));

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      result: "disabled",
    });
  });
});

test("unauthorized responses cannot be cached", async () => {
  await withEnvironment(TEST_SECRET, "true", async () => {
    const response = await GET(createRequest());

    assert.equal(response.headers.get("Cache-Control"), "no-store");
  });
});

test("disabled synchronization responses cannot be cached", async () => {
  await withEnvironment(TEST_SECRET, "false", async () => {
    const response = await GET(createRequest(`Bearer ${TEST_SECRET}`));

    assert.equal(response.headers.get("Cache-Control"), "no-store");
  });
});
