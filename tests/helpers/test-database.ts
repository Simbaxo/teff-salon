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

    // Only the designated Neon development endpoint is permitted.
    if (
        endpoint !==
        "ep-misty-bird-ax2o1u0v.c-4.us-east-2.aws.neon.tech"
    ) {
        throw new Error("Unsafe integration test database.");
    }

    return connectionString;
}