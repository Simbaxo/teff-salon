import assert from "node:assert/strict";
import { test } from "node:test";

import { getSafeTestDatabaseUrl } from "./helpers/test-database";

// Dummy credentials only — no real database connections.
const productionUrl =
    "postgresql://user:password@ep-ancient-cherry-ax0y0y4q-pooler.c-4.us-east-2.aws.neon.tech/neondb";

const developmentUrl =
    "postgresql://user:password@ep-misty-bird-ax2o1u0v-pooler.c-4.us-east-2.aws.neon.tech/neondb";

// Run each check with a controlled environment and restore it afterward.
function checkConnection(
    databaseUrl: string,
    nodeEnv = "test"
) {
    const environment = process.env as Record<
        string,
        string | undefined
    >;

    const previousDatabase = environment.DATABASE_URL;
    const previousNodeEnv = environment.NODE_ENV;

    try {
        environment.DATABASE_URL = databaseUrl;
        environment.NODE_ENV = nodeEnv;

        return getSafeTestDatabaseUrl();
    } finally {
        // Restore the original environment after each test.
        if (previousDatabase === undefined) {
            delete environment.DATABASE_URL;
        } else {
            environment.DATABASE_URL = previousDatabase;
        }

        if (previousNodeEnv === undefined) {
            delete environment.NODE_ENV;
        } else {
            environment.NODE_ENV = previousNodeEnv;
        }
    }
}

test("rejects a test URL pointing to production", () => {
    assert.throws(
        () => checkConnection(productionUrl),
        /Unsafe integration test database/
    );
});

test("rejects an unauthorized database endpoint", () => {
    const unauthorizedUrl =
        "postgresql://user:password@ep-other-branch.c-4.us-east-2.aws.neon.tech/neondb";

    assert.throws(
        () => checkConnection(unauthorizedUrl),
        /Unsafe integration test database/
    );
});

test("accepts the designated development endpoint", () => {
    assert.equal(
        checkConnection(developmentUrl),
        developmentUrl
    );
});

test("rejects execution outside the test environment", () => {
    assert.throws(
        () => checkConnection(developmentUrl, "production"),
        /Integration tests require NODE_ENV=test/
    );
});