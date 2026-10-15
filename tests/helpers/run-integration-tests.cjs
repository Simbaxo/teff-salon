const { spawnSync } = require("node:child_process");
const path = require("node:path");
const dotenv = require("dotenv");

dotenv.config({ path: path.resolve(process.cwd(), ".env"), quiet: true });

const productionUrl = process.env.DATABASE_URL;
const testUrl = process.env.TEST_DATABASE_URL;

if (!productionUrl || !testUrl) {
    console.error("STOP: Missing database configuration.");
    process.exit(1);
}

const endpoint = (value) =>
    new URL(value).hostname.replace(/-pooler(?=\.)/, "");

const expectedEndpoint =
    "ep-misty-bird-ax2o1u0v.c-4.us-east-2.aws.neon.tech";

// Never allow integration tests to target production.
if (
    endpoint(productionUrl) === endpoint(testUrl) ||
    endpoint(testUrl) !== expectedEndpoint
) {
    console.error("STOP: Unsafe integration test database.");
    process.exit(1);
}

console.log("Using isolated TEFF development database.");

const result = spawnSync(
    process.execPath,
    [
        "--import",
        "tsx",
        "--test",
        "tests/integration/*.test.ts",
    ],
    {
        stdio: "inherit",
        // Pass only the configuration required by database integration tests.
        env: {
            PATH: process.env.PATH,
            HOME: process.env.HOME,
            DATABASE_URL: testUrl,
            NODE_ENV: "test",
        },
    }
);

process.exit(result.status ?? 1);