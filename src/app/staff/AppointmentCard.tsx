"use client";

import Link from "next/link";
import type { FinalizedAppointmentItem } from "@/lib/appointments/get-finalized-appointment-items";
import {
  formatTime,
  getStatusClasses,
  getStatusLabel,
} from "./staff-formatters";
import AppointmentServicesSummary from "./AppointmentServicesSummary";
import AppointmentManagementControls from "./AppointmentManagementControls";
import AppointmentStatusActions from "./AppointmentStatusActions";

type Appointment = {
  id: number;
  bookingId: number | null;
  employeeId: number;
  date: string;
  startTime: string;
  duration: number;
  status: string;

  customer: {
    id: number;
    name: string;
    phone: string;
  };

  appointmentServices: {
    bookedPrice: number;
    service: {
      id: number;
      nameEs: string;
    };
  }[];

  appointmentAddons: {
    bookedPrice: number;
    addon: {
      id: number;
      nameEs: string;
    };
  }[];

  saleAppointments: unknown[];
};

type Employee = {
  id: number;
  name: string;
};

type Props = {
  appointment: Appointment;
  userRole: "OWNER" | "RECEPTIONIST" | "TECHNICIAN";
  employees: Employee[];

  bookingAppointmentCount: number;
  bookingAppointmentPosition: number | null;

  finalizedItems: FinalizedAppointmentItem[];

  reassigningAppointmentId: number | null;
  reschedulingAppointmentId: number | null;

  onReassignEmployee: (appointmentId: number, employeeId: number) => void;

  onRescheduleAppointment: (
    appointmentId: number,
    date: string,
    startTime: string,
  ) => void;

  onUpdateStatus: (appointmentId: number, status: string) => void;
};

export default function AppointmentCard({
  appointment,
  userRole,
  employees,
  bookingAppointmentCount,
  bookingAppointmentPosition,
  finalizedItems,
  reassigningAppointmentId,
  reschedulingAppointmentId,
  onReassignEmployee,
  onRescheduleAppointment,
  onUpdateStatus,
}: Props) {
  const isMultiServiceBooking =
    appointment.bookingId !== null && bookingAppointmentCount > 1;

  return (
    <div
      className={`rounded-xl p-5 shadow-sm ${
        isMultiServiceBooking
          ? "border-l-4 border-[#b76e79] bg-white"
          : "bg-white"
      }`}
    >
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-lg font-semibold text-black">
            <Link
              href={`/staff/customers/${appointment.customer.id}`}
              className="underline-offset-4 hover:underline"
            >
              {appointment.customer.name}
            </Link>
          </h3>

          <p className="mt-1 text-sm text-neutral-700">
            <span className="font-semibold text-black">
              {formatTime(appointment.startTime)}
            </span>
            {" · "}
            {appointment.appointmentServices
              .map(({ service }) => service.nameEs)
              .join(", ") || "Cita"}
          </p>

          <p className="text-sm text-neutral-500">
            {appointment.customer.phone}
          </p>

          {isMultiServiceBooking && bookingAppointmentPosition !== null && (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-rose-50 px-3 py-1 text-xs font-bold text-rose-900">
                Servicio {bookingAppointmentPosition} de{" "}
                {bookingAppointmentCount}
              </span>

              <span className="text-xs font-semibold text-neutral-500">
                Misma Reserva #{appointment.bookingId}
              </span>
            </div>
          )}
        </div>

        <span
          className={`rounded-full px-3 py-1 text-xs font-semibold ${getStatusClasses(
            appointment.status,
          )}`}
        >
          {getStatusLabel(appointment.status)}
        </span>
      </div>

      <div className="mt-4 text-sm text-neutral-700">
        <p>
          <strong>Duración:</strong> {appointment.duration} min
        </p>
      </div>

      <AppointmentServicesSummary
        status={appointment.status}
        bookedServices={appointment.appointmentServices}
        bookedAddons={appointment.appointmentAddons}
        hasLinkedSale={appointment.saleAppointments.length > 0}
        finalizedItems={finalizedItems}
      />

      <AppointmentManagementControls
        userRole={userRole}
        appointment={appointment}
        employees={employees}
        reassigningAppointmentId={reassigningAppointmentId}
        reschedulingAppointmentId={reschedulingAppointmentId}
        onReassignEmployee={onReassignEmployee}
        onRescheduleAppointment={onRescheduleAppointment}
      />

      <AppointmentStatusActions
        appointment={appointment}
        bookingAppointmentCount={bookingAppointmentCount}
        onUpdateStatus={onUpdateStatus}
      />
    </div>
  );
}
