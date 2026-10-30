
const { spawn } = require("node:child_process");
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
    if (
        endpoint(productionUrl) !== productionEndpoint ||
        endpoint(testUrl) !== developmentEndpoint ||
        endpoint(productionUrl) === endpoint(testUrl)
    ) {
        throw new Error("Unsafe database configuration.");
    }
} catch {
    console.error("STOP: Unsafe booking test database configuration.");
    process.exit(1);
}

const port = "3102";

// Never inherit the normal development server's database configuration.
const env = {
    ...process.env,
    DATABASE_URL: testUrl,
    TEST_DATABASE_URL: testUrl,
    NODE_ENV: "development",

    // Separate Next.js build directory.
    TEFF_BOOKING_TEST: "true",
    TEFF_PAYROLL_TEST: "false",

    // Prevent notifications to real staff devices.
    TEFF_BOOKING_TEST_DISABLE_PUSH: "true",

    PORT: port,
};

console.log("TEFF Booking Test Server");
console.log("Database: Approved Neon Development");
console.log("Push notifications: Suppressed");
console.log(`Local address: http://127.0.0.1:${port}`);
console.log("Production database: NOT USED");

const server = spawn(
    process.execPath,
    [
        "node_modules/next/dist/bin/next",
        "dev",
        "--hostname",
        "127.0.0.1",
        "--port",
        port,
    ],
    {
        stdio: "inherit",
        env,
    }
);

server.on("error", (error) => {
    console.error("Booking test server failed:", error);
    process.exitCode = 1;
});

server.on("exit", (code) => {
    process.exitCode = code ?? 1;
});

for (const signal of ["SIGINT", "SIGTERM"]) {
    process.on(signal, () => server.kill(signal));
}