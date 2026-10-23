
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { getTeffToday, addTeffDays } from "@/lib/datetime";
import { lockPayrollWeek } from "@/lib/payroll/period-lock";
import {
    validatePayrollWeek,
    hasValidPayrollAttribution,
    workedInPayrollPeriod,
    saleSpansPayrollWeeks,
} from "@/lib/payroll/review-validation";
import {
    calculateWeeklyPayrollSummary,
} from "@/lib/payroll/weekly-summary";
import {
    calculatePayrollReconciliation,
} from "@/lib/payroll/reconciliation";
import {
    validatePayrollAssignments,
    validatePayrollAssignmentCompleteness,
    validateAssignmentUpdateCount,
} from "@/lib/payroll/assignment-validation";

// Preparation only. No payroll statuses or financial records are modified.
export async function POST(request: Request) {
    const session = await auth();

    if (!session?.user) {
        return Response.json(
            { error: "Unauthorized" },
            { status: 401 }
        );
    }

    if (session.user.role !== "OWNER") {
        return Response.json(
            { error: "Forbidden" },
            { status: 403 }
        );
    }

    let body: unknown;

    try {
        body = await request.json();
    } catch {
        return Response.json(
            { error: "JSON inválido." },
            { status: 400 }
        );
    }

    if (
        typeof body !== "object" ||
        body === null ||
        Array.isArray(body) ||
        !("week" in body)
    ) {
        return Response.json(
            { error: "Semana inválida." },
            { status: 400 }
        );
    }

    const serviceStart = validatePayrollWeek(body.week);

    if (!serviceStart) {
        return Response.json(
            { error: "La semana debe comenzar un lunes válido." },
            { status: 400 }
        );
    }

    const week = serviceStart.toISOString().slice(0, 10);
    const nextMonday = addTeffDays(week, 7);

    // Review is allowed only after the payroll week has ended.
    if (getTeffToday() < nextMonday) {
        return Response.json(
            {
                error:
                    "No se puede revisar una semana que todavía no ha terminado.",
            },
            { status: 409 }
        );
    }

    // Payroll approval requires an explicit Owner confirmation.
    // OWNER authorization is already checked at the start of this route.
    const writeEnabled =
        typeof body === "object" &&
        body !== null &&
        !Array.isArray(body) &&
        "write" in body &&
        body.write === true &&
        "confirmReview" in body &&
        body.confirmReview === true;

    try {
        const result = await prisma.$transaction(
            async (tx) => {
                // Coordinate with checkout, historical sales,
                // reassignment, and payroll adjustments.
                await lockPayrollWeek(tx, serviceStart);

                const period = await tx.payrollPeriod.findUnique({
                    where: {
                        startDate: serviceStart,
                    },
                    include: {
                        entries: {
                            include: {
                                adjustments: true,
                                historicalPayments: true,
                            },
                        },
                    },
                });

                // Never review an already approved, paid, or settled period.
                if (
                    period &&
                    (
                        period.status !== "DRAFT" ||
                        period.reconciliationStatus === "SETTLED"
                    )
                ) {
                    throw new Error("PAYROLL_LOCKED");
                }

                if (
                    period?.entries.some(
                        (entry) => entry.status !== "DRAFT"
                    )
                ) {
                    throw new Error("PAYROLL_LOCKED");
                }


                // Load commissions belonging to this service week.
                // Financial records are validated again under the lock.
                const serviceEnd = new Date(
                    `${nextMonday}T00:00:00.000Z`
                );

                const commissions = await tx.commission.findMany({
                    where: {
                        sale: {
                            saleAppointments: {
                                some: {
                                    appointment: {
                                        date: {
                                            gte: serviceStart,
                                            lt: serviceEnd,
                                        },
                                    },
                                },
                            },
                        },
                    },
                    select: {
                        id: true,
                        employeeId: true,
                        saleId: true,
                        commissionBase: true,
                        commissionAmount: true,
                        status: true,
                        payrollEntryId: true,
                        sale: {
                            select: {
                                saleAppointments: {
                                    select: {
                                        appointment: {
                                            select: {
                                                employeeId: true,
                                                date: true,
                                            },
                                        },
                                    },
                                },
                            },
                        },
                    },
                });

                // Every commission must match the technician
                // who performed a service during this payroll week.
                const unmatchedCommissions = commissions.filter(
                    (commission) =>
                        !hasValidPayrollAttribution(
                            commission,
                            serviceStart,
                            serviceEnd
                        )
                );

                const invalidCommissions = commissions.filter(
                    (commission) =>
                        commission.status !== "PENDING" &&
                        commission.status !== "PAID"
                );

                if (
                    unmatchedCommissions.length > 0 ||
                    invalidCommissions.length > 0
                ) {
                    throw new Error("INVALID_PAYROLL_COMMISSIONS");
                }

                // Load tips associated with services performed this week.
                const tips = await tx.tip.findMany({
                    where: {
                        sale: {
                            saleAppointments: {
                                some: {
                                    appointment: {
                                        date: {
                                            gte: serviceStart,
                                            lt: serviceEnd,
                                        },
                                    },
                                },
                            },
                        },
                    },
                    select: {
                        id: true,
                        employeeId: true,
                        saleId: true,
                        amount: true,
                        status: true,
                        paymentMethod: true,
                        payrollEntryId: true,
                        sale: {
                            select: {
                                saleAppointments: {
                                    select: {
                                        appointment: {
                                            select: {
                                                employeeId: true,
                                                date: true,
                                            },
                                        },
                                    },
                                },
                            },
                        },
                    },
                });

                // Every tip must match a technician's service date.
                const unmatchedTips = tips.filter(
                    (tip) =>
                        !hasValidPayrollAttribution(
                            tip,
                            serviceStart,
                            serviceEnd
                        )
                );

                // Only recognized payment statuses are accepted.
                const invalidTips = tips.filter(
                    (tip) =>
                        tip.status !== "PENDING" &&
                        tip.status !== "PAID"
                );

                if (
                    unmatchedTips.length > 0 ||
                    invalidTips.length > 0
                ) {
                    throw new Error("INVALID_PAYROLL_TIPS");
                }

                // A sale must not contribute to multiple payroll weeks.
                const crossWeekCommissions = commissions.filter(
                    (commission) =>
                        saleSpansPayrollWeeks(
                            commission,
                            serviceStart,
                            serviceEnd
                        )
                );

                const crossWeekTips = tips.filter(
                    (tip) =>
                        saleSpansPayrollWeeks(
                            tip,
                            serviceStart,
                            serviceEnd
                        )
                );

                if (
                    crossWeekCommissions.length > 0 ||
                    crossWeekTips.length > 0
                ) {
                    throw new Error("CROSS_WEEK_PAYROLL_SALE");
                }

                // Include active technicians and anyone with earnings
                // or an existing payroll statement for this week.
                const activeEmployees = await tx.employee.findMany({
                    where: { active: true },
                    select: {
                        id: true,
                        name: true,
                    },
                });

                const employeeIds = new Set<number>(
                    activeEmployees.map((employee) => employee.id)
                );

                for (const entry of period?.entries ?? []) {
                    employeeIds.add(entry.employeeId);
                }

                for (const commission of commissions) {
                    employeeIds.add(commission.employeeId);
                }

                for (const tip of tips) {
                    employeeIds.add(tip.employeeId);
                }

                // Load names for inactive technicians too.
                const employees = await tx.employee.findMany({
                    where: {
                        id: {
                            in: Array.from(employeeIds),
                        },
                    },
                    select: {
                        id: true,
                        name: true,
                        compensationType: true,
                        weeklySalary: true,
                        salaryStartDate: true,
                    },
                });

                const employeeNames = new Map(
                    employees.map((employee) => [
                        employee.id,
                        employee.name,
                    ])
                );

                const employeeById = new Map(
                    employees.map((employee) => [
                        employee.id,
                        employee,
                    ])
                );

                // Calculate all statements inside the locked transaction.
                const summaries = Array.from(employeeIds).map(
                    (employeeId) => {
                        const entry = period?.entries.find(
                            (item) => item.employeeId === employeeId
                        );

                        const employeeCommissions = commissions.filter(
                            (item) =>
                                item.employeeId === employeeId &&
                                workedInPayrollPeriod(
                                    employeeId,
                                    item.sale.saleAppointments,
                                    serviceStart,
                                    serviceEnd
                                )
                        );

                        const employeeTips = tips.filter(
                            (item) =>
                                item.employeeId === employeeId &&
                                workedInPayrollPeriod(
                                    employeeId,
                                    item.sale.saleAppointments,
                                    serviceStart,
                                    serviceEnd
                                )
                        );

                        const employee = employeeById.get(employeeId);

                        // Salary applies only to eligible fixed-salary employees.
                        const salaryTotal =
                            employee?.compensationType === "FIXED_WEEKLY" &&
                            employee.salaryStartDate !== null &&
                            serviceStart >= employee.salaryStartDate
                                ? employee.weeklySalary
                                : 0;

                        const summary = calculateWeeklyPayrollSummary({
                            employeeId,
                            payrollEntryId: entry?.id ?? null,
                            salaryTotal,
                            commissions: employeeCommissions,
                            tips: employeeTips,
                            adjustments: entry?.adjustments ?? [],
                        });

                        return {
                            employeeId,
                            employeeName:
                                employeeNames.get(employeeId) ?? "Técnica",
                            commissionIds: employeeCommissions.map(
                                (item) => item.id
                            ),
                            tipIds: employeeTips.map(
                                (item) => item.id
                            ),
                            ...summary,
                        };
                    }
                );

                // Prevent a financial record from appearing in multiple statements.
                const assignmentValidation =
                    validatePayrollAssignments(summaries);

                // Every retrieved financial record must appear in a statement.
                const assignmentCompleteness =
                    validatePayrollAssignmentCompleteness({
                        commissions,
                        tips,
                        summaries,
                    });

                // A statement requiring review cannot be finalized.
                const warnings = summaries
                    .filter((summary) => summary.requiresReview)
                    .map((summary) => ({
                        employeeId: summary.employeeId,
                        employeeName: summary.employeeName,
                        outstandingPay: summary.outstandingPay,
                        conflictingCommissions:
                            summary.conflictingCommissions,
                        conflictingTips: summary.conflictingTips,
                    }));

                
                // Do not allow payroll review when financial records
                // belong to another payroll entry or payouts are negative.
                const hasAssignmentConflicts = summaries.some(
                    (summary) =>
                        summary.conflictingCommissions > 0 ||
                        summary.conflictingTips > 0
                );

                const hasNegativePayouts = summaries.some(
                    (summary) => summary.outstandingPay < 0
                );

                // This stage remains read-only.
                const financialValidationPassed =
                    !hasAssignmentConflicts &&
                    !hasNegativePayouts &&
                    warnings.length === 0;

                // Historical payments must remain valid after recalculation.
                const historicalReconciliationWarnings = summaries
                    .map((summary) => {
                        const entry = period?.entries.find(
                            (item) => item.employeeId === summary.employeeId
                        );

                        const reconciliation = calculatePayrollReconciliation({
                            netPay: summary.netPay,
                            paidCommissions: summary.paidCommissions,
                            historicalPayments: entry?.historicalPayments ?? [],
                        });

                        return {
                            employeeId: summary.employeeId,
                            employeeName: summary.employeeName,
                            remainingBalance: reconciliation.remainingBalance,
                            hasOverpayment: reconciliation.hasOverpayment,
                        };
                    })
                    .filter((item) => item.hasOverpayment);

                
                // Approved payroll must match the saved draft.
                // Never approve a stale financial snapshot.
                const staleDrafts = summaries
                    .map((summary) => {
                        const entry = period?.entries.find(
                            (item) =>
                                item.employeeId === summary.employeeId
                        );

                        if (!entry) {
                            return {
                                employeeId: summary.employeeId,
                                reason: "MISSING_DRAFT",
                            };
                        }

                        const fields = [
                            "salaryTotal",
                            "productionTotal",
                            "commissionTotal",
                            "tipsTotal",
                            "bonusesTotal",
                            "totalEarned",
                            "loansTotal",
                            "uniformsTotal",
                            "otherDeductions",
                            "tipsAlreadyPaid",
                            "netPay",
                        ] as const;

                        const changed = fields.some(
                            (field) =>
                                entry[field] !== summary[field]
                        );

                        return changed
                            ? {
                                  employeeId: summary.employeeId,
                                  reason: "STALE_DRAFT",
                              }
                            : null;
                    })
                    .filter((item) => item !== null);

                
                // All financial checks must pass before payroll
                // can transition from DRAFT to REVIEWED.
                const canConfirmReview =
                    financialValidationPassed &&
                    historicalReconciliationWarnings.length === 0 &&
                    staleDrafts.length === 0 &&
                    assignmentValidation.valid &&
                    assignmentCompleteness.valid &&
                    unmatchedCommissions.length === 0 &&
                    unmatchedTips.length === 0;

                // Never approve payroll when financial validation fails.
                if (writeEnabled && !canConfirmReview) {
                    throw new Error("PAYROLL_VALIDATION_FAILED");
                }


                // Assign financial records only when explicitly enabled.
                // The entire operation runs inside the existing transaction.
                if (writeEnabled) {
                    if (!period) {
                        throw new Error("PAYROLL_PERIOD_NOT_FOUND");
                    }

                    for (const summary of summaries) {
                        const entry = period.entries.find(
                            (item) =>
                                item.employeeId === summary.employeeId
                        );

                        if (!entry || entry.status !== "DRAFT") {
                            throw new Error("PAYROLL_ENTRY_NOT_DRAFT");
                        }

                        // Assign only commissions that are not yet linked.
                        const commissionResult =
                            await tx.commission.updateMany({
                                where: {
                                    id: {
                                        in: summary.commissionIds,
                                    },
                                    employeeId: summary.employeeId,
                                    payrollEntryId: null,
                                },
                                data: {
                                    payrollEntryId: entry.id,
                                },
                            });

                        const unassignedCommissionCount =
                            commissions.filter(
                                (item) =>
                                    summary.commissionIds.includes(item.id) &&
                                    item.payrollEntryId === null
                            ).length;

                        if (
                            !validateAssignmentUpdateCount(
                                unassignedCommissionCount,
                                commissionResult.count
                            )
                        ) {
                            throw new Error("PAYROLL_ASSIGNMENT_CONFLICT");
                        }

                        // Assign only tips that are not yet linked.
                        const tipResult = await tx.tip.updateMany({
                            where: {
                                id: {
                                    in: summary.tipIds,
                                },
                                employeeId: summary.employeeId,
                                payrollEntryId: null,
                            },
                            data: {
                                payrollEntryId: entry.id,
                            },
                        });

                        const unassignedTipCount = tips.filter(
                            (item) =>
                                summary.tipIds.includes(item.id) &&
                                item.payrollEntryId === null
                        ).length;

                        if (
                            !validateAssignmentUpdateCount(
                                unassignedTipCount,
                                tipResult.count
                            )
                        ) {
                            throw new Error("PAYROLL_ASSIGNMENT_CONFLICT");
                        }
                    }

                    // Approve every technician statement atomically.
                    const reviewedAt = new Date();

                    for (const summary of summaries) {
                        const entry = period.entries.find(
                            (item) => item.employeeId === summary.employeeId
                        );

                        if (!entry) {
                            throw new Error("PAYROLL_ENTRY_NOT_DRAFT");
                        }

                        const updated = await tx.payrollEntry.updateMany({
                            where: {
                                id: entry.id,
                                status: "DRAFT",
                            },
                            data: {
                                status: "REVIEWED",
                                reviewedAt,
                            },
                        });

                        if (updated.count !== 1) {
                            throw new Error("PAYROLL_REVIEW_CONFLICT");
                        }
                    }

                    // Finalize the period only after every statement succeeds.
                    const updatedPeriod = await tx.payrollPeriod.updateMany({
                        where: {
                            id: period.id,
                            status: "DRAFT",
                        },
                        data: {
                            status: "REVIEWED",
                            reviewedAt,
                        },
                    });

                    if (updatedPeriod.count !== 1) {
                        throw new Error("PAYROLL_REVIEW_CONFLICT");
                    }
                }

                // Report whether this transaction approved payroll.
                const reviewCompleted = writeEnabled && canConfirmReview;

                // Later steps will validate and freeze all statements.
                return {
                    week,
                    endDate: addTeffDays(week, 6),
                    payday: nextMonday,
                    periodId: period?.id ?? null,
                    // Approval is no longer pending after a successful review.
                    readyForConfirmation:
                        canConfirmReview && !reviewCompleted,

                    reviewCompleted,

                    // True only when no database changes were made.
                    readOnly: !reviewCompleted,
                    commissionCount: commissions.length,
                    unmatchedCommissionCount: unmatchedCommissions.length,
                    tipCount: tips.length,
                    unmatchedTipCount: unmatchedTips.length,
                    technicianCount: summaries.length,
                    warnings,
                    summaries,
                    financialValidationPassed,
                    hasAssignmentConflicts,
                    hasNegativePayouts,
                    historicalReconciliationWarnings,
                    historicalReconciliationPassed:
                        historicalReconciliationWarnings.length === 0,
                    snapshotValidationPassed: staleDrafts.length === 0,
                    staleDrafts,
                    assignmentValidationPassed: assignmentValidation.valid,
                    duplicateCommissionIds:
                        assignmentValidation.duplicateCommissions,
                    duplicateTipIds:
                        assignmentValidation.duplicateTips,
                    assignmentCompletenessPassed:
                        assignmentCompleteness.valid,

                    missingCommissionIds:
                        assignmentCompleteness.missingCommissions,

                    missingTipIds:
                        assignmentCompleteness.missingTips,

                    unexpectedCommissionIds:
                        assignmentCompleteness.unexpectedCommissions,

                    unexpectedTipIds:
                        assignmentCompleteness.unexpectedTips,
                };
            },
            {
                isolationLevel:
                    Prisma.TransactionIsolationLevel.Serializable,
                maxWait: 5000,
                timeout: 10000,
            }
        );

        return Response.json(result);
    } catch (error) {
        // Concurrent database changes may require retrying the request.
        if (
            error instanceof Prisma.PrismaClientKnownRequestError &&
            error.code === "P2034"
        ) {
            return Response.json(
                {
                    error:
                        "La nómina fue modificada simultáneamente. Actualiza la página e inténtalo nuevamente.",
                    conflictType: "PAYROLL_CONCURRENT_UPDATE",
                },
                { status: 409 }
            );
        }

        if (
            error instanceof Error &&
            [
                "PAYROLL_ASSIGNMENT_CONFLICT",
                "PAYROLL_REVIEW_CONFLICT",
                "PAYROLL_ENTRY_NOT_DRAFT",
                "PAYROLL_PERIOD_NOT_FOUND",
                "PAYROLL_VALIDATION_FAILED",
            ].includes(error.message)
        ) {
            return Response.json(
                {
                    error:
                        "No se pudo revisar la nómina porque existen cambios o conflictos pendientes.",
                },
                { status: 409 }
            );
        }

        if (
            error instanceof Error &&
            error.message === "CROSS_WEEK_PAYROLL_SALE"
        ) {
            return Response.json(
                {
                    error:
                        "No se puede revisar esta nómina porque existen ventas con servicios en diferentes semanas.",
                    conflictType: "CROSS_WEEK_PAYROLL_SALE",
                },
                { status: 409 }
            );
        }

        if (
            error instanceof Error &&
            error.message === "INVALID_PAYROLL_COMMISSIONS"
        ) {
            return Response.json(
                {
                    error:
                        "Existen comisiones inválidas o sin atribución correcta a la fecha del servicio.",
                },
                { status: 409 }
            );
        }

        if (
            error instanceof Error &&
            error.message === "INVALID_PAYROLL_TIPS"
        ) {
            return Response.json(
                {
                    error:
                        "Existen propinas inválidas o sin atribución correcta a la fecha del servicio.",
                },
                { status: 409 }
            );
        }

        if (
            error instanceof Error &&
            error.message === "PAYROLL_LOCKED"
        ) {
            return Response.json(
                {
                    error:
                        "Esta nómina ya fue revisada o pagada.",
                },
                { status: 409 }
            );
        }

        if (
            error instanceof Prisma.PrismaClientKnownRequestError &&
            error.code === "P2034"
        ) {
            return Response.json(
                {
                    error:
                        "La nómina fue modificada al mismo tiempo. Inténtalo nuevamente.",
                },
                { status: 409 }
            );
        }

        console.error("Payroll confirmation preparation failed:", error);

        return Response.json(
            { error: "No se pudo preparar la revisión de nómina." },
            { status: 500 }
        );
    }
}
