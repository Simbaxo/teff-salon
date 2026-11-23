"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { signOut } from "next-auth/react";
import { getTeffToday, addTeffDays } from "@/lib/datetime";
import type { QuickBookingCustomer } from "./QuickBookingCustomerPicker";
import type { QuickBookingServiceSelection } from "./QuickBookingServices";
import StaffBookingConfirmation, {
  type StaffBookingConfirmationDetails,
} from "./StaffBookingConfirmation";
import {
  getStatusLabel,
  getStatusClasses,
  canMarkNoShow,
  formatTime,
} from "./staff-formatters";
import { CalendarOff, CalendarDays, History } from "lucide-react";
import { getStaffTimeOptions } from "@/lib/appointments/staff-scheduling";
import { getUniqueFinalizedSales } from "@/lib/appointments/get-unique-finalized-sales";
import { classifyFinalizedSaleItems } from "@/lib/appointments/classify-finalized-sale-items";
import InternalHeader from "@/components/InternalHeader";
import ScheduleManager from "./ScheduleManager";
import QuickBookingModal from "./QuickBookingModal";
import FinalizedSalesSection from "./FinalizedSalesSection";
import AppointmentServicesSummary from "./AppointmentServicesSummary";

type Appointment = {
  id: number;
  bookingId: number | null;
  employeeId: number;
  date: string;
  startTime: string;
  duration: number;
  status: string;
  notes: string | null;

  customer: {
    id: number;
    name: string;
    phone: string;
    email: string | null;
  };

  employee: {
    id: number;
    name: string;
  };

  appointmentServices: {
    bookedPrice: number;
    bookedDuration: number;
    service: {
      id: number;
      nameEs: string;
      nameEn: string;
    };
  }[];

  appointmentAddons: {
    bookedPrice: number;
    bookedDuration: number;
    addon: {
      id: number;
      nameEs: string;
      nameEn: string;
    };
  }[];
  // Finalized checkout data, available only from the staff API.
  saleAppointments: {
    sale: {
      id: number;
      finalTotal: number;

      lineItems: {
        id: number;
        itemType: string;
        itemName: string;
        unitPrice: number;
        employeeId: number | null;
        appointmentId: number | null;
        parentLineItemId: number | null;
      }[];

      saleAppointments: {
        appointment: {
          id: number;
          customerId: number;
        };
      }[];
    };
  }[];
};

type Employee = {
  id: number;
  name: string;
  active: boolean;
};

type StaffPageClientProps = {
  userName: string;
  userRole: "OWNER" | "RECEPTIONIST" | "TECHNICIAN";
};

const staffTimeOptions = getStaffTimeOptions();

