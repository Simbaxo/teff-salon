import assert from "node:assert/strict";
import { test } from "node:test";

import {
    getSafeTestDatabaseUrl,
} from "./helpers/test-database";

const productionUrl =
    "postgresql://user:password@ep-ancient-cherry-ax0y0y4q-pooler.c-4.us-east-2.aws.neon.tech/neondb";

const developmentUrl =
    "postgresql://user:password@ep-misty-bird-ax2o1u0v-pooler.c-4.us-east-2.aws.neon.tech/neondb";

function checkConnection(
    production: string,
    development: string
) {
    const previousProduction = process.env.DATABASE_URL;
    const previousTest = process.env.TEST_DATABASE_URL;

    try {
        process.env.DATABASE_URL = production;
        process.env.TEST_DATABASE_URL = development;

        return getSafeTestDatabaseUrl();
    } finally {
        // Restore environment variables after each test.
        if (previousProduction === undefined) {
            delete process.env.DATABASE_URL;
        } else {
            process.env.DATABASE_URL = previousProduction;
        }

        if (previousTest === undefined) {
            delete process.env.TEST_DATABASE_URL;
        } else {
            process.env.TEST_DATABASE_URL = previousTest;
        }
    }
}

test("rejects a test URL pointing to production", () => {
    assert.throws(
        () => checkConnection(productionUrl, productionUrl),
        /production database/
    );
});

test("rejects an unauthorized database endpoint", () => {
    const unauthorizedUrl =
        "postgresql://user:password@ep-other-branch.c-4.us-east-2.aws.neon.tech/neondb";

    assert.throws(
        () => checkConnection(productionUrl, unauthorizedUrl),
        /Unexpected test database endpoint/
    );
});

test("accepts the designated development endpoint", () => {
    assert.equal(
        checkConnection(productionUrl, developmentUrl),
        developmentUrl
    );
});