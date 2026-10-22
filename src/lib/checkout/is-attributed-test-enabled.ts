
const DEVELOPMENT_ENDPOINT =
    "ep-ancient-cherry-ax0y0y4q.c-4.us-east-2.aws.neon.tech";

// Enable attributed checkout only on the isolated local test server.
// Never allow this flag to enable the feature in Production.
export function isAttributedCheckoutTestEnabled(): boolean {
    if (
        process.env.TEFF_ATTRIBUTED_CHECKOUT_TEST !== "true" ||
        process.env.NODE_ENV !== "development" ||
        process.env.TEFF_PAYROLL_TEST !== "true"
    ) {
        return false;
    }

    const databaseUrl = process.env.DATABASE_URL;

    if (!databaseUrl) {
        return false;
    }

    try {
        const endpoint = new URL(databaseUrl).hostname.replace(
            /-pooler(?=\.)/,
            ""
        );

        return endpoint === DEVELOPMENT_ENDPOINT;
    } catch {
        return false;
    }
}