export default function StaffPage({
  userName,
  userRole,
}: StaffPageClientProps) {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  // Active technicians available for appointment reassignment
  const [employees, setEmployees] = useState<Employee[]>([]);
  // Track which appointment is currently being reassigned
  const [reassigningAppointmentId, setReassigningAppointmentId] = useState<
    number | null
  >(null);
  // Track which individual service block is being rescheduled.
  const [reschedulingAppointmentId, setReschedulingAppointmentId] = useState<
    number | null
  >(null);
  // Track whether the staff appointment data is still loading.
  const [isLoading, setIsLoading] = useState(true);
  // Show a useful message if appointment data cannot be loaded.
  const [loadError, setLoadError] = useState(false);
  // Track expanded reservations independently for each technician.
  const [expandedBookingGroups, setExpandedBookingGroups] = useState<string[]>(
    [],
  );
  // Default the staff calendar to today's date in Medellin.
  const [selectedDate, setSelectedDate] = useState(getTeffToday());

  const [selectedEmployeeId, setSelectedEmployeeId] = useState("");

  const [showQuickBooking, setShowQuickBooking] = useState(false);

  // Saved reservation to display in the customer-facing confirmation.
  const [confirmedStaffBooking, setConfirmedStaffBooking] =
    useState<StaffBookingConfirmationDetails | null>(null);

  const [showScheduleManager, setShowScheduleManager] = useState(false);

  const [checkingInBookingId, setCheckingInBookingId] = useState<number | null>(
    null,
  );

  const [quickBookingCustomer, setQuickBookingCustomer] =
    useState<QuickBookingCustomer | null>(null);

  const [quickBookingServices, setQuickBookingServices] = useState<
    QuickBookingServiceSelection[]
  >([]);

  const [quickBookingDate, setQuickBookingDate] = useState(selectedDate);
  const [quickBookingTime, setQuickBookingTime] = useState("10:00");
  const [quickBookingCustomTime, setQuickBookingCustomTime] = useState(false);

  const [quickBookingSaving, setQuickBookingSaving] = useState(false);
  const [quickBookingError, setQuickBookingError] = useState("");

  const quickBookingSavingRef = useRef(false);

  const quickBookingSubmissionRef = useRef<{
    signature: string;
    requestKey: string;
  } | null>(null);

  async function confirmQuickBooking() {
    if (quickBookingSavingRef.current) return;

    setQuickBookingError("");

    if (!quickBookingCustomer) {
      setQuickBookingError("Selecciona o registra un cliente.");
      return;
    }

    if (quickBookingServices.length === 0) {
      setQuickBookingError("Selecciona al menos un servicio.");
      return;
    }

    if (quickBookingServices.some((service) => service.employeeId == null)) {
      setQuickBookingError("Selecciona una técnica para cada servicio.");
      return;
    }

    if (!quickBookingDate || !quickBookingTime) {
      setQuickBookingError("Selecciona la fecha y hora de la cita.");
      return;
    }

    const customer =
      quickBookingCustomer.kind === "existing"
        ? {
            kind: "existing" as const,
            id: quickBookingCustomer.id,
          }
        : {
            kind: "new" as const,
            name: quickBookingCustomer.name,
            phone: quickBookingCustomer.phone,
            email: quickBookingCustomer.email,
          };

    const services = quickBookingServices.map((service) => ({
      serviceId: service.serviceId,
      employeeId: service.employeeId!,
    }));

    const details = {
      customer,
      services,
      date: quickBookingDate,
      startTime: quickBookingTime,
    };

    const signature = JSON.stringify(details);

    if (
      !quickBookingSubmissionRef.current ||
      quickBookingSubmissionRef.current.signature !== signature
    ) {
      quickBookingSubmissionRef.current = {
        signature,
        requestKey: crypto.randomUUID(),
      };
    }

    const requestKey = quickBookingSubmissionRef.current.requestKey;

    quickBookingSavingRef.current = true;
    setQuickBookingSaving(true);

    let overrideOverlap = false;
    let overrideOutsideHours = false;

    try {
      for (let attempt = 0; attempt < 3; attempt++) {
        const response = await fetch("/api/staff/quick-booking/create", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            requestKey,
            ...details,
            overrideOverlap,
            overrideOutsideHours,
          }),
        });

        const result = await response.json();

        if (response.ok) {
          const savedBookingId = Number(result.bookingId);

          // The reservation has already been saved successfully.
          // Close the booking form and refresh the agenda.
          setShowQuickBooking(false);
          setQuickBookingCustomer(null);
          setQuickBookingServices([]);
          setQuickBookingError("");
          quickBookingSubmissionRef.current = null;

          setSelectedDate(quickBookingDate);

          // Confirmation errors must never be reported as booking failures.
          try {
            const confirmation =
              await getStaffBookingConfirmation(savedBookingId);

            setConfirmedStaffBooking(confirmation);
          } catch (error) {
            console.error("Booking confirmation details failed:", error);

            window.alert(
              `La reserva #${savedBookingId} se guardó correctamente, ` +
                "pero no se pudo mostrar la tarjeta de confirmación. " +
                "Puedes encontrarla en la agenda.",
            );
          }

          await loadAppointments();
          return;
        }

        if (
          response.status === 409 &&
          result.conflictType === "OUTSIDE_HOURS" &&
          !overrideOutsideHours
        ) {
          const confirmed = window.confirm(
            "Esta cita está fuera del horario habitual del salón. ¿Deseas crearla de todas formas?",
          );

          if (!confirmed) return;

          overrideOutsideHours = true;
          continue;
        }

        if (
          response.status === 409 &&
          result.conflictType === "APPOINTMENT" &&
          !overrideOverlap
        ) {
          const confirmed = window.confirm(
            "La técnica ya tiene otra cita en ese horario. ¿Deseas crear esta reserva aunque se superpongan?",
          );

          if (!confirmed) return;

          overrideOverlap = true;
          continue;
        }

        setQuickBookingError(
          typeof result.error === "string"
            ? result.error
            : "No se pudo guardar la reserva.",
        );

        return;
      }

      setQuickBookingError(
        "No se pudo completar la confirmación. Intenta nuevamente.",
      );
    } catch (error) {
      console.error("Quick Booking failed:", error);

      setQuickBookingError(
        "Error de conexión. Puedes intentar guardar nuevamente sin duplicar la reserva.",
      );
    } finally {
      quickBookingSavingRef.current = false;
      setQuickBookingSaving(false);
    }
  }

  async function getStaffBookingConfirmation(
    bookingId: number,
  ): Promise<StaffBookingConfirmationDetails> {
    const response = await fetch("/api/appointments", {
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error("No se pudieron consultar los detalles de la reserva.");
    }

    const appointments = (await response.json()) as Appointment[];

    const bookingAppointments = appointments
      .filter((appointment) => appointment.bookingId === bookingId)
      .sort((a, b) => a.startTime.localeCompare(b.startTime) || a.id - b.id);

    if (bookingAppointments.length === 0) {
      throw new Error("No se encontraron las citas de esta reserva.");
    }

    const first = bookingAppointments[0];

    const services = bookingAppointments.flatMap((appointment) =>
      appointment.appointmentServices.map((item) => ({
        id: appointment.id * 100000 + item.service.id,
        name: item.service.nameEs,
        technician: appointment.employee.name,
        startTime: appointment.startTime,
      })),
    );

    if (services.length === 0) {
      throw new Error("La reserva no contiene servicios.");
    }

    return {
      bookingId,
      customerName: first.customer.name,
      date: first.date.slice(0, 10),
      services,
    };
  }

  // Load The Appointments from the Staff API
  async function loadAppointments() {
    try {
      setIsLoading(true);
      setLoadError(false);

      const response = await fetch("/api/appointments");

      if (!response.ok) {
        throw new Error("No se pudieron cargar las citas");
      }

      const data = await response.json();
      setAppointments(data);
    } catch (error) {
      console.error(error);
      setLoadError(true);
    } finally {
      setIsLoading(false);
    }
  }

  // Load active technicians for appointment reassignment
  async function loadEmployees() {
    try {
      const response = await fetch("/api/employees");

      if (!response.ok) {
        throw new Error("No se pudieron cargar las técnicas");
      }

      const data = await response.json();
      setEmployees(data);
    } catch (error) {
      console.error(error);
    }
  }

  useEffect(() => {
    loadAppointments();
    loadEmployees();
  }, []);

  // Create the Filtered Appointments
  const appointmentsForDate = appointments.filter(
    (appointment) => appointment.date.slice(0, 10) === selectedDate,
  );

  // Collect finalized sales once for the selected agenda date.
  // Multiple appointment blocks may reference the same sale.
  // This does not modify the original appointment information.
  const finalizedSalesForDate = getUniqueFinalizedSales(appointmentsForDate);

  // Classify each finalized service exactly once.
  // Keep appointment-linked items separate from items whose
  // individual appointment ownership cannot be verified.
  const classifiedFinalizedSales = finalizedSalesForDate.map((sale) => {
    const classification = classifyFinalizedSaleItems(
      sale,
      appointmentsForDate,
    );

    return {
      ...sale,
      assignedItems: classification.assignedItems,
      unassignedItems: classification.unassignedItems,
    };
  });

  // Finalized checkout items safely attributed to one appointment.
  // Never infer ownership of ambiguous or legacy sale items.
  function getCompletedAppointmentItems(appointmentId: number) {
    return classifiedFinalizedSales.flatMap((sale) =>
      sale.assignedItems
        .filter((entry) => entry.appointmentId === appointmentId)
        .map((entry) => entry.item),
    );
  }

  // Count how many appointment blocks belong to the same customer booking
  function getBookingAppointmentCount(bookingId: number | null) {
    if (bookingId === null) {
      return 1;
    }

    return appointmentsForDate.filter(
      (appointment) => appointment.bookingId === bookingId,
    ).length;
  }

  function getBookingAppointmentPosition(
    appointmentId: number,
    bookingId: number | null,
  ) {
    if (bookingId === null) {
      return null;
    }

    const bookingAppointments = appointmentsForDate
      .filter((appointment) => appointment.bookingId === bookingId)
      .sort((a, b) => a.startTime.localeCompare(b.startTime));

    const index = bookingAppointments.findIndex(
      (appointment) => appointment.id === appointmentId,
    );

    return index >= 0 ? index + 1 : null;
  }

  const technicianOptions = Array.from(
    new Map(
      appointmentsForDate.map(
        (appointment) =>
          [appointment.employeeId, appointment.employee.name] as const,
      ),
    ),
  ).sort(([, first], [, second]) => first.localeCompare(second, "es-CO"));

  const visibleAppointments = appointmentsForDate.filter(
    (appointment) =>
      selectedEmployeeId === "" ||
      String(appointment.employeeId) === selectedEmployeeId,
  );

  // Group Appointments by Technician
  const appointmentsByEmployee = visibleAppointments.reduce(
    (groups, appointment) => {
      const employeeName = appointment.employee.name;

      if (!groups[employeeName]) {
        groups[employeeName] = [];
      }

      groups[employeeName].push(appointment);

      return groups;
    },
    {} as Record<string, Appointment[]>,
  );

  // Group each technician's appointments by reservation.
  // Appointments without a booking ID remain independent.
  const reservationGroupsByEmployee = Object.fromEntries(
    Object.entries(appointmentsByEmployee).map(
      ([employeeName, employeeAppointments]) => {
        const groups = new Map<string, Appointment[]>();

        const sortedAppointments = [...employeeAppointments].sort((a, b) =>
          a.startTime.localeCompare(b.startTime),
        );

        for (const appointment of sortedAppointments) {
          const groupKey =
            appointment.bookingId !== null
              ? `booking-${appointment.bookingId}`
              : `appointment-${appointment.id}`;

          if (!groups.has(groupKey)) {
            groups.set(groupKey, []);
          }

          groups.get(groupKey)!.push(appointment);
        }

        return [
          employeeName,
          Array.from(groups, ([key, groupAppointments]) => ({
            key,
            bookingId: groupAppointments[0].bookingId,
            customer: groupAppointments[0].customer,
            appointments: groupAppointments,
          })),
        ];
      },
    ),
  ) as Record<
    string,
    {
      key: string;
      bookingId: number | null;
      customer: Appointment["customer"];
      appointments: Appointment[];
    }[]
  >;

  // Open a specific reservation from Reception notifications
  // or recent-booking links.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const bookingId = Number(params.get("bookingId"));
    const requestedDate = params.get("date");

    if (
      !Number.isSafeInteger(bookingId) ||
      bookingId <= 0 ||
      !requestedDate ||
      !/^\d{4}-\d{2}-\d{2}$/.test(requestedDate)
    ) {
      return;
    }

    if (selectedDate !== requestedDate) {
      setSelectedDate(requestedDate);
      return;
    }

    const matchingAppointment = appointments.find(
      (appointment) =>
        appointment.bookingId === bookingId &&
        appointment.date.slice(0, 10) === requestedDate,
    );

    if (!matchingAppointment) return;

    // A previously selected technician must not hide this booking.
    if (selectedEmployeeId !== "") {
      setSelectedEmployeeId("");
      return;
    }

    const groupKey = `${matchingAppointment.employeeId}-booking-${bookingId}`;

    setExpandedBookingGroups((current) =>
      current.includes(groupKey) ? current : [...current, groupKey],
    );

    const targetId = `staff-booking-${bookingId}`;

    requestAnimationFrame(() => {
      document.getElementById(targetId)?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    });
  }, [appointments, selectedDate, selectedEmployeeId]);

  // Add the status update function
  async function updateAppointmentStatus(
    appointmentId: number,
    status: string,
  ) {
    try {
      const response = await fetch(
        `/api/appointments/${appointmentId}/status`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ status }),
        },
      );

      if (!response.ok) {
        throw new Error("No se pudo actualizar la cita");
      }

      setAppointments((current) =>
        current.map((appointment) =>
          appointment.id === appointmentId
            ? { ...appointment, status }
            : appointment,
        ),
      );
    } catch (error) {
      console.error(error);
    }
  }

  async function checkInBooking(bookingId: number) {
    if (checkingInBookingId !== null) return;

    setCheckingInBookingId(bookingId);

    try {
      const response = await fetch(`/api/bookings/${bookingId}/check-in`, {
        method: "PATCH",
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(
          result.error || "No se pudo registrar la llegada del cliente.",
        );
      }

      // Refresh every service in this reservation, including
      // services assigned to different technicians.
      await loadAppointments();
    } catch (error) {
      console.error("Booking check-in failed:", error);

      window.alert(
        error instanceof Error
          ? error.message
          : "No se pudo registrar la llegada del cliente.",
      );
    } finally {
      setCheckingInBookingId(null);
    }
  }

  // Reassign an appointment to another qualified technician.
  // Appointment overlaps can be intentionally overridden after confirmation.
  async function reassignEmployee(appointmentId: number, employeeId: number) {
    try {
      setReassigningAppointmentId(appointmentId);

      async function sendReassignmentRequest(overrideOverlap = false) {
        const response = await fetch(
          `/api/appointments/${appointmentId}/employee`,
          {
            method: "PATCH",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              employeeId,
              overrideOverlap,
            }),
          },
        );

        const data = await response.json();

        return {
          response,
          data,
        };
      }

      // First attempt keeps normal overlap protection enabled.
      let { response, data } = await sendReassignmentRequest();

      // If the new technician already has another appointment,
      // staff may intentionally override the overlap.
      if (response.status === 409 && data.conflictType === "APPOINTMENT") {
        const confirmed = window.confirm(
          "Esta técnica ya tiene otra cita durante este horario.\n\n¿Deseas asignar la cita de todas formas?",
        );

        if (!confirmed) {
          return;
        }

        // Retry only after explicit confirmation.
        ({ response, data } = await sendReassignmentRequest(true));
      }

      if (!response.ok) {
        if (response.status === 409 && data.conflictType === "SCHEDULE_BLOCK") {
          alert("La técnica tiene un bloqueo de horario durante este período.");
          return;
        }

        alert(data.error || "No se pudo cambiar la técnica");
        return;
      }

      // Reload so the appointment moves to the correct technician.
      await loadAppointments();
    } catch (error) {
      console.error(error);
      alert("No se pudo cambiar la técnica");
    } finally {
      setReassigningAppointmentId(null);
    }
  }

  // Change the schedule of one appointment block without changing
  // the other services that belong to the same customer booking
  // Appointment overlaps can be intentionally overridden after confirmation
  async function rescheduleAppointment(
    appointmentId: number,
    date: string,
    startTime: string,
  ) {
    try {
      setReschedulingAppointmentId(appointmentId);

      async function sendRescheduleRequest(
        overrideOverlap = false,
        overrideOutsideHours = false,
      ) {
        const response = await fetch(
          `/api/appointments/${appointmentId}/schedule`,
          {
            method: "PATCH",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              date,
              startTime,
              overrideOverlap,
              overrideOutsideHours,
            }),
          },
        );

        const data = await response.json();

        return {
          response,
          data,
        };
      }

      // First attempt respects all normal scheduling restrictions.
      let overrideOverlap = false;
      let overrideOutsideHours = false;

      let { response, data } = await sendRescheduleRequest();

      for (let attempt = 0; attempt < 3; attempt++) {
        if (response.status !== 409) break;

        if (data.conflictType === "OUTSIDE_HOURS" && !overrideOutsideHours) {
          const confirmed = window.confirm(
            "La hora seleccionada está fuera del horario habitual del salón.\n\n¿Deseas guardar la cita de todas formas?",
          );

          if (!confirmed) return;

          overrideOutsideHours = true;
        } else if (data.conflictType === "APPOINTMENT" && !overrideOverlap) {
          const confirmed = window.confirm(
            "Este horario se superpone con otra cita.\n\n¿Deseas guardar la cita de todas formas?",
          );

          if (!confirmed) return;

          overrideOverlap = true;
        } else {
          break;
        }

        ({ response, data } = await sendRescheduleRequest(
          overrideOverlap,
          overrideOutsideHours,
        ));
      }

      if (!response.ok) {
        if (response.status === 409 && data.conflictType === "SCHEDULE_BLOCK") {
          alert("La técnica tiene un bloqueo de horario durante este período.");
          return;
        }

        alert(data.error || "No se pudo cambiar el horario");
        return;
      }

      // Reload so technician columns and appointment times stay synchronized.
      await loadAppointments();
    } catch (error) {
      console.error(error);
      alert("No se pudo cambiar el horario");
    } finally {
      setReschedulingAppointmentId(null);
    }
  }

  return (
    <main className="min-h-screen bg-neutral-100 p-6">
      {showScheduleManager && (
        <ScheduleManager
          initialDate={selectedDate}
          onClose={() => setShowScheduleManager(false)}
          onChanged={loadAppointments}
        />
      )}
      {confirmedStaffBooking && (
        <StaffBookingConfirmation
          booking={confirmedStaffBooking}
          onClose={() => {
            setConfirmedStaffBooking(null);
          }}
          onNewBooking={() => {
            setConfirmedStaffBooking(null);

            setQuickBookingCustomer(null);
            setQuickBookingServices([]);
            setQuickBookingDate(selectedDate);
            setQuickBookingTime("10:00");
            setQuickBookingCustomTime(false);
            setQuickBookingError("");

            quickBookingSubmissionRef.current = null;

            setShowQuickBooking(true);
          }}
        />
      )}

      {showQuickBooking && (
        <QuickBookingModal
          customer={quickBookingCustomer}
          services={quickBookingServices}
          date={quickBookingDate}
          time={quickBookingTime}
          customTime={quickBookingCustomTime}
          saving={quickBookingSaving}
          error={quickBookingError}
          onCustomerChange={setQuickBookingCustomer}
          onServicesChange={setQuickBookingServices}
          onDateChange={setQuickBookingDate}
          onTimeChange={setQuickBookingTime}
          onCustomTimeChange={setQuickBookingCustomTime}
          onClose={() => {
            setShowQuickBooking(false);
            setQuickBookingCustomer(null);
            setQuickBookingServices([]);
          }}
          onCancel={() => {
            setShowQuickBooking(false);
            setQuickBookingCustomer(null);
            setQuickBookingServices([]);
            setQuickBookingError("");
            quickBookingSubmissionRef.current = null;
          }}
          onConfirm={confirmQuickBooking}
        />
      )}

      <div className="mx-auto max-w-7xl">
        {/* Shared responsive navigation */}
        <InternalHeader userRole={userRole} userName={userName} />

        {/* Agenda page heading */}
        <section className="mt-7 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#B76E79]">
              TEFF Staff
            </p>

            <h1 className="mt-1 text-3xl font-bold tracking-tight text-neutral-900 sm:text-4xl">
              Agenda
            </h1>

            <p className="mt-2 text-sm text-neutral-600">
              Gestiona las citas del salón
            </p>
          </div>

          {(userRole === "OWNER" || userRole === "RECEPTIONIST") && (
            <button
              type="button"
              onClick={() => {
                setQuickBookingDate(selectedDate);
                setQuickBookingTime("10:00");
                setQuickBookingCustomTime(false);
                setQuickBookingError("");
                setShowQuickBooking(true);
              }}
              className="inline-flex min-h-12 items-center justify-center rounded-xl bg-[#B76E79] px-6 py-3 text-sm font-semibold text-white shadow-sm hover:bg-[#a55e69] sm:self-center"
            >
              + Nueva cita
            </button>
          )}
        </section>

        <div className="mt-6 rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm sm:p-5">
          <div className="mb-3 flex items-center justify-between">
            <label
              htmlFor="staff-date"
              className="text-sm font-semibold text-neutral-800"
            >
              Fecha de la agenda
            </label>

            <span className="hidden text-xs text-neutral-500 sm:inline">
              Selecciona el día y la técnica
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            <button
              type="button"
              aria-label="Día anterior"
              onClick={() => setSelectedDate((date) => addTeffDays(date, -1))}
              className="min-h-11 min-w-11 rounded-xl border border-neutral-300 bg-white text-xl text-black hover:bg-neutral-100"
            >
              ‹
            </button>

            <input
              id="staff-date"
              type="date"
              value={selectedDate}
              onChange={(event) => {
                if (event.target.value) setSelectedDate(event.target.value);
              }}
              className="min-h-11 rounded-xl border border-neutral-300 bg-white px-3 text-black"
            />

            <button
              type="button"
              aria-label="Día siguiente"
              onClick={() => setSelectedDate((date) => addTeffDays(date, 1))}
              className="min-h-11 min-w-11 rounded-xl border border-neutral-300 bg-white text-xl text-black hover:bg-neutral-100"
            >
              ›
            </button>

            <button
              type="button"
              onClick={() => setSelectedDate(getTeffToday())}
              className="min-h-11 rounded-xl bg-rose-50 px-4 text-sm font-semibold text-[#9F5360] hover:bg-rose-100"
            >
              Hoy
            </button>
            <select
              aria-label="Filtrar agenda por técnica"
              value={selectedEmployeeId}
              onChange={(event) => setSelectedEmployeeId(event.target.value)}
              className="min-h-11 max-w-full rounded-xl border border-neutral-300 bg-white px-3 text-sm font-semibold text-black"
            >
              <option value="">Todas las técnicas</option>
              {selectedEmployeeId !== "" &&
                !technicianOptions.some(
                  ([id]) => String(id) === selectedEmployeeId,
                ) && (
                  <option value={selectedEmployeeId}>
                    Técnica sin citas este día
                  </option>
                )}
              {technicianOptions.map(([id, name]) => (
                <option key={id} value={String(id)}>
                  {name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
          {(userRole === "OWNER" || userRole === "RECEPTIONIST") && (
            <button
              type="button"
              onClick={() => setShowScheduleManager(true)}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-neutral-300 bg-white px-4 py-2.5 text-sm font-semibold text-neutral-800 transition-colors hover:border-[#B76E79] hover:bg-rose-50 hover:text-[#9F5360]"
            >
              <CalendarOff size={18} strokeWidth={1.8} aria-hidden="true" />
              Gestionar horarios
            </button>
          )}

          <Link
            href="/staff/historical"
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-neutral-300 bg-white px-4 py-2.5 text-sm font-semibold text-neutral-800 transition-colors hover:border-[#B76E79] hover:bg-rose-50"
          >
            <History size={18} strokeWidth={1.8} aria-hidden="true" />
            Registrar servicio anterior
          </Link>

          <Link
            href="/staff/upcoming"
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-neutral-300 bg-white px-4 py-2.5 text-sm font-semibold text-neutral-800 transition-colors hover:border-[#B76E79] hover:bg-rose-50"
          >
            <CalendarDays size={18} strokeWidth={1.8} aria-hidden="true" />
            Ver próximas citas
          </Link>
        </div>

        <div className="mt-8 space-y-4">
          {isLoading && (
            <p className="text-sm text-neutral-600">Cargando Citas...</p>
          )}

          {loadError && (
            <div className="space-y-2">
              <p className="text-sm text-red-600">
                No se pudieron cargar las citas. Intenta nuevamente.
              </p>

              <button
                onClick={loadAppointments}
                className="rounded-lg border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-black"
              >
                Reintentar
              </button>
            </div>
          )}

          {!isLoading && !loadError && visibleAppointments.length === 0 && (
            <div className="rounded-2xl border border-neutral-200 bg-white px-5 py-12 text-center shadow-sm sm:py-16">
              {/* TEFF empty calendar illustration */}
              <svg
                viewBox="0 0 240 190"
                role="img"
                aria-label="Calendario sin citas"
                className="mx-auto mb-6 h-40 w-52 sm:h-44 sm:w-60"
              >
                <ellipse cx="120" cy="104" rx="102" ry="73" fill="#F9EFF0" />
                <ellipse
                  cx="155"
                  cy="126"
                  rx="63"
                  ry="49"
                  fill="#F5E5E8"
                  opacity="0.85"
                />

                <rect
                  x="57"
                  y="47"
                  width="126"
                  height="111"
                  rx="17"
                  fill="white"
                  stroke="#D9B4BB"
                  strokeWidth="3"
                />
                <path
                  d="M57 64a17 17 0 0 1 17-17h92a17 17 0 0 1 17 17v21H57V64Z"
                  fill="#B76E79"
                />

                <rect
                  x="82"
                  y="36"
                  width="10"
                  height="29"
                  rx="5"
                  fill="#E7BCC4"
                />
                <rect
                  x="148"
                  y="36"
                  width="10"
                  height="29"
                  rx="5"
                  fill="#E7BCC4"
                />

                {[
                  [81, 100],
                  [108, 100],
                  [135, 100],
                  [81, 124],
                  [108, 124],
                  [135, 124],
                ].map(([x, y]) => (
                  <rect
                    key={`${x}-${y}`}
                    x={x}
                    y={y}
                    width="17"
                    height="16"
                    rx="4"
                    fill="#F0DFE2"
                  />
                ))}

                <circle cx="174" cy="139" r="30" fill="#B76E79" />
                <path
                  d="m161 139 9 9 19-20"
                  fill="none"
                  stroke="white"
                  strokeWidth="5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />

                <path
                  d="m192 27 5-13 M208 41l11-9 M211 59l15-3"
                  fill="none"
                  stroke="#B76E79"
                  strokeWidth="4"
                  strokeLinecap="round"
                />
              </svg>

              <h2 className="text-xl font-bold tracking-tight text-neutral-900 sm:text-2xl">
                No hay citas para esta fecha
              </h2>

              <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-neutral-600 sm:text-base">
                {selectedEmployeeId
                  ? "Esta técnica no tiene citas registradas para el día seleccionado."
                  : "Aún no tienes citas registradas para el día seleccionado."}
              </p>

              {(userRole === "OWNER" || userRole === "RECEPTIONIST") && (
                <button
                  type="button"
                  onClick={() => {
                    setQuickBookingDate(selectedDate);
                    setQuickBookingTime("10:00");
                    setQuickBookingCustomTime(false);
                    setQuickBookingError("");
                    setShowQuickBooking(true);
                  }}
                  className="mt-7 inline-flex min-h-12 items-center justify-center rounded-xl bg-[#B76E79] px-7 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#a55e69]"
                >
                  + Nueva cita
                </button>
              )}
            </div>
          )}

          {[false, true].map((completedSection) => {
            let groupCount = 0;

            const sections = Object.entries(reservationGroupsByEmployee).map(
              ([employeeName, groups]) => {
                const reservationGroups = groups.filter((group) => {
                  const first = group.appointments[0];
                  const reservationAppointments =
                    first.bookingId === null
                      ? group.appointments
                      : appointmentsForDate.filter(
                          (appointment) =>
                            appointment.bookingId === first.bookingId,
                        );

                  return (
                    reservationAppointments.every(
                      (appointment) => appointment.status === "COMPLETED",
                    ) === completedSection
                  );
                });

                if (reservationGroups.length === 0) return null;
                groupCount += reservationGroups.length;

                return (
                  <section key={employeeName}>
                    <h2 className="mb-4 text-xl font-bold text-black">
                      {employeeName}
                    </h2>

                    <div className="space-y-4">
                      {reservationGroups.map((group) => (
                        <div
                          key={group.key}
                          id={
                            group.bookingId !== null
                              ? `staff-booking-${group.bookingId}`
                              : undefined
                          }
                          className="scroll-mt-24 space-y-3"
                        >
                          {/* Compact summary for reservations with multiple services. */}
                          {group.bookingId !== null &&
                            group.appointments.length > 1 && (
                              <div className="rounded-xl border-l-4 border-[#B76E79] bg-white p-5 shadow-sm">
                                {/* Reservation identity */}
                                <div>
                                  <Link
                                    href={`/staff/customers/${group.customer.id}`}
                                    className="text-lg font-bold text-black hover:underline"
                                  >
                                    {group.customer.name}
                                  </Link>

                                  <p className="mt-1 text-sm text-neutral-500">
                                    Reserva #{group.bookingId} ·{" "}
                                    {group.appointments.length} servicios
                                  </p>
                                </div>

                                {/* Scheduled services */}
                                <div className="mt-4 space-y-3 border-t border-neutral-200 pt-4">
                                  {group.appointments.map((item) => (
                                    <div
                                      key={item.id}
                                      className="flex gap-3 text-sm"
                                    >
                                      <span className="w-20 shrink-0 font-semibold text-black">
                                        {formatTime(item.startTime)}
                                      </span>

                                      <div className="min-w-0">
                                        <p className="text-black">
                                          {item.appointmentServices
                                            .map(
                                              (entry) => entry.service.nameEs,
                                            )
                                            .join(", ")}
                                        </p>

                                        <p className="text-neutral-500">
                                          {item.employee.name} ·{" "}
                                          {getStatusLabel(item.status)}
                                        </p>
                                      </div>
                                    </div>
                                  ))}
                                </div>

                                {/* Reservation actions */}
                                <div className="mt-4 flex flex-col gap-2 border-t border-neutral-200 pt-4 sm:flex-row sm:flex-wrap">
                                  {appointmentsForDate.some(
                                    (item) =>
                                      item.bookingId === group.bookingId &&
                                      item.status === "BOOKED",
                                  ) &&
                                    group.appointments.some(
                                      (item) =>
                                        item.id ===
                                        visibleAppointments.find(
                                          (visible) =>
                                            visible.bookingId ===
                                            group.bookingId,
                                        )?.id,
                                    ) && (
                                      <button
                                        type="button"
                                        disabled={checkingInBookingId !== null}
                                        onClick={() =>
                                          void checkInBooking(group.bookingId!)
                                        }
                                        className="inline-flex min-h-11 items-center justify-center rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                                      >
                                        {checkingInBookingId === group.bookingId
                                          ? "Registrando llegada..."
                                          : "Cliente Llegó"}
                                      </button>
                                    )}

                                  <button
                                    type="button"
                                    onClick={() => {
                                      const key = `${group.appointments[0].employeeId}-${group.key}`;

                                      setExpandedBookingGroups((current) =>
                                        current.includes(key)
                                          ? current.filter(
                                              (item) => item !== key,
                                            )
                                          : [...current, key],
                                      );
                                    }}
                                    aria-expanded={expandedBookingGroups.includes(
                                      `${group.appointments[0].employeeId}-${group.key}`,
                                    )}
                                    className="inline-flex min-h-11 items-center justify-center rounded-xl border border-neutral-300 bg-white px-5 py-2.5 text-sm font-semibold text-black hover:bg-neutral-50"
                                  >
                                    {expandedBookingGroups.includes(
                                      `${group.appointments[0].employeeId}-${group.key}`,
                                    )
                                      ? "Ocultar gestión −"
                                      : "Gestionar servicios +"}
                                  </button>
                                </div>
                              </div>
                            )}
                          {/* Single appointments stay visible; multi-service controls expand on demand. */}
                          {(group.appointments.length === 1 ||
                            expandedBookingGroups.includes(
                              `${group.appointments[0].employeeId}-${group.key}`,
                            )) && (
                            <div className="space-y-3">
                              {group.appointments.map((appointment) => (
                                <div
                                  key={appointment.id}
                                  className={`rounded-xl p-5 shadow-sm ${
                                    appointment.bookingId !== null &&
                                    getBookingAppointmentCount(
                                      appointment.bookingId,
                                    ) > 1
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
                                      {appointment.bookingId !== null &&
                                        getBookingAppointmentCount(
                                          appointment.bookingId,
                                        ) > 1 && (
                                          <div className="mt-3 flex flex-wrap items-center gap-2">
                                            <span className="rounded-full bg-rose-50 px-3 py-1 text-xs font-bold text-rose-900">
                                              Servicio{" "}
                                              {getBookingAppointmentPosition(
                                                appointment.id,
                                                appointment.bookingId,
                                              )}{" "}
                                              de{" "}
                                              {getBookingAppointmentCount(
                                                appointment.bookingId,
                                              )}
                                            </span>

                                            <span className="text-xs font-semibold text-neutral-500">
                                              Misma Reserva #
                                              {appointment.bookingId}
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
                                      <strong>Duración:</strong>{" "}
                                      {appointment.duration} min
                                    </p>
                                  </div>

                                  {/* Appointment services and checkout summary */}
                                  <AppointmentServicesSummary
                                    status={appointment.status}
                                    bookedServices={appointment.appointmentServices}
                                    bookedAddons={appointment.appointmentAddons}
                                    hasLinkedSale={appointment.saleAppointments.length > 0}
                                    finalizedItems={getCompletedAppointmentItems(appointment.id)}
                                  />

                                  {(userRole === "OWNER" ||
                                    (userRole === "RECEPTIONIST" &&
                                      [
                                        "REQUESTED",
                                        "BOOKED",
                                        "CHECKED_IN",
                                      ].includes(appointment.status))) && (
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
                                        disabled={
                                          reassigningAppointmentId ===
                                          appointment.id
                                        }
                                        onChange={(event) => {
                                          const newEmployeeId = Number(
                                            event.target.value,
                                          );

                                          if (
                                            newEmployeeId !==
                                            appointment.employeeId
                                          ) {
                                            reassignEmployee(
                                              appointment.id,
                                              newEmployeeId,
                                            );
                                          }
                                        }}
                                        className="mt-2 rounded-xl border border-neutral-300 bg-white px-4 py-3 text-sm text-black"
                                      >
                                        {employees.map((employee) => (
                                          <option
                                            key={employee.id}
                                            value={employee.id}
                                          >
                                            {employee.name}
                                          </option>
                                        ))}
                                      </select>
                                      {reassigningAppointmentId ===
                                        appointment.id && (
                                        <p className="mt-2 text-sm text-neutral-500">
                                          Cambiando Técnica...
                                        </p>
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
                                          disabled={
                                            reschedulingAppointmentId ===
                                            appointment.id
                                          }
                                          onChange={(event) => {
                                            const newStartTime =
                                              event.target.value;

                                            if (
                                              newStartTime !==
                                              appointment.startTime
                                            ) {
                                              rescheduleAppointment(
                                                appointment.id,
                                                appointment.date.slice(0, 10),
                                                newStartTime,
                                              );
                                            }
                                          }}
                                          className="mt-2 min-h-11 w-full max-w-sm rounded-xl border border-neutral-300 bg-white px-4 py-3 text-sm text-black"
                                        >
                                          {Array.from(
                                            new Set([
                                              ...staffTimeOptions,
                                              appointment.startTime,
                                            ]),
                                          )
                                            .sort((a, b) => a.localeCompare(b))
                                            .map((time) => (
                                              <option key={time} value={time}>
                                                {formatTime(time)}
                                              </option>
                                            ))}
                                        </select>

                                        <details className="mt-3 max-w-sm rounded-xl border border-neutral-200 bg-neutral-50 p-3">
                                          <summary className="cursor-pointer text-sm font-semibold text-[#B76E79]">
                                            Hora personalizada
                                          </summary>

                                          <div className="mt-3 space-y-3">
                                            <p className="text-xs text-neutral-600">
                                              Selecciona una hora exacta,
                                              incluso fuera del horario
                                              habitual.
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
                                              defaultValue={appointment.startTime.slice(
                                                0,
                                                5,
                                              )}
                                              disabled={
                                                reschedulingAppointmentId ===
                                                appointment.id
                                              }
                                              className="min-h-12 w-full rounded-xl border border-neutral-300 bg-white px-4 py-3 text-base text-black"
                                            />

                                            <button
                                              type="button"
                                              disabled={
                                                reschedulingAppointmentId ===
                                                appointment.id
                                              }
                                              onClick={() => {
                                                const input =
                                                  document.getElementById(
                                                    `custom-time-${appointment.id}`,
                                                  ) as HTMLInputElement | null;

                                                if (!input?.value) {
                                                  alert(
                                                    "Selecciona una hora válida.",
                                                  );
                                                  return;
                                                }

                                                if (
                                                  input.value ===
                                                  appointment.startTime.slice(
                                                    0,
                                                    5,
                                                  )
                                                ) {
                                                  return;
                                                }

                                                void rescheduleAppointment(
                                                  appointment.id,
                                                  appointment.date.slice(0, 10),
                                                  input.value,
                                                );
                                              }}
                                              className="min-h-12 w-full rounded-xl bg-[#B76E79] px-4 py-3 text-sm font-semibold text-white hover:bg-[#a55e69] disabled:opacity-50"
                                            >
                                              Guardar hora personalizada
                                            </button>
                                          </div>
                                        </details>

                                        {reschedulingAppointmentId ===
                                          appointment.id && (
                                          <p className="mt-2 text-sm text-neutral-500">
                                            Cambiando horario...
                                          </p>
                                        )}
                                      </div>
                                    </details>
                                  )}

                                  {appointment.status === "REQUESTED" && (
                                    <div className="mt-5">
                                      <button
                                        onClick={() =>
                                          updateAppointmentStatus(
                                            appointment.id,
                                            "BOOKED",
                                          )
                                        }
                                        className="rounded-xl bg-black px-4 py-3 text-sm font-semibold text-white"
                                      >
                                        Confirmar Cita
                                      </button>
                                    </div>
                                  )}

                                  {appointment.status === "BOOKED" && (
                                    <div className="mt-5 flex flex-wrap gap-3">
                                      {(appointment.bookingId === null ||
                                        getBookingAppointmentCount(
                                          appointment.bookingId,
                                        ) === 1) && (
                                        <button
                                          onClick={() =>
                                            updateAppointmentStatus(
                                              appointment.id,
                                              "CHECKED_IN",
                                            )
                                          }
                                          className="rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white hover:bg-blue-700"
                                        >
                                          Cliente Llegó
                                        </button>
                                      )}

                                      {canMarkNoShow(
                                        appointment.date,
                                        appointment.startTime,
                                      ) && (
                                        <button
                                          onClick={() => {
                                            const confirmed = window.confirm(
                                              "¿Marcar esta cita como No Asistió?",
                                            );

                                            if (confirmed) {
                                              updateAppointmentStatus(
                                                appointment.id,
                                                "NO_SHOW",
                                              );
                                            }
                                          }}
                                          className="rounded-xl border border-neutral-300 bg-white px-4 py-3 text-sm font-semibold text-black"
                                        >
                                          No Asistió
                                        </button>
                                      )}

                                      <button
                                        onClick={() => {
                                          const confirmed = window.confirm(
                                            "¿Seguro que deseas cancelar esta cita?",
                                          );

                                          if (confirmed) {
                                            updateAppointmentStatus(
                                              appointment.id,
                                              "CANCELLED",
                                            );
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
                                      onClick={() =>
                                        updateAppointmentStatus(
                                          appointment.id,
                                          "IN_PROGRESS",
                                        )
                                      }
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
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </section>
                );
              },
            );

            if (groupCount === 0) return null;

            if (!completedSection) {
              return (
                <div key="active" className="space-y-4">
                  {sections}
                </div>
              );
            }

            return (
              <details
                key={`completed-${selectedDate}`}
                className="rounded-2xl border border-neutral-200 bg-neutral-50 p-4 sm:p-5"
              >
                <summary className="cursor-pointer text-xl font-bold text-black">
                  Citas completadas
                </summary>
                <div className="mt-4 space-y-4">{sections}</div>
              </details>
            );
          })}

          {/* Finalized sales for the selected appointment date */}
          <FinalizedSalesSection
            sales={classifiedFinalizedSales}
            isLoading={isLoading}
            loadError={loadError}
          />
        </div>
      </div>
    </main>
  );
}
