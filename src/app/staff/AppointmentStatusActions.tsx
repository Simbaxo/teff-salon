"use client";

import Link from "next/link";
import { canMarkNoShow } from "./staff-formatters";

type Props = {
  appointment: {
    id: number;
    bookingId: number | null;
    status: string;
    date: string;
    startTime: string;
  };
  bookingAppointmentCount: number;
  onUpdateStatus: (appointmentId: number, status: string) => void;
};

export default function AppointmentStatusActions({
  appointment,
  bookingAppointmentCount,
  onUpdateStatus,
}: Props) {
  return (
    <>
      {appointment.status === "REQUESTED" && (
        <div className="mt-5">
          <button
            type="button"
            onClick={() => onUpdateStatus(appointment.id, "BOOKED")}
            className="rounded-xl bg-black px-4 py-3 text-sm font-semibold text-white"
          >
            Confirmar Cita
          </button>
        </div>
      )}

      {appointment.status === "BOOKED" && (
        <div className="mt-5 flex flex-wrap gap-3">
          {(appointment.bookingId === null ||
            bookingAppointmentCount === 1) && (
            <button
              type="button"
              onClick={() => onUpdateStatus(appointment.id, "CHECKED_IN")}
              className="rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white hover:bg-blue-700"
            >
              Cliente Llegó
            </button>
          )}

          {canMarkNoShow(appointment.date, appointment.startTime) && (
            <button
              type="button"
              onClick={() => {
                const confirmed = window.confirm(
                  "¿Marcar esta cita como No Asistió?",
                );

                if (confirmed) {
                  onUpdateStatus(appointment.id, "NO_SHOW");
                }
              }}
              className="rounded-xl border border-neutral-300 bg-white px-4 py-3 text-sm font-semibold text-black"
            >
              No Asistió
            </button>
          )}

          <button
            type="button"
            onClick={() => {
              const confirmed = window.confirm(
                "¿Seguro que deseas cancelar esta cita?",
              );

              if (confirmed) {
                onUpdateStatus(appointment.id, "CANCELLED");
              }
            }}
            className="rounded-xl border border-neutral-300 bg-white px-4 py-3 text-sm font-semibold text-black"
          >
            Cancelar Cita
          </button>
        </div>
      )}

      {appointment.status === "CHECKED_IN" && (
        <button
          type="button"
          onClick={() => onUpdateStatus(appointment.id, "IN_PROGRESS")}
          className="mt-5 rounded-xl bg-purple-600 px-4 py-3 text-sm font-semibold text-white hover:bg-purple-700"
        >
          Iniciar Servicio
        </button>
      )}

      {appointment.status === "IN_PROGRESS" && (
        <Link
          href={`/staff/checkout/${appointment.id}`}
          className="mt-5 inline-block rounded-xl bg-green-600 px-4 py-3 text-sm font-semibold text-white hover:bg-green-700"
        >
          Finalizar Servicio
        </Link>
      )}
    </>
  );
}
