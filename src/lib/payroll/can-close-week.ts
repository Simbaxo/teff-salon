
type CloseWeekInput = {
    periodStatus: "DRAFT" | "REVIEWED" | "PAID";
    reviewedAt: Date | null;
    entryStatuses: ("DRAFT" | "REVIEWED" | "PAID")[];
};

export function canCloseWeek(input: CloseWeekInput): boolean {
    return (
        input.periodStatus === "REVIEWED" &&
        input.reviewedAt !== null &&
        input.entryStatuses.length > 0 &&
        input.entryStatuses.every(
            (status) => status === "PAID"
        )
    );
}