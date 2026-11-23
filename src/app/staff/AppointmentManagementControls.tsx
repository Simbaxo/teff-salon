"use client";

import { getStaffTimeOptions } from "@/lib/appointments/staff-scheduling";
import { formatTime } from "./staff-formatters";

type Props = {
  userRole: "OWNER" | "RECEPTIONIST" | "TECHNICIAN";
  appointment: {
    id: number;
    employeeId: number;
    status: string;
    date: string;
    startTime: string;
  };
  employees: {
    id: number;
    name: string;
  }[];
  reassigningAppointmentId: number | null;
  reschedulingAppointmentId: number | null;
  onReassignEmployee: (appointmentId: number, employeeId: number) => void;
  onRescheduleAppointment: (
    appointmentId: number,
    date: string,
    startTime: string,
  ) => void;
};

const staffTimeOptions = getStaffTimeOptions();

export default function AppointmentManagementControls({
  userRole,
  appointment,
  employees,
  reassigningAppointmentId,
  reschedulingAppointmentId,
  onReassignEmployee,
  onRescheduleAppointment,
}: Props) {
  const canManage =
    userRole === "OWNER" ||
    (userRole === "RECEPTIONIST" &&
      ["REQUESTED", "BOOKED", "CHECKED_IN"].includes(appointment.status));

  if (!canManage) {
    return null;
  }

  return (
    <details className="mt-4 rounded-xl border border-neutral-200 px-4 py-3">
      <summary className="cursor-pointer text-sm font-semibold text-black">
        Gestionar
      </summary>

      <label
        htmlFor={`employee-${appointment.id}`}
        className="block text-sm font-semibold text-black"
      >
        Técnica
      </label>

      <select
        id={`employee-${appointment.id}`}
        value={appointment.employeeId}
        disabled={reassigningAppointmentId === appointment.id}
        onChange={(event) => {
          const newEmployeeId = Number(event.target.value);

          if (newEmployeeId !== appointment.employeeId) {
            onReassignEmployee(appointment.id, newEmployeeId);
          }
        }}
        className="mt-2 rounded-xl border border-neutral-300 bg-white px-4 py-3 text-sm text-black"
      >
        {employees.map((employee) => (
          <option key={employee.id} value={employee.id}>
            {employee.name}
          </option>
        ))}
      </select>

      {reassigningAppointmentId === appointment.id && (
        <p className="mt-2 text-sm text-neutral-500">Cambiando Técnica...</p>
      )}

      <div className="mt-4">
        <label
          htmlFor={`time-${appointment.id}`}
          className="block text-sm font-semibold text-black"
        >
          Hora del servicio
        </label>

        <select
          id={`time-${appointment.id}`}
          value={appointment.startTime}
          disabled={reschedulingAppointmentId === appointment.id}
          onChange={(event) => {
            const newStartTime = event.target.value;

            if (newStartTime !== appointment.startTime) {
              onRescheduleAppointment(
                appointment.id,
                appointment.date.slice(0, 10),
                newStartTime,
              );
            }
          }}
          className="mt-2 min-h-11 w-full max-w-sm rounded-xl border border-neutral-300 bg-white px-4 py-3 text-sm text-black"
        >
          {Array.from(new Set([...staffTimeOptions, appointment.startTime]))
            .sort((a, b) => a.localeCompare(b))
            .map((time) => (
              <option key={time} value={time}>
                {formatTime(time)}
              </option>
            ))}
        </select>

        <details className="mt-3 max-w-sm rounded-xl border border-neutral-200 bg-neutral-50 p-3">
          <summary className="cursor-pointer text-sm font-semibold text-[#1F5A43]">
            Hora personalizada
          </summary>

          <div className="mt-3 space-y-3">
            <p className="text-xs text-neutral-600">
              Selecciona una hora exacta, incluso fuera del horario habitual.
            </p>

            <label
              htmlFor={`custom-time-${appointment.id}`}
              className="block text-sm font-medium text-black"
            >
              Hora exacta
            </label>

            <input
              id={`custom-time-${appointment.id}`}
              type="time"
              step={60}
              defaultValue={appointment.startTime.slice(0, 5)}
              disabled={reschedulingAppointmentId === appointment.id}
              className="min-h-12 w-full rounded-xl border border-neutral-300 bg-white px-4 py-3 text-base text-black"
            />

            <button
              type="button"
              disabled={reschedulingAppointmentId === appointment.id}
              onClick={() => {
                const input = document.getElementById(
                  `custom-time-${appointment.id}`,
                ) as HTMLInputElement | null;

                if (!input?.value) {
                  window.alert("Selecciona una hora válida.");
                  return;
                }

                if (input.value === appointment.startTime.slice(0, 5)) {
                  return;
                }

                void onRescheduleAppointment(
                  appointment.id,
                  appointment.date.slice(0, 10),
                  input.value,
                );
              }}
              className="min-h-12 w-full rounded-xl bg-[#1F5A43] px-4 py-3 text-sm font-semibold text-white hover:bg-[#174632] disabled:opacity-50"
            >
              Guardar hora personalizada
            </button>
          </div>
        </details>

        {reschedulingAppointmentId === appointment.id && (
          <p className="mt-2 text-sm text-neutral-500">Cambiando horario...</p>
        )}
      </div>
    </details>
  );
}
