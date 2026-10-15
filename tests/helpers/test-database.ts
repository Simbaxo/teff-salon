// Validate the isolated database used by payroll integration tests.
export function getSafeTestDatabaseUrl(): string {
    if (process.env.NODE_ENV !== "test") {
        throw new Error("Integration tests require NODE_ENV=test.");
    }

    const connectionString = process.env.DATABASE_URL;

    if (!connectionString) {
        throw new Error("Test database is not configured.");
    }

    const endpoint = new URL(connectionString).hostname
        .replace(/-pooler(?=\.)/, "");

    // Financial tests must never connect to the Neon production branch.
    const productionEndpoint =
        "ep-misty-bird-ax2o1u0v.c-4.us-east-2.aws.neon.tech";

    const developmentEndpoint =
        "ep-ancient-cherry-ax0y0y4q.c-4.us-east-2.aws.neon.tech";

    if (
        endpoint === productionEndpoint ||
        endpoint !== developmentEndpoint
    ) {
        throw new Error("Unsafe integration test database.");
    }

    return connectionString;
}