const DEVELOPMENT_ENDPOINT =
  "ep-ancient-cherry-ax0y0y4q.c-4.us-east-2.aws.neon.tech";

export function isLoanTestEnabled(): boolean {
  if (
    process.env.NODE_ENV !== "development" ||
    process.env.TEFF_CASHBOX_LOAN_TEST !== "true"
  ) {
    return false;
  }

  const databaseUrl = process.env.DATABASE_URL;
  const testDatabaseUrl = process.env.TEST_DATABASE_URL;

  if (!databaseUrl || !testDatabaseUrl) {
    return false;
  }

  try {
    const endpoint = (value: string) =>
      new URL(value).hostname.replace(/-pooler(?=\.)/, "");

    const active = endpoint(databaseUrl);
    const test = endpoint(testDatabaseUrl);

    return active === DEVELOPMENT_ENDPOINT && test === DEVELOPMENT_ENDPOINT;
  } catch {
    return false;
  }
}
