"use client";

import QuickBookingCustomerPicker, {
  type QuickBookingCustomer,
} from "./QuickBookingCustomerPicker";
import QuickBookingServices, {
  type QuickBookingServiceSelection,
} from "./QuickBookingServices";
import QuickBookingDateTime from "./QuickBookingDateTime";

type Props = {
  customer: QuickBookingCustomer | null;
  services: QuickBookingServiceSelection[];
  date: string;
  time: string;
  customTime: boolean;
  saving: boolean;
  error: string;

  onCustomerChange: (customer: QuickBookingCustomer | null) => void;
  onServicesChange: (services: QuickBookingServiceSelection[]) => void;
  onDateChange: (date: string) => void;
  onTimeChange: (time: string) => void;
  onCustomTimeChange: (custom: boolean) => void;

  onClose: () => void;
  onCancel: () => void;
  onConfirm: () => void;
};

export default function QuickBookingModal({
  customer,
  services,
  date,
  time,
  customTime,
  saving,
  error,
  onCustomerChange,
  onServicesChange,
  onDateChange,
  onTimeChange,
  onCustomTimeChange,
  onClose,
  onCancel,
  onConfirm,
}: Props) {
  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/50 p-3 sm:p-6">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="quick-booking-title"
        className="mx-auto w-full max-w-2xl rounded-2xl bg-white p-5 shadow-xl sm:p-7"
      >
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <h2
              id="quick-booking-title"
              className="text-2xl font-bold text-black"
            >
              Nueva cita
            </h2>

            <p className="mt-1 text-sm text-neutral-600">
              Reserva rápida desde recepción
            </p>
          </div>

          <button
            type="button"
            disabled={saving}
            aria-label="Cerrar reserva rápida"
            onClick={onClose}
            className="min-h-11 min-w-11 rounded-xl border border-neutral-300 text-xl text-black"
          >
            ×
          </button>
        </div>

        <div className="space-y-5">
          <div>
            <h3 className="mb-3 text-lg font-semibold text-black">
              1. Cliente
            </h3>

            <QuickBookingCustomerPicker
              value={customer}
              onChange={onCustomerChange}
            />
          </div>

          <div className="border-t border-neutral-200 pt-5">
            <h3 className="mb-3 text-lg font-semibold text-black">
              2. Servicios y técnicas
            </h3>

            <QuickBookingServices
              value={services}
              onChange={onServicesChange}
            />
          </div>

          <QuickBookingDateTime
            date={date}
            time={time}
            customTime={customTime}
            onDateChange={onDateChange}
            onTimeChange={onTimeChange}
            onCustomTimeChange={onCustomTimeChange}
          />

          <div className="border-t border-neutral-200 pt-5">
            {error && (
              <div
                role="alert"
                className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800"
              >
                {error}
              </div>
            )}

            <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                disabled={saving}
                onClick={onCancel}
                className="min-h-12 rounded-xl border border-neutral-300 px-5 py-3 font-semibold text-black disabled:opacity-50"
              >
                Cancelar
              </button>

              <button
                type="button"
                disabled={
                  saving ||
                  !customer ||
                  services.length === 0 ||
                  services.some((service) => service.employeeId == null) ||
                  !date ||
                  !time
                }
                onClick={onConfirm}
                className="min-h-12 rounded-xl bg-[#B76E79] px-6 py-3 font-semibold text-white hover:bg-[#a55e69] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {saving ? "Guardando reserva..." : "Confirmar reserva"}
              </button>
            </div>

            <p className="mt-3 text-xs text-neutral-500">
              Si la cita se superpone con otra o está fuera del horario
              habitual, se solicitará una confirmación adicional.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
