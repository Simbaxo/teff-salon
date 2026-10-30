
const { spawnSync } = require("node:child_process");
const path = require("node:path");
const dotenv = require("dotenv");

dotenv.config({
    path: path.resolve(process.cwd(), ".env"),
    quiet: true,
});

const productionUrl = process.env.DATABASE_URL;
const testUrl = process.env.TEST_DATABASE_URL;

const productionEndpoint =
    "ep-misty-bird-ax2o1u0v.c-4.us-east-2.aws.neon.tech";

const developmentEndpoint =
    "ep-ancient-cherry-ax0y0y4q.c-4.us-east-2.aws.neon.tech";

function endpoint(url) {
    return new URL(url).hostname.replace(/-pooler(?=\.)/, "");
}

if (!productionUrl || !testUrl) {
    console.error("STOP: Missing database configuration.");
    process.exit(1);
}

try {
    const production = endpoint(productionUrl);
    const development = endpoint(testUrl);

    if (
        production !== productionEndpoint ||
        development !== developmentEndpoint ||
        production === development
    ) {
        throw new Error("Unsafe database configuration.");
    }
} catch {
    console.error("STOP: Unsafe database configuration.");
    process.exit(1);
}

console.log("TEFF Booking Availability Integration Test");
console.log("Database: Approved Neon Development");
console.log("Production database: NOT USED");

const result = spawnSync(
    process.execPath,
    [
        "--import",
        "tsx",
        "--test",
        "tests/integration/booking-availability.test.ts",
    ],
    {
        stdio: "inherit",
        env: {
            PATH: process.env.PATH,
            HOME: process.env.HOME,
            DATABASE_URL: testUrl,
            NODE_ENV: "test",
        },
    }
);

process.exit(result.status ?? 1);