
/**
 * Prevent technician reassignment after an appointment
 * has been included in a completed sale.
 *
 * Financial corrections require a separate audited workflow.
 */
export function assertReassignmentFinancialSafety(
    saleId: number | null
): void {
    if (saleId !== null) {
        throw new Error("SOLD_APPOINTMENT_REASSIGNMENT_BLOCKED");
    }
}


import type { Prisma } from "@/generated/prisma/client";

/**
 * Verify that an appointment has not been included in a sale.
 * Call this inside the active database transaction.
 */
export async function assertAppointmentNotSold(
    tx: Prisma.TransactionClient,
    appointmentId: number
): Promise<void> {
    const saleAppointment = await tx.saleAppointment.findUnique({
        where: {
            appointmentId,
        },
        select: {
            saleId: true,
        },
    });

    assertReassignmentFinancialSafety(
        saleAppointment?.saleId ?? null
    );
}