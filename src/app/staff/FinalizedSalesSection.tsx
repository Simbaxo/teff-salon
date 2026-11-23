import type { FinalizedAppointmentItem } from "@/lib/appointments/get-finalized-appointment-items";

type ClassifiedSale = {
  id: number;
  finalTotal: number;
  assignedItems: {
    appointmentId: number;
    item: FinalizedAppointmentItem;
  }[];
  unassignedItems: FinalizedAppointmentItem[];
};

type Props = {
  sales: ClassifiedSale[];
  isLoading: boolean;
  loadError: boolean;
};

export default function FinalizedSalesSection({
  sales,
  isLoading,
  loadError,
}: Props) {
  if (isLoading || loadError || sales.length === 0) {
    return null;
  }

  return (
    <details className="rounded-2xl border border-neutral-200 bg-neutral-50 p-4 sm:p-5">
      <summary className="cursor-pointer text-xl font-bold text-black">
        Ventas Finalizadas del Día
        <span className="ml-2 text-sm font-normal text-neutral-500">
          ({sales.length})
        </span>
      </summary>

      <p className="mt-2 text-sm text-neutral-600">
        Servicios registrados en checkout. Cada venta aparece una sola vez,
        aunque incluya varias citas o técnicas.
      </p>

      <div className="mt-4 space-y-4">
        {sales.map((sale) => (
          <details
            key={sale.id}
            className="group overflow-hidden rounded-xl border border-neutral-200 bg-white"
          >
            <summary className="flex min-h-11 cursor-pointer list-none flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 text-sm [&::-webkit-details-marker]:hidden">
              <span className="mr-auto font-semibold text-black">
                Venta #{sale.id}
              </span>

              <span className="font-bold tabular-nums text-black">
                ${sale.finalTotal.toLocaleString("es-CO")}
              </span>

              <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                Finalizada
              </span>

              <span
                aria-hidden="true"
                className="text-neutral-600 transition-transform group-open:rotate-90"
              >
                ›
              </span>
            </summary>

            {sale.assignedItems.length > 0 && (
              <div className="p-4">
                <h3 className="text-xs font-semibold uppercase text-neutral-500">
                  Servicios con cita vinculada
                </h3>

                <div className="mt-3 space-y-3">
                  {sale.assignedItems.map(({ appointmentId, item }) => (
                    <div
                      key={item.id}
                      className="flex items-start justify-between gap-3"
                    >
                      <div>
                        <p className="text-sm font-medium text-black">
                          {item.itemType === "ADDON" ? "+ " : ""}
                          {item.itemName}
                        </p>

                        <p className="mt-1 text-xs text-neutral-500">
                          Cita #{appointmentId}
                        </p>
                      </div>

                      <span className="shrink-0 text-sm font-semibold text-black">
                        ${item.unitPrice.toLocaleString("es-CO")}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {sale.unassignedItems.length > 0 && (
              <div className="border-t border-neutral-100 p-4">
                <h3 className="text-xs font-semibold uppercase text-amber-700">
                  Sin cita individual verificada
                </h3>

                <div className="mt-3 space-y-3">
                  {sale.unassignedItems.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-start justify-between gap-3"
                    >
                      <div>
                        <p className="text-sm font-medium text-black">
                          {item.itemType === "ADDON" ? "+ " : ""}
                          {item.itemName}
                        </p>

                        <p className="mt-1 text-xs text-neutral-500">
                          {item.employeeId !== null
                            ? "Técnica registrada en checkout"
                            : "Sin atribución individual registrada"}
                        </p>
                      </div>

                      <span className="shrink-0 text-sm font-semibold text-black">
                        ${item.unitPrice.toLocaleString("es-CO")}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex items-center justify-between gap-3 border-t border-neutral-200 bg-neutral-50 px-4 py-4">
              <span className="text-sm font-semibold text-neutral-700">
                Total de la venta
              </span>

              <span className="text-lg font-bold text-black">
                ${sale.finalTotal.toLocaleString("es-CO")}
              </span>
            </div>

            <p className="px-4 py-3 text-xs text-neutral-500">
              Los precios individuales son los registrados antes de posibles
              descuentos. El total corresponde a la venta finalizada.
            </p>
          </details>
        ))}
      </div>
    </details>
  );
}
