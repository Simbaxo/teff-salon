const { spawn } = require("node:child_process");
const path = require("node:path");
const dotenv = require("dotenv");

dotenv.config({
  path: path.resolve(process.cwd(), ".env"),
  quiet: true,
});

const production = process.env.DATABASE_URL;
const development = process.env.TEST_DATABASE_URL;

const endpoint = (value) =>
  new URL(value).hostname.replace(/-pooler(?=\.)/, "");

const expectedProduction =
  "ep-misty-bird-ax2o1u0v.c-4.us-east-2.aws.neon.tech";

const expectedTest =
  "ep-ancient-cherry-ax0y0y4q.c-4.us-east-2.aws.neon.tech";

if (!production || !development || !process.env.AUTH_SECRET) {
  throw new Error("STOP: Missing required environment configuration.");
}

if (
  endpoint(production) !== expectedProduction ||
  endpoint(development) !== expectedTest ||
  endpoint(production) === endpoint(development)
) {
  throw new Error("STOP: Unsafe database configuration.");
}

const port = 49647;

const env = {
  ...process.env,
  DATABASE_URL: development,
  TEST_DATABASE_URL: development,
  NODE_ENV: "development",
  TEFF_CASHBOX_TEST: "true",
  AUTH_URL: `http://127.0.0.1:${port}`,
  AUTH_TRUST_HOST: "true",
  PORT: String(port),
};

console.log("TEFF Cashbox Test Server");
console.log("Database: Neon Testing");
console.log(`URL: http://127.0.0.1:${port}`);
console.log("Build directory: .next-cashbox-test");
console.log("Production database: NOT USED");

const server = spawn(
  process.execPath,
  [
    "node_modules/next/dist/bin/next",
    "dev",
    "--hostname",
    "127.0.0.1",
    "--port",
    String(port),
  ],
  {
    stdio: "inherit",
    env,
  },
);

server.on("error", (error) => {
  console.error("Test server failed:", error);
  process.exitCode = 1;
});

server.on("exit", (code) => {
  process.exitCode = code ?? 1;
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => server.kill(signal));
}
