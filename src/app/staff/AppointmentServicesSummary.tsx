import type { FinalizedAppointmentItem } from "@/lib/appointments/get-finalized-appointment-items";

type BookedService = {
  bookedPrice: number;
  service: {
    id: number;
    nameEs: string;
  };
};

type BookedAddon = {
  bookedPrice: number;
  addon: {
    id: number;
    nameEs: string;
  };
};

type Props = {
  status: string;
  bookedServices: BookedService[];
  bookedAddons: BookedAddon[];
  hasLinkedSale: boolean;
  finalizedItems: FinalizedAppointmentItem[];
};

export default function AppointmentServicesSummary({
  status,
  bookedServices,
  bookedAddons,
  hasLinkedSale,
  finalizedItems,
}: Props) {
  const completed = status === "COMPLETED";

  return (
    <>
      {/* Actual services and add-ons recorded at checkout */}
      {completed &&
        hasLinkedSale &&
        (finalizedItems.length === 0 ? (
          <p className="mt-4 rounded-lg bg-amber-50 p-3 text-xs text-amber-800">
            No hay servicios cobrados con atribución individual verificada para
            esta cita. Consulta Ventas Finalizadas del Día.
          </p>
        ) : (
          <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
            <h4 className="text-sm font-semibold text-emerald-900">
              Servicios realizados y cobrados
            </h4>

            <div className="mt-3 space-y-2">
              {finalizedItems.map((item) => (
                <div
                  key={item.id}
                  className="flex items-start justify-between gap-3 text-sm"
                >
                  <div className="min-w-0">
                    <p className="font-medium text-neutral-900">
                      {item.itemType === "ADDON" ? "+ " : ""}
                      {item.itemName}
                    </p>

                    {item.itemType === "ADDON" && (
                      <p className="text-xs text-neutral-600">Adicional</p>
                    )}
                  </div>

                  <span className="shrink-0 font-semibold text-neutral-900">
                    ${item.unitPrice.toLocaleString("es-CO")}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ))}

      {/* Original booked services */}
      <div className="mt-4">
        <p className="text-sm font-semibold text-black">
          {completed ? "Servicios de la reserva original" : "Servicios"}
        </p>

        {bookedServices.map((item) => (
          <p key={item.service.id} className="mt-1 text-sm text-neutral-600">
            {item.service.nameEs} - ${item.bookedPrice.toLocaleString("es-CO")}
          </p>
        ))}
      </div>

      {/* Original booked add-ons */}
      {bookedAddons.length > 0 && (
        <div className="mt-4">
          <p className="text-sm font-semibold text-black">
            {completed ? "Adicionales de la reserva original" : "Adicionales"}
          </p>

          {bookedAddons.map((item) => (
            <p key={item.addon.id} className="mt-1 text-sm text-neutral-600">
              {item.addon.nameEs} - ${item.bookedPrice.toLocaleString("es-CO")}
            </p>
          ))}
        </div>
      )}

      {/* Completed appointment without a linked sale */}
      {completed && !hasLinkedSale && (
        <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
          Servicio completado sin venta vinculada. Pago no verificado en el
          sistema.
        </p>
      )}
    </>
  );
}
