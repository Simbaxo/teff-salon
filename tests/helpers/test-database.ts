// Prevent integration tests from connecting to production.
export function getSafeTestDatabaseUrl(): string {
    const productionUrl = process.env.DATABASE_URL;
    const testUrl = process.env.TEST_DATABASE_URL;

    if (!productionUrl || !testUrl) {
        throw new Error("Missing database configuration.");
    }

    const production = new URL(productionUrl);
    const test = new URL(testUrl);

    // Treat pooled and direct connections as the same endpoint.
    const endpoint = (url: URL) =>
        url.hostname.replace(/-pooler(?=\.)/, "");

    if (
        endpoint(production) === endpoint(test) &&
        production.pathname === test.pathname
    ) {
        throw new Error(
            "TEST_DATABASE_URL points to the production database."
        );
    }

    // Only allow the designated Neon development endpoint.
    if (
        endpoint(test) !==
        "ep-misty-bird-ax2o1u0v.c-4.us-east-2.aws.neon.tech"
    ) {
        throw new Error(
            "Unexpected test database endpoint."
        );
    }

    return testUrl;
}