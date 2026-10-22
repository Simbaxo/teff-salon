
import assert from "node:assert/strict";
import { test } from "node:test";

import { validateCheckoutAssignments } from
    "../src/lib/checkout/validate-assignments";

import type {
    CheckoutServiceAssignment,
    CheckoutAddonAssignment,
} from "../src/lib/checkout/types";

// Reference data that the checkout API will eventually load from Prisma.
const context = {
    appointmentIds: [101, 102],
    bookedServices: [
        {
            appointmentId: 101,
            serviceId: 10,
            employeeId: 1,
        },
    ],
    activeEmployeeIds: [1, 2],
    employeeServices: [
        { employeeId: 1, serviceId: 10 },
        { employeeId: 2, serviceId: 20 },
    ],
    serviceAddons: [
        { serviceId: 10, addonId: 5 },
    ],
};

const validServices: CheckoutServiceAssignment[] = [
    {
        serviceId: 10,
        appointmentId: 101,
        employeeId: 1,
        price: 60000,
    },
    {
        serviceId: 20,
        appointmentId: null,
        employeeId: 2,
        price: 60000,
    },
];

const validAddons: CheckoutAddonAssignment[] = [
    {
        addonId: 5,
        serviceIndex: 0,
        price: 15000,
    },
];

test("accepts valid technician assignments", () => {
    assert.doesNotThrow(() =>
        validateCheckoutAssignments(
            validServices,
            validAddons,
            context
        )
    );
});

test("rejects an unknown technician", () => {
    const services = [
        { ...validServices[0], employeeId: 999 },
    ];

    assert.throws(
        () => validateCheckoutAssignments(services, [], context),
        /Inactive or unknown technician/
    );
});

test("rejects an unqualified technician", () => {
    const services = [
        { ...validServices[0], employeeId: 2 },
    ];

    assert.throws(
        () => validateCheckoutAssignments(services, [], context),
        /Technician is not qualified/
    );
});

test("rejects an appointment outside the visit", () => {
    const services = [
        { ...validServices[0], appointmentId: 999 },
    ];

    assert.throws(
        () => validateCheckoutAssignments(services, [], context),
        /does not belong to this visit/
    );
});

test("rejects an invalid add-on service index", () => {
    const addons = [
        { addonId: 5, serviceIndex: 99, price: 15000 },
    ];

    assert.throws(
        () =>
            validateCheckoutAssignments(
                validServices,
                addons,
                context
            ),
        /Invalid checkout add-on assignment/
    );
});

test("rejects an incompatible add-on", () => {
    const addons = [
        { addonId: 5, serviceIndex: 1, price: 15000 },
    ];

    assert.throws(
        () =>
            validateCheckoutAssignments(
                validServices,
                addons,
                context
            ),
        /Add-on is not allowed/
    );
});

test("rejects negative service prices", () => {
    const services = [
        { ...validServices[0], price: -1000 },
    ];

    assert.throws(
        () => validateCheckoutAssignments(services, [], context),
        /Invalid checkout service assignment/
    );
});


test("accepts a service booked on its original appointment", () => {
    assert.doesNotThrow(() =>
        validateCheckoutAssignments(
            [validServices[0]],
            [],
            context
        )
    );
});

test("rejects a service not booked on the specified appointment", () => {
    const services = [
        {
            serviceId: 20,
            appointmentId: 101,
            employeeId: 2,
            price: 60000,
        },
    ];

    assert.throws(
        () =>
            validateCheckoutAssignments(services, [], context),
        /Service was not booked on the specified appointment/
    );
});

test("temporarily rejects repeats of an already booked service", () => {
    const services = [
        validServices[0],
        {
            ...validServices[0],
            appointmentId: null,
        },
    ];

    assert.throws(
        () => validateCheckoutAssignments(services, [], context),
        /Existing booked service must reference its appointment/
    );
});


test("rejects duplicate services on the same appointment", () => {
    const services = [
        validServices[0],
        { ...validServices[0] },
    ];

    assert.throws(
        () => validateCheckoutAssignments(services, [], context),
        /Duplicate checkout service assignment/
    );
});

test("rejects duplicate newly added services", () => {
    const services = [
        validServices[1],
        { ...validServices[1] },
    ];

    assert.throws(
        () => validateCheckoutAssignments(services, [], context),
        /Duplicate checkout service assignment/
    );
});

test("allows the same service on different appointments", () => {
    const services = [
        validServices[0],
        {
            ...validServices[0],
            appointmentId: 102,
        },
    ];

    const multiAppointmentContext = {
        ...context,
        bookedServices: [
            ...context.bookedServices,
            {
                appointmentId: 102,
                serviceId: 10,
                employeeId: 1,
            },
        ],
    };

    assert.doesNotThrow(() =>
        validateCheckoutAssignments(
            services,
            [],
            multiAppointmentContext
        )
    );
});