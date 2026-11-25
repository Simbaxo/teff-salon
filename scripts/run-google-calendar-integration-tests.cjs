const { spawnSync } = require("node:child_process");
const path = require("node:path");
const dotenv = require("dotenv");

dotenv.config({
  path: path.resolve(process.cwd(), ".env"),
  quiet: true,
});

const productionUrl = process.env.DATABASE_URL;
const testUrl = process.env.TEST_DATABASE_URL;

const productionEndpoint = "ep-misty-bird-ax2o1u0v.c-4.us-east-2.aws.neon.tech";

const developmentEndpoint =
  "ep-ancient-cherry-ax0y0y4q.c-4.us-east-2.aws.neon.tech";

function endpoint(value) {
  return new URL(value).hostname.replace(/-pooler(?=\.)/, "");
}

try {
  if (!productionUrl || !testUrl) {
    throw new Error("Missing database configuration.");
  }

  if (
    endpoint(productionUrl) !== productionEndpoint ||
    endpoint(testUrl) !== developmentEndpoint ||
    endpoint(productionUrl) === endpoint(testUrl)
  ) {
    throw new Error("Unsafe database configuration.");
  }
} catch (error) {
  console.error("STOP:", error.message);
  process.exit(1);
}

console.log("TEFF Google Calendar Integration Tests");
console.log("Database: Approved Neon Development");
console.log("Production database: NOT USED");
console.log("Google Calendar API: NOT USED");
console.log("External service credentials: NOT INHERITED");

const result = spawnSync(
  process.execPath,
  [
    "--import",
    "tsx",
    "--test",
    "--test-concurrency=1",
    "tests/integration/google-calendar-concurrency.test.ts",
    "tests/integration/google-calendar-worker.test.ts",
  ],
  {
    stdio: "inherit",
    env: {
      PATH: process.env.PATH,
      HOME: process.env.HOME,
      NODE_ENV: "test",
      DATABASE_URL: testUrl,

      TEFF_GOOGLE_CALENDAR_QUEUE_ENABLED: "false",
      TEFF_GOOGLE_CALENDAR_SYNC_ENABLED: "false",
      TEFF_WHATSAPP_QUEUE_ENABLED: "false",
      TEFF_GOOGLE_REVIEWS_SYNC_ENABLED: "false",
    },
  },
);

process.exit(result.status ?? 1);
