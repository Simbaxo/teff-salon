
const { spawn } = require("node:child_process");
const path = require("node:path");
const dotenv = require("dotenv");

dotenv.config({
    path: path.resolve(process.cwd(), ".env"),
    quiet: true,
});

const production = process.env.DATABASE_URL;
const development = process.env.TEST_DATABASE_URL;

const { readFileSync } = require("node:fs");

const fixturePath =
    ".teff-test-fixtures/checkout-teff-checkout-2dba4444-653a-4291-90ea-af2d52cafdcd.json";

const fixture = JSON.parse(readFileSync(fixturePath, "utf8"));

if (
    !/^teff-checkout-[0-9a-f-]{36}$/.test(fixture.marker) ||
    !Number.isSafeInteger(fixture.ownerId) ||
    !Number.isSafeInteger(fixture.customerId) ||
    !Number.isSafeInteger(fixture.bookingId) ||
    !Array.isArray(fixture.appointmentIds) ||
    fixture.appointmentIds.length !== 2 ||
    new Set(fixture.appointmentIds).size !== 2 ||
    !fixture.appointmentIds.every(
        (id) => Number.isSafeInteger(id) && id > 0
    )
) {
    throw new Error("STOP: Invalid checkout test fixture");
}

if (!production || !development || !process.env.AUTH_SECRET) {
    console.error("STOP: Missing test-server configuration.");
    process.exit(1);
}

const endpoint = (value) =>
    new URL(value).hostname.replace(/-pooler(?=\.)/, "");

const productionEndpoint =
    "ep-misty-bird-ax2o1u0v.c-4.us-east-2.aws.neon.tech";

const developmentEndpoint =
    "ep-ancient-cherry-ax0y0y4q.c-4.us-east-2.aws.neon.tech";

if (
    endpoint(production) !== productionEndpoint ||
    endpoint(development) !== developmentEndpoint ||
    endpoint(production) === endpoint(development)
) {
    console.error("STOP: Unsafe test database configuration.");
    process.exit(1);
}

// Run Next.js with the approved Development database only.
const env = {
    ...process.env,
    DATABASE_URL: development,
    TEST_DATABASE_URL: development,
    // Authorize attributed checkout only for the isolated fixture.
    TEFF_ATTRIBUTED_CHECKOUT_TEST: "true",
    TEFF_CHECKOUT_TEST_OWNER_ID: String(fixture.ownerId),
    TEFF_CHECKOUT_TEST_MARKER: fixture.marker,
    TEFF_CHECKOUT_TEST_CUSTOMER_ID: String(fixture.customerId),
    TEFF_CHECKOUT_TEST_BOOKING_ID: String(fixture.bookingId),
    TEFF_CHECKOUT_TEST_APPOINTMENT_IDS:
        fixture.appointmentIds.join(","),
    // Next.js requires development mode for its dev server.
    // Database isolation is enforced by the endpoint checks above.
    NODE_ENV: "development",
    TEFF_PAYROLL_TEST: "true",
    AUTH_URL: "http://127.0.0.1:3101",
    AUTH_TRUST_HOST: "true",
    PORT: "3101",
};

console.log("TEFF Checkout Test Server");
console.log("Database: Neon Development");
console.log("Port: 3101");
console.log("Production database: NOT USED");

// Keep the server bound to localhost.
const server = spawn(
    process.execPath,
    [
        "node_modules/next/dist/bin/next",
        "dev",
        "--hostname",
        "127.0.0.1",
        "--port",
        "3101",
    ],
    {
        stdio: "inherit",
        env,
    }
);

server.on("error", (error) => {
    console.error("Test server failed:", error);
    process.exitCode = 1;
});

server.on("exit", (code) => {
    process.exitCode = code ?? 1;
});

// Forward shutdown signals to the child server.
for (const signal of ["SIGINT", "SIGTERM"]) {
    process.on(signal, () => server.kill(signal));
}