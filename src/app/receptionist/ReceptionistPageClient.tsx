"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { getTeffToday, hasTeffAppointmentStarted } from "@/lib/datetime";
import {
  countReceptionBookings,
  groupReceptionBookings,
} from "@/lib/receptionist/group-bookings";

type Appointment = {
  id: number;
  bookingId: number | null;
  employeeId: number;
  date: string;
  startTime: string;
  duration: number;
  status: string;
  notes: string | null;
  createdAt: string;

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
};

type WeeklyTechnicianSummary = {
  id: number;
  name: string;
  sales: number;
  customers: number;
};

type ReceptionistPageClientProps = {
  todaysSalesTotal: number;

  weeklySalesTotal: number;
  weeklySalesGoal: number;
  weeklyGoalProgress: number;
  weeklyTechnicianSummary: WeeklyTechnicianSummary[];

  monthlySalesTotal: number;
  monthlySalesGoal: number;
  monthlyGoalProgress: number;
  monthlyTechnicianSummary: WeeklyTechnicianSummary[];
};

type Employee = {
  id: number;
  name: string;
  active: boolean;
};

type ScheduleBlock = {
  id: number;
  employeeId: number;
  date: string;
  startTime: string;
  endTime: string;
  reason: string | null;

  employee: {
    id: number;
    name: string;
  };
};

function getStatusLabel(status: string) {
  switch (status) {
    case "BOOKED":
      return "Reservada";
    case "REQUESTED":
      return "Pendiente";
    case "CHECKED_IN":
      return "Cliente llegó";
    case "IN_PROGRESS":
      return "En servicio";
    case "COMPLETED":
      return "Completada";
    case "CANCELLED":
      return "Cancelada";
    case "NO_SHOW":
      return "No asistió";
    default:
      return status;
  }
}

function getStatusClasses(status: string) {
  switch (status) {
    case "BOOKED":
      return "bg-neutral-100 text-neutral-700";

    case "REQUESTED":
      return "bg-yellow-100 text-yellow-800";

    case "CHECKED_IN":
      return "bg-blue-100 text-blue-800";

    case "IN_PROGRESS":
      return "bg-purple-100 text-purple-800";

    case "COMPLETED":
      return "bg-green-100 text-green-800";

    case "CANCELLED":
    case "NO_SHOW":
      return "bg-red-100 text-red-800";

    default:
      return "bg-neutral-100 text-neutral-700";
  }
}

function formatTime(time: string) {
  const [hours, minutes] = time.split(":").map(Number);

  const period = hours >= 12 ? "PM" : "AM";
  const displayHour = hours % 12 || 12;

  return `${displayHour}:${minutes.toString().padStart(2, "0")} ${period}`;
}

function formatCOP(value: number) {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(value);
}

// Convert the VAPID public key into the format required by PushManager.
function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);

  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");

  const rawData = window.atob(base64);

  return Uint8Array.from(
    [...rawData].map((character) => character.charCodeAt(0)),
  );
}

type BookingNotification = {
  bookingId: number;
  customerName: string;
  date: string;
  createdAt: string;
  startTime: string | null;
  serviceNames: string[];
  isRead: boolean;
  readAt: string | null;
};

export default function ReceptionistPageClient({
  todaysSalesTotal,
  weeklySalesTotal,
  weeklySalesGoal,
  weeklyGoalProgress,
  weeklyTechnicianSummary,
  monthlySalesTotal,
  monthlySalesGoal,
  monthlyGoalProgress,
  monthlyTechnicianSummary,
}: ReceptionistPageClientProps) {
  const today = getTeffToday();

  const [activeTab, setActiveTab] = useState<
    "resumen" | "agenda" | "rendimiento"
  >("resumen");

  // Unread online reservations for the authenticated staff member.
  const [unreadBookingCount, setUnreadBookingCount] = useState<number | null>(
    null,
  );

  const [isClearingNotifications, setIsClearingNotifications] = useState(false);

  const [bookingNotifications, setBookingNotifications] = useState<
    BookingNotification[]
  >([]);

  // Pagination for unread online reservations.
  const [nextNotificationCursor, setNextNotificationCursor] = useState<
    string | null
  >(null);

  const [isLoadingMoreNotifications, setIsLoadingMoreNotifications] =
    useState(false);

  const [loadMoreNotificationsError, setLoadMoreNotificationsError] =
    useState("");

  const [reviewingBookingId, setReviewingBookingId] = useState<number | null>(
    null,
  );

  const [notificationActionError, setNotificationActionError] = useState("");

  // Prevent stale notification responses from overwriting newer data.
  const notificationGenerationRef = useRef(0);

  const notificationRefreshControllerRef = useRef<AbortController | null>(null);

  const notificationPageControllerRef = useRef<AbortController | null>(null);

  // Reception opens on today, but staff can review previous appointment dates.
  const [selectedAppointmentDate, setSelectedAppointmentDate] = useState(today);

  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [employees, setEmployees] = useState<Employee[]>([]);
  // Web Push support for the salon iPad and other staff devices
  const [pushSupported, setPushSupported] = useState(false);

  const [notificationPermission, setNotificationPermission] =
    useState<NotificationPermission>("default");

  const [serviceWorkerReady, setServiceWorkerReady] = useState(false);

  const [isEnablingPush, setIsEnablingPush] = useState(false);

  const [pushEnabled, setPushEnabled] = useState(false);

  const [pushError, setPushError] = useState("");

  const [reassigningAppointmentId, setReassigningAppointmentId] = useState<
    number | null
  >(null);

  const [reschedulingAppointmentId, setReschedulingAppointmentId] = useState<
    number | null
  >(null);

  const [scheduleBlocks, setScheduleBlocks] = useState<ScheduleBlock[]>([]);

  const [blockEmployeeId, setBlockEmployeeId] = useState<number>(0);

  const [blockDate, setBlockDate] = useState(today);

  const [blockStartTime, setBlockStartTime] = useState("09:30");

  const [blockEndTime, setBlockEndTime] = useState("10:30");

  const [blockReason, setBlockReason] = useState("");

  const [isSavingBlock, setIsSavingBlock] = useState(false);

  const [blockError, setBlockError] = useState("");

  // Keep the schedule-blocking form collapsed until needed.
  const [showBlockForm, setShowBlockForm] = useState(false);

  // Expand individual bookings, not all bookings for one customer.
  const [expandedBookingKeys, setExpandedBookingKeys] = useState<string[]>([]);

  // Load the current appointment data for Reception.
  async function loadAppointments() {
    try {
      const response = await fetch("/api/appointments");

      if (response.status === 401) {
        return;
      }

      if (!response.ok) {
        throw new Error("No se pudieron cargar las citas");
      }

      const data: Appointment[] = await response.json();

      setAppointments(data);
      setLoadError(false);
    } catch (error) {
      console.error(error);
      setLoadError(true);
    } finally {
      setIsLoading(false);
    }
  }

  async function loadScheduleBlocks() {
    try {
      const response = await fetch("/api/schedule-blocks");

      if (!response.ok) {
        throw new Error("No se pudieron cargar los bloqueos");
      }

      const data: ScheduleBlock[] = await response.json();

      setScheduleBlocks(data);
    } catch (error) {
      console.error(error);
    }
  }

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

  // Register TEFF's service worker and detect Web Push support
  // Permission is NOT requested here; staff must explicitly enable it
  useEffect(() => {
    const supportsPush =
      "serviceWorker" in navigator &&
      "PushManager" in window &&
      "Notification" in window;

    if (!supportsPush) {
      return;
    }

    async function registerServiceWorker() {
      try {
        await navigator.serviceWorker.register("/sw.js");

        const registration = await navigator.serviceWorker.ready;

        setPushSupported(true);
        setNotificationPermission(Notification.permission);

        setServiceWorkerReady(true);

        const existingSubscription =
          await registration.pushManager.getSubscription();

        setPushEnabled(
          existingSubscription !== null &&
            Notification.permission === "granted",
        );
      } catch (error) {
        console.error("Failed to register TEFF service worker:", error);
        setPushSupported(true);
        setNotificationPermission(Notification.permission);
        setServiceWorkerReady(false);
      }
    }

    registerServiceWorker();
  }, []);

  // Load reception data asynchronously after the effect starts.
  // Preserve the existing refresh functions and error handling.
  useEffect(() => {
    let active = true;

    void Promise.resolve().then(() => {
      if (!active) return;

      void loadAppointments();
      void loadEmployees();
      void loadScheduleBlocks();
    });

    return () => {
      active = false;
    };
  }, []);

  // Fetch the current staff member's unread reservations.
  const refreshBookingNotifications = useCallback(async () => {
    const generation = ++notificationGenerationRef.current;

    // Cancel previous refresh and pagination requests.
    notificationRefreshControllerRef.current?.abort();
    notificationPageControllerRef.current?.abort();

    const controller = new AbortController();
    notificationRefreshControllerRef.current = controller;

    try {
      const response = await fetch("/api/booking-notifications", {
        signal: controller.signal,
        cache: "no-store",
      });

      if (!response.ok) {
        throw new Error("No se pudieron cargar las notificaciones");
      }

      const data: unknown = await response.json();

      if (
        typeof data !== "object" ||
        data === null ||
        !("unreadCount" in data) ||
        !Number.isSafeInteger(data.unreadCount) ||
        (data.unreadCount as number) < 0 ||
        !("notifications" in data) ||
        !Array.isArray(data.notifications) ||
        !("nextCursor" in data) ||
        !(data.nextCursor === null || typeof data.nextCursor === "string")
      ) {
        throw new Error("Respuesta de notificaciones inválida");
      }

      // Only the latest request may update the dashboard.
      if (
        controller.signal.aborted ||
        generation !== notificationGenerationRef.current
      ) {
        return;
      }

      setUnreadBookingCount(data.unreadCount as number);
      setBookingNotifications(data.notifications as BookingNotification[]);
      setNextNotificationCursor(data.nextCursor);
      setLoadMoreNotificationsError("");
    } catch (error) {
      if (!controller.signal.aborted) {
        console.error("Error al actualizar notificaciones:", error);
      }
    } finally {
      if (notificationRefreshControllerRef.current === controller) {
        notificationRefreshControllerRef.current = null;
      }
    }
  }, []);

  // Cancel notification requests when leaving the dashboard.
  const cancelNotificationRequests = useCallback(() => {
    notificationGenerationRef.current += 1;
    notificationRefreshControllerRef.current?.abort();
    notificationPageControllerRef.current?.abort();
  }, []);

  // Refresh on first load and when returning to TEFF.
  useEffect(() => {
    let active = true;

    function handleFocus() {
      void refreshBookingNotifications();
    }

    function handleVisibilityChange() {
      if (document.visibilityState === "visible") {
        void refreshBookingNotifications();
      }
    }

    // Defer initial loading to avoid synchronous
    // state updates during effect initialization.
    void Promise.resolve().then(() => {
      if (active) {
        void refreshBookingNotifications();
      }
    });

    window.addEventListener("focus", handleFocus);

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      active = false;

      cancelNotificationRequests();

      window.removeEventListener("focus", handleFocus);

      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [refreshBookingNotifications, cancelNotificationRequests]);

  async function createScheduleBlock() {
    setBlockError("");

    if (blockEmployeeId <= 0) {
      setBlockError("Selecciona una técnica.");
      return;
    }

    if (!blockDate) {
      setBlockError("Selecciona una fecha.");
      return;
    }

    if (blockStartTime >= blockEndTime) {
      setBlockError("La hora final debe ser posterior a la hora inicial.");
      return;
    }

    try {
      setIsSavingBlock(true);

      const response = await fetch("/api/schedule-blocks", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          employeeId: blockEmployeeId,
          date: blockDate,
          startTime: blockStartTime,
          endTime: blockEndTime,
          reason: blockReason,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "No se pudo bloquear el horario");
      }

      setBlockReason("");
      setBlockError("");

      await loadScheduleBlocks();
    } catch (error) {
      setBlockError(
        error instanceof Error
          ? error.message
          : "No se pudo bloquear el horario",
      );
    } finally {
      setIsSavingBlock(false);
    }
  }

  async function deleteScheduleBlock(blockId: number) {
    const confirmed = window.confirm("¿Eliminar este bloqueo de horario?");

    if (!confirmed) {
      return;
    }

    try {
      const response = await fetch(`/api/schedule-blocks/${blockId}`, {
        method: "DELETE",
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "No se pudo eliminar el bloqueo");
      }

      await loadScheduleBlocks();
    } catch (error) {
      alert(
        error instanceof Error
          ? error.message
          : "No se pudo eliminar el bloqueo",
      );
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

      // Reception may intentionally override another appointment overlap.
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

      // Reload so reception immediately sees the new technician.
      await loadAppointments();
    } catch (error) {
      console.error(error);
      alert("No se pudo cambiar la técnica");
    } finally {
      setReassigningAppointmentId(null);
    }
  }

  // Update the operational status of an appointment.
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

      const data = await response.json();

      if (!response.ok) {
        alert(data.error || "No se pudo actualizar la cita");
        return;
      }

      // Reload so KPIs and appointment cards stay synchronized.
      await loadAppointments();
    } catch (error) {
      console.error(error);
      alert("No se pudo actualizar la cita");
    }
  }

  // Delete an appointment after explicit confirmation.
  async function deleteAppointment(appointmentId: number, status: string) {
    const message =
      status === "IN_PROGRESS"
        ? "Esta cita está actualmente En servicio.\n\n¿Seguro que deseas eliminarla? Esta acción no se puede deshacer."
        : "¿Seguro que deseas eliminar esta cita? Esta acción no se puede deshacer.";

    const confirmed = window.confirm(message);

    if (!confirmed) {
      return;
    }

    try {
      const response = await fetch(`/api/appointments/${appointmentId}`, {
        method: "DELETE",
      });

      const data = await response.json();

      if (!response.ok) {
        if (response.status === 409) {
          alert(
            "Esta cita ya está asociada a una venta y no se puede eliminar.",
          );
          return;
        }

        alert(data.error || "No se pudo eliminar la cita");
        return;
      }

      // Reload appointments and dashboard information after deletion.
      await loadAppointments();
    } catch (error) {
      console.error(error);
      alert("No se pudo eliminar la cita");
    }
  }

  // Change the date/time of one appointment block.
  // Appointment overlaps can be intentionally overridden after confirmation.
  async function rescheduleAppointment(
    appointmentId: number,
    date: string,
    startTime: string,
  ) {
    try {
      setReschedulingAppointmentId(appointmentId);

      async function sendRescheduleRequest(overrideOverlap = false) {
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
            }),
          },
        );

        const data = await response.json();

        return {
          response,
          data,
        };
      }

      // First attempt always respects normal overlap protection.
      let { response, data } = await sendRescheduleRequest();

      // If another appointment causes the conflict, staff may override it.
      if (response.status === 409 && data.conflictType === "APPOINTMENT") {
        const confirmed = window.confirm(
          "Este horario se superpone con otra cita.\n\n¿Deseas guardar la cita de todas formas?",
        );

        if (!confirmed) {
          return;
        }

        // Retry only after explicit confirmation.
        ({ response, data } = await sendRescheduleRequest(true));
      }

      if (!response.ok) {
        if (response.status === 409 && data.conflictType === "SCHEDULE_BLOCK") {
          alert("La técnica tiene un bloqueo de horario durante este período.");
          return;
        }

        alert(data.error || "No se pudo cambiar el horario");
        return;
      }

      // Reload so reception immediately sees the updated schedule.
      await loadAppointments();
    } catch (error) {
      console.error(error);
      alert("No se pudo cambiar el horario");
    } finally {
      setReschedulingAppointmentId(null);
    }
  }

  const todaysAppointments = appointments
    .filter((appointment) => appointment.date.slice(0, 10) === today)
    .sort((a, b) => a.startTime.localeCompare(b.startTime));

  // Appointment list can display today or a previous date independently
  // from the dashboard's "today" KPI cards.
  const selectedDateAppointments = appointments
    .filter(
      (appointment) =>
        appointment.date.slice(0, 10) === selectedAppointmentDate,
    )
    .sort((a, b) => a.startTime.localeCompare(b.startTime));

  // Count bookings separately from their scheduled service blocks.
  // Legacy appointments without bookingId remain independent.
  const selectedDateBookingCount = countReceptionBookings(
    selectedDateAppointments,
  );

  const selectedDateServiceCount = selectedDateAppointments.reduce(
    (total, appointment) => total + appointment.appointmentServices.length,
    0,
  );

  // Group appointments by booking while preserving individual
  // service blocks and their scheduling controls.
  const groupedCustomerAppointments = groupReceptionBookings(
    selectedDateAppointments,
  );

  // Count active customer bookings rather than service blocks.
  const todaysAppointmentCount = countReceptionBookings(
    todaysAppointments.filter(
      (appointment) => !["CANCELLED", "NO_SHOW"].includes(appointment.status),
    ),
  );

  const todaysCompletedCustomers = new Set(
    todaysAppointments
      .filter((appointment) => appointment.status === "COMPLETED")
      .map((appointment) => appointment.customer.id),
  ).size;

  const todaysInService = todaysAppointments.filter(
    (appointment) => appointment.status === "IN_PROGRESS",
  ).length;

  async function enablePushNotifications() {
    setPushError("");

    if (!pushSupported || !serviceWorkerReady) {
      setPushError(
        "Las notificaciones todavía no están disponibles en este dispositivo.",
      );
      return;
    }

    const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

    if (!publicKey) {
      setPushError("La configuración de notificaciones no está disponible.");
      return;
    }

    try {
      setIsEnablingPush(true);

      // iPadOS requires this permission request to happen
      // directly after a user action.
      const permission = await Notification.requestPermission();

      setNotificationPermission(permission);

      if (permission !== "granted") {
        setPushError("No se otorgó permiso para mostrar notificaciones.");
        return;
      }

      const registration = await navigator.serviceWorker.ready;

      // Reuse the device's existing subscription when possible.
      let subscription = await registration.pushManager.getSubscription();

      if (!subscription) {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey),
        });
      }

      const response = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(subscription.toJSON()),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "No se pudo guardar la suscripción.");
      }

      setPushEnabled(true);
      setPushError("");
    } catch (error) {
      console.error("Failed to enable TEFF push notifications:", error);

      setPushError(
        error instanceof Error
          ? error.message
          : "No se pudieron activar las notificaciones.",
      );
    } finally {
      setIsEnablingPush(false);
    }
  }

  // Recent customer bookings, grouped by booking ID.
  // Exclude legacy standalone appointments.
  const recentBookings = groupReceptionBookings(
    appointments.filter((appointment) => appointment.bookingId !== null),
  )
    .map((group) => {
      const createdAt = Math.min(
        ...group.appointments.map((appointment) =>
          new Date(appointment.createdAt).getTime(),
        ),
      );

      const firstAppointment = [...group.appointments].sort((a, b) =>
        a.startTime.localeCompare(b.startTime),
      )[0];

      const serviceNames = [
        ...new Set(
          group.appointments.flatMap((appointment) =>
            appointment.appointmentServices.map((item) => item.service.nameEs),
          ),
        ),
      ];

      return {
        ...group,
        createdAt,
        date: firstAppointment.date.slice(0, 10),
        startTime: firstAppointment.startTime,
        serviceNames,
      };
    })
    .filter((group) => Number.isFinite(group.createdAt))
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, 5);

  async function loadMoreBookingNotifications() {
    if (
      !nextNotificationCursor ||
      isLoadingMoreNotifications ||
      reviewingBookingId !== null ||
      notificationPageControllerRef.current !== null
    ) {
      return;
    }

    const generation = notificationGenerationRef.current;
    const cursor = nextNotificationCursor;
    const controller = new AbortController();

    notificationPageControllerRef.current = controller;

    setIsLoadingMoreNotifications(true);
    setLoadMoreNotificationsError("");

    try {
      const response = await fetch(
        `/api/booking-notifications?cursor=${encodeURIComponent(cursor)}`,
        {
          signal: controller.signal,
          cache: "no-store",
        },
      );

      if (!response.ok) {
        throw new Error("Unable to load more notifications");
      }

      const data: unknown = await response.json();

      if (
        typeof data !== "object" ||
        data === null ||
        !("notifications" in data) ||
        !Array.isArray(data.notifications) ||
        !("nextCursor" in data) ||
        !(data.nextCursor === null || typeof data.nextCursor === "string") ||
        !("unreadCount" in data) ||
        !Number.isSafeInteger(data.unreadCount) ||
        (data.unreadCount as number) < 0
      ) {
        throw new Error("Invalid notification response");
      }

      // Ignore requests cancelled by a newer refresh.
      if (
        controller.signal.aborted ||
        generation !== notificationGenerationRef.current
      ) {
        return;
      }

      const additionalNotifications =
        data.notifications as BookingNotification[];

      // Append without duplicating existing bookings.
      setBookingNotifications((current) => {
        const existingIds = new Set(current.map((item) => item.bookingId));

        return [
          ...current,
          ...additionalNotifications.filter(
            (item) => !existingIds.has(item.bookingId),
          ),
        ];
      });

      setNextNotificationCursor(data.nextCursor);
      setUnreadBookingCount(data.unreadCount as number);
    } catch (error) {
      if (!controller.signal.aborted) {
        console.error(error);

        setLoadMoreNotificationsError(
          "No se pudieron cargar más reservas. Intenta nuevamente.",
        );
      }
    } finally {
      if (notificationPageControllerRef.current === controller) {
        notificationPageControllerRef.current = null;
        setIsLoadingMoreNotifications(false);
      }
    }
  }

  async function dismissBookingNotifications(bookingId?: number) {
    if (reviewingBookingId !== null || isClearingNotifications) {
      return;
    }

    setIsClearingNotifications(true);
    setNotificationActionError("");

    try {
      const response = await fetch("/api/booking-notifications", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(
          bookingId === undefined ? { clearAll: true } : { bookingId },
        ),
      });

      if (!response.ok) {
        throw new Error("No se pudieron limpiar las notificaciones.");
      }

      await refreshBookingNotifications();
    } catch (error) {
      console.error(error);
      setNotificationActionError(
        "No se pudieron limpiar las notificaciones. Intenta nuevamente.",
      );
    } finally {
      setIsClearingNotifications(false);
    }
  }

  async function reviewBookingNotification(notification: BookingNotification) {
    if (reviewingBookingId !== null) return;

    const bookingExists = appointments.some(
      (appointment) => appointment.bookingId === notification.bookingId,
    );

    if (!bookingExists) {
      setNotificationActionError(
        "Esta reserva no está disponible en la agenda.",
      );
      return;
    }

    setReviewingBookingId(notification.bookingId);
    setNotificationActionError("");

    try {
      const response = await fetch("/api/booking-notifications", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          bookingId: notification.bookingId,
        }),
      });

      if (!response.ok) {
        throw new Error("No se pudo marcar la reserva como leída.");
      }

      // Update the local notification display only
      // after the server confirms the read receipt.
      setBookingNotifications((current) =>
        current.map((item) =>
          item.bookingId === notification.bookingId
            ? { ...item, isRead: true }
            : item,
        ),
      );

      // Retrieve the authoritative unread count from Neon.
      // Also refresh the notification list and pagination cursor.
      await refreshBookingNotifications();

      // Open the existing booking in Agenda.
      setSelectedAppointmentDate(notification.date);

      const bookingKey = `booking-${notification.bookingId}`;

      setExpandedBookingKeys((current) =>
        current.includes(bookingKey) ? current : [...current, bookingKey],
      );

      setActiveTab("agenda");
    } catch (error) {
      console.error(error);

      setNotificationActionError(
        "No se pudo revisar la reserva. Intenta nuevamente.",
      );
    } finally {
      setReviewingBookingId(null);
    }
  }

  if (isLoading) {
    return (
      <div className="mt-8 rounded-xl bg-white p-5 shadow-sm">
        <p className="font-semibold text-black">Cargando citas...</p>

        <p className="mt-1 text-sm text-neutral-500">
          Estamos actualizando la información de recepción.
        </p>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="mt-8 rounded-xl bg-white p-5 shadow-sm">
        <p className="font-semibold text-red-700">
          No se pudieron cargar las citas.
        </p>

        <p className="mt-1 text-sm text-neutral-500">
          Verifica la conexión e intenta nuevamente.
        </p>

        <button
          type="button"
          onClick={() => {
            setIsLoading(true);
            void loadAppointments();
          }}
          className="mt-4 rounded-lg bg-black px-4 py-3 text-sm font-semibold text-white"
        >
          Reintentar
        </button>
      </div>
    );
  }

  function getReceptionTimeOptions() {
    const options: string[] = [];

    // Covers TEFF's appointment start-time window.
    for (let minutes = 9 * 60 + 30; minutes <= 18 * 60; minutes += 30) {
      const hours = Math.floor(minutes / 60);
      const mins = minutes % 60;

      options.push(
        `${hours.toString().padStart(2, "0")}:${mins
          .toString()
          .padStart(2, "0")}`,
      );
    }

    return options;
  }

  const receptionTimeOptions = getReceptionTimeOptions();

  // A client can only be marked as a no-show after the appointment starts.
  function canMarkNoShow(date: string, startTime: string) {
    return hasTeffAppointmentStarted(date, startTime);
  }

  return (
    <div className="mt-8">
      {/* Receptionist dashboard navigation */}
      <div
        role="tablist"
        aria-label="Secciones de recepción"
        className="grid grid-cols-3 gap-2 rounded-xl bg-white p-2 shadow-sm"
      >
        {(
          [
            ["resumen", "Resumen"],
            ["agenda", "Agenda"],
            ["rendimiento", "Rendimiento"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            role="tab"
            id={`tab-${value}`}
            aria-selected={activeTab === value}
            aria-controls={`panel-${value}`}
            onClick={() => setActiveTab(value)}
            className={`rounded-lg px-2 py-3 text-sm font-semibold transition-colors sm:text-base ${
              activeTab === value
                ? "bg-[#B76E79] text-white"
                : "text-neutral-600 hover:bg-neutral-100"
            }`}
          >
            <span className="flex items-center justify-center gap-2">
              {label}

              {value === "resumen" &&
                unreadBookingCount !== null &&
                unreadBookingCount > 0 && (
                  <span className="rounded-full bg-red-600 px-2 py-0.5 text-xs font-bold text-white">
                    {unreadBookingCount > 99 ? "99+" : unreadBookingCount}
                  </span>
                )}
            </span>
          </button>
        ))}
      </div>

      {activeTab === "resumen" && (
        <section
          id="panel-resumen"
          role="tabpanel"
          aria-labelledby="tab-resumen"
          className="mt-6"
        >
          {/* Web Push notification controls */}
          {pushSupported && (
            <div className="mb-6 rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-bold text-black">🔔 Notificaciones</p>

                  <p className="mt-1 text-sm text-neutral-600">
                    {pushEnabled
                      ? "Este dispositivo recibirá alertas de nuevas reservas."
                      : notificationPermission === "denied"
                        ? "Las notificaciones están bloqueadas en este dispositivo."
                        : "Activa las alertas de nuevas reservas en este dispositivo."}
                  </p>
                </div>

                {pushEnabled ? (
                  <span className="inline-flex rounded-lg bg-green-100 px-4 py-2 text-sm font-semibold text-green-800">
                    ✓ Activadas
                  </span>
                ) : (
                  notificationPermission !== "denied" && (
                    <button
                      type="button"
                      onClick={enablePushNotifications}
                      disabled={isEnablingPush || !serviceWorkerReady}
                      className="rounded-lg bg-black px-4 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {isEnablingPush
                        ? "Activando..."
                        : serviceWorkerReady
                          ? "Activar notificaciones"
                          : "Preparando..."}
                    </button>
                  )
                )}
              </div>

              {pushError && (
                <p className="mt-3 text-sm font-medium text-red-700">
                  {pushError}
                </p>
              )}
            </div>
          )}

          {/* Today's reception snapshot */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <div className="rounded-xl border border-neutral-200 bg-white p-3 shadow-sm sm:p-4">
              <p className="text-xs font-medium text-neutral-500 sm:text-sm">
                Citas de Hoy
              </p>

              <p className="mt-1 text-xl font-bold text-black sm:text-2xl">
                {todaysAppointmentCount}
              </p>
            </div>

            <div className="rounded-xl border border-neutral-200 bg-white p-3 shadow-sm sm:p-4">
              <p className="text-xs font-medium text-neutral-500 sm:text-sm">
                Clientes Atendidos
              </p>

              <p className="mt-1 text-xl font-bold text-black sm:text-2xl">
                {todaysCompletedCustomers}
              </p>
            </div>

            <div className="rounded-xl border border-neutral-200 bg-white p-3 shadow-sm sm:p-4">
              <p className="text-xs font-medium text-neutral-500 sm:text-sm">
                En Servicio
              </p>

              <p className="mt-1 text-xl font-bold text-black sm:text-2xl">
                {todaysInService}
              </p>
            </div>

            <div className="rounded-xl border border-neutral-200 bg-white p-3 shadow-sm sm:p-4">
              <p className="text-xs font-medium text-neutral-500 sm:text-sm">
                Ventas de Hoy
              </p>

              <p className="mt-1 text-xl font-bold text-black sm:text-2xl">
                {formatCOP(todaysSalesTotal)}
              </p>
            </div>
          </div>

          {notificationActionError && (
            <p
              role="alert"
              className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700"
            >
              {notificationActionError}
            </p>
          )}

          {/* Unread online reservations */}
          <div className="mt-6 rounded-xl border border-neutral-200 bg-white p-4 shadow-sm sm:p-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold text-black">
                🔔 Reservas sin leer
              </h2>

              <button
                type="button"
                onClick={() => void dismissBookingNotifications()}
                disabled={
                  isClearingNotifications ||
                  reviewingBookingId !== null ||
                  !unreadBookingCount
                }
                className="text-sm font-semibold text-[#B76E79] disabled:opacity-40"
              >
                Limpiar todas
              </button>

              <span className="rounded-full bg-rose-100 px-3 py-1 text-xs font-bold text-rose-700">
                {unreadBookingCount ?? 0} nuevas
              </span>
            </div>

            {bookingNotifications.filter((notification) => !notification.isRead)
              .length === 0 ? (
              <p className="rounded-lg bg-neutral-50 p-4 text-sm text-neutral-500">
                {unreadBookingCount === null
                  ? "Cargando notificaciones..."
                  : unreadBookingCount > 0
                    ? "Hay reservas sin leer fuera de las más recientes."
                    : "No tienes reservas pendientes por revisar."}
              </p>
            ) : (
              <div className="space-y-3">
                {bookingNotifications
                  .filter((notification) => !notification.isRead)
                  .map((notification) => (
                    <div
                      key={notification.bookingId}
                      className="rounded-lg border border-rose-200 bg-rose-50/40 p-3"
                    >
                      <p className="font-semibold text-black">
                        {notification.customerName}
                      </p>

                      <p className="mt-1 text-sm text-neutral-600">
                        {notification.serviceNames.slice(0, 2).join(", ")}
                      </p>

                      <p className="mt-1 text-xs text-neutral-500">
                        {notification.date}
                        {notification.startTime &&
                          ` · ${formatTime(notification.startTime)}`}
                      </p>

                      <button
                        type="button"
                        onClick={() =>
                          void reviewBookingNotification(notification)
                        }
                        disabled={reviewingBookingId !== null}
                        className="mt-3 rounded-lg bg-[#B76E79] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#A45E69] disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {reviewingBookingId === notification.bookingId
                          ? "Abriendo..."
                          : "Revisar reserva →"}
                      </button>

                      <button
                        type="button"
                        disabled={
                          isClearingNotifications || reviewingBookingId !== null
                        }
                        onClick={() =>
                          void dismissBookingNotifications(
                            notification.bookingId,
                          )
                        }
                        className="ml-2 rounded-lg border border-neutral-300 bg-white px-4 py-2 text-sm font-semibold text-neutral-700 hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Descartar
                      </button>
                    </div>
                  ))}
              </div>
            )}
            {nextNotificationCursor !== null && (
              <button
                type="button"
                onClick={() => void loadMoreBookingNotifications()}
                disabled={
                  isLoadingMoreNotifications || reviewingBookingId !== null
                }
                className="mt-4 w-full rounded-lg border border-neutral-300 bg-white px-4 py-3 text-sm font-semibold text-black transition-colors hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isLoadingMoreNotifications
                  ? "Cargando reservas..."
                  : "Cargar más reservas"}
              </button>
            )}

            {loadMoreNotificationsError && (
              <p role="alert" className="mt-3 text-sm text-red-700">
                {loadMoreNotificationsError}
              </p>
            )}
          </div>

          <div className="mt-6 rounded-xl border border-neutral-200 bg-white p-4 shadow-sm sm:p-5">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold text-black">
                  Reservas Recientes
                </h2>
                <p className="mt-1 text-sm text-neutral-500">
                  Últimas reservas registradas
                </p>
              </div>

              <span className="text-sm text-neutral-500">
                {recentBookings.length} reservas
              </span>
            </div>

            {recentBookings.length === 0 ? (
              <p className="rounded-lg bg-neutral-50 p-4 text-sm text-neutral-500">
                No hay reservas recientes para mostrar.
              </p>
            ) : (
              <div className="space-y-3">
                {recentBookings.map((booking) => (
                  <button
                    key={booking.groupKey}
                    type="button"
                    onClick={() => {
                      setSelectedAppointmentDate(booking.date);
                      setExpandedBookingKeys((current) =>
                        current.includes(booking.groupKey)
                          ? current
                          : [...current, booking.groupKey],
                      );
                      setActiveTab("agenda");
                    }}
                    className="flex w-full items-center justify-between gap-3 rounded-lg border border-neutral-200 p-3 text-left transition-colors hover:bg-neutral-50"
                  >
                    <div className="min-w-0">
                      <p className="font-semibold text-black">
                        {booking.customer.name}
                      </p>

                      <p className="mt-1 text-sm text-neutral-600">
                        {booking.serviceNames.slice(0, 2).join(", ")}
                        {booking.serviceNames.length > 2 &&
                          ` +${booking.serviceNames.length - 2} servicios más`}
                      </p>

                      <p className="mt-1 text-xs text-neutral-500">
                        {booking.date} · {formatTime(booking.startTime)}
                      </p>

                      <p className="mt-1 text-xs text-neutral-400">
                        Registrada:{" "}
                        {new Intl.DateTimeFormat("es-CO", {
                          day: "numeric",
                          month: "short",
                          hour: "numeric",
                          minute: "2-digit",
                          hour12: true,
                          timeZone: "America/Bogota",
                        }).format(new Date(booking.createdAt))}
                      </p>
                    </div>

                    <span className="shrink-0 text-sm font-semibold text-[#B76E79]">
                      Ver →
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </section>
      )}

      {activeTab === "agenda" && (
        <section id="panel-agenda" role="tabpanel" aria-labelledby="tab-agenda">
          <div className="mt-8">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h2 className="text-xl font-bold text-black">
                  {selectedAppointmentDate === today
                    ? "Citas de Hoy"
                    : "Citas del Día"}
                </h2>

                <p className="mt-1 text-sm text-neutral-500">
                  {selectedDateBookingCount}{" "}
                  {selectedDateBookingCount === 1 ? "cita" : "citas"}
                  {" · "}
                  {selectedDateServiceCount}{" "}
                  {selectedDateServiceCount === 1 ? "servicio" : "servicios"}
                </p>
              </div>

              <div className="flex flex-wrap items-end gap-2">
                <div>
                  <label
                    htmlFor="reception-appointment-date"
                    className="block text-xs font-semibold text-neutral-500"
                  >
                    Ver fecha
                  </label>

                  <input
                    id="reception-appointment-date"
                    type="date"
                    value={selectedAppointmentDate}
                    onChange={(event) =>
                      setSelectedAppointmentDate(event.target.value)
                    }
                    className="mt-1 rounded-xl border border-neutral-300 bg-white px-4 py-3 text-black"
                  />
                </div>

                {selectedAppointmentDate !== today && (
                  <button
                    type="button"
                    onClick={() => setSelectedAppointmentDate(today)}
                    className="rounded-xl border border-neutral-300 bg-white px-4 py-3 text-sm font-semibold text-black hover:bg-neutral-100"
                  >
                    Hoy
                  </button>
                )}
              </div>
            </div>

            {selectedDateAppointments.length === 0 ? (
              <div className="mt-4 rounded-xl bg-white p-5 shadow-sm">
                <p className="text-neutral-500">
                  No hay citas programadas para esta fecha.
                </p>
              </div>
            ) : (
              <div className="mt-4 space-y-3">
                {groupedCustomerAppointments.map((group) => (
                  <div key={group.groupKey} className="space-y-3">
                    {/* Compact summary for customers with multiple appointments. */}
                    {group.appointments.length > 1 && (
                      <div className="rounded-xl bg-white p-5 shadow-sm">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div>
                            <Link
                              href={`/staff/customers/${group.customerId}`}
                              className="text-lg font-bold text-black hover:underline"
                            >
                              {group.customer.name}
                            </Link>

                            <p className="mt-1 text-sm text-neutral-500">
                              1 cita ·{" "}
                              {group.appointments.reduce(
                                (total, appointment) =>
                                  total +
                                  appointment.appointmentServices.length,
                                0,
                              )}{" "}
                              {group.appointments.reduce(
                                (total, appointment) =>
                                  total +
                                  appointment.appointmentServices.length,
                                0,
                              ) === 1
                                ? "servicio"
                                : "servicios"}
                              {" · Desde "}
                              {formatTime(group.appointments[0].startTime)}
                            </p>
                          </div>

                          <button
                            type="button"
                            onClick={() =>
                              setExpandedBookingKeys((current) =>
                                current.includes(group.groupKey)
                                  ? current.filter(
                                      (id) => id !== group.groupKey,
                                    )
                                  : [...current, group.groupKey],
                              )
                            }
                            aria-expanded={expandedBookingKeys.includes(
                              group.groupKey,
                            )}
                            className="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-semibold text-black"
                          >
                            {expandedBookingKeys.includes(group.groupKey)
                              ? "Ocultar gestión −"
                              : "Gestionar servicios +"}
                          </button>
                        </div>

                        {/* Show all services without expanding management controls. */}
                        <div className="mt-4 space-y-2 border-t border-neutral-200 pt-4">
                          {group.appointments.map((item) => (
                            <div key={item.id} className="flex gap-3 text-sm">
                              <span className="shrink-0 font-semibold text-black">
                                {formatTime(item.startTime)}
                              </span>

                              <div className="min-w-0">
                                <p className="text-black">
                                  {item.appointmentServices
                                    .map((entry) => entry.service.nameEs)
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
                      </div>
                    )}

                    {/* Keep individual appointment controls available when expanded. */}
                    {(group.appointments.length === 1 ||
                      expandedBookingKeys.includes(group.groupKey)) && (
                      <div className="space-y-3">
                        {group.appointments.map((appointment) => (
                          <div
                            key={appointment.id}
                            className="rounded-xl bg-white p-5 shadow-sm"
                          >
                            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                              <div>
                                <p className="text-lg font-bold text-black">
                                  {formatTime(appointment.startTime)}
                                </p>

                                <Link
                                  href={`/staff/customers/${appointment.customer.id}`}
                                  className="mt-1 inline-block font-semibold text-black hover:underline"
                                >
                                  {appointment.customer.name}
                                </Link>

                                <p className="mt-1 text-sm text-neutral-500">
                                  {appointment.appointmentServices
                                    .map((item) => item.service.nameEs)
                                    .join(", ")}
                                </p>
                              </div>

                              <div className="md:min-w-48 md:text-right">
                                <p className="text-sm text-neutral-500">
                                  Técnica
                                </p>

                                <select
                                  value={appointment.employee.id}
                                  disabled={
                                    reassigningAppointmentId ===
                                      appointment.id ||
                                    [
                                      "COMPLETED",
                                      "CANCELLED",
                                      "NO_SHOW",
                                    ].includes(appointment.status)
                                  }
                                  onChange={(event) =>
                                    reassignEmployee(
                                      appointment.id,
                                      Number(event.target.value),
                                    )
                                  }
                                  className="mt-1 rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm font-semibold text-black disabled:opacity-50"
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

                                <div className="mt-2">
                                  {reassigningAppointmentId ===
                                  appointment.id ? (
                                    <span className="text-sm text-neutral-500">
                                      Actualizando...
                                    </span>
                                  ) : (
                                    <span
                                      className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${getStatusClasses(
                                        appointment.status,
                                      )}`}
                                    >
                                      {getStatusLabel(appointment.status)}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>

                            <div className="mt-4 border-t border-neutral-200 pt-4">
                              <p className="text-sm font-medium text-neutral-500">
                                Cambiar horario
                              </p>

                              <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                                <input
                                  type="date"
                                  defaultValue={appointment.date.slice(0, 10)}
                                  disabled={
                                    reschedulingAppointmentId ===
                                      appointment.id ||
                                    [
                                      "COMPLETED",
                                      "CANCELLED",
                                      "NO_SHOW",
                                    ].includes(appointment.status)
                                  }
                                  id={`date-${appointment.id}`}
                                  className="rounded-lg border border-neutral-300 bg-white px-4 py-3 text-sm text-black disabled:opacity-50"
                                />

                                <select
                                  defaultValue={appointment.startTime.slice(
                                    0,
                                    5,
                                  )}
                                  disabled={
                                    reschedulingAppointmentId ===
                                      appointment.id ||
                                    [
                                      "COMPLETED",
                                      "CANCELLED",
                                      "NO_SHOW",
                                    ].includes(appointment.status)
                                  }
                                  id={`time-${appointment.id}`}
                                  className="rounded-lg border border-neutral-300 bg-white px-4 py-3 text-sm text-black disabled:opacity-50"
                                >
                                  {!receptionTimeOptions.includes(
                                    appointment.startTime.slice(0, 5),
                                  ) && (
                                    <option
                                      value={appointment.startTime.slice(0, 5)}
                                    >
                                      {formatTime(appointment.startTime)}
                                    </option>
                                  )}

                                  {receptionTimeOptions.map((time) => (
                                    <option key={time} value={time}>
                                      {formatTime(time)}
                                    </option>
                                  ))}
                                </select>

                                <button
                                  type="button"
                                  disabled={
                                    reschedulingAppointmentId ===
                                      appointment.id ||
                                    [
                                      "COMPLETED",
                                      "CANCELLED",
                                      "NO_SHOW",
                                    ].includes(appointment.status)
                                  }
                                  onClick={() => {
                                    const dateInput = document.getElementById(
                                      `date-${appointment.id}`,
                                    ) as HTMLInputElement;

                                    const timeInput = document.getElementById(
                                      `time-${appointment.id}`,
                                    ) as HTMLSelectElement;

                                    rescheduleAppointment(
                                      appointment.id,
                                      dateInput.value,
                                      timeInput.value,
                                    );
                                  }}
                                  className="rounded-lg bg-black px-4 py-3 text-sm font-semibold text-white disabled:opacity-50"
                                >
                                  {reschedulingAppointmentId === appointment.id
                                    ? "Actualizando..."
                                    : "Guardar horario"}
                                </button>
                              </div>
                            </div>

                            {/* Appointment workflow actions */}
                            <div className="mt-4 flex flex-wrap gap-2 border-t border-neutral-200 pt-4">
                              {appointment.status === "REQUESTED" && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    updateAppointmentStatus(
                                      appointment.id,
                                      "BOOKED",
                                    )
                                  }
                                  className="rounded-lg bg-black px-4 py-2 text-sm font-semibold text-white"
                                >
                                  Confirmar Cita
                                </button>
                              )}

                              {appointment.status === "BOOKED" && (
                                <div className="flex flex-wrap gap-2">
                                  <button
                                    type="button"
                                    onClick={() =>
                                      updateAppointmentStatus(
                                        appointment.id,
                                        "CHECKED_IN",
                                      )
                                    }
                                    className="rounded-lg bg-black px-4 py-2 text-sm font-semibold text-white"
                                  >
                                    Cliente Llegó
                                  </button>

                                  {canMarkNoShow(
                                    appointment.date,
                                    appointment.startTime,
                                  ) && (
                                    <button
                                      type="button"
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
                                      className="rounded-lg border border-neutral-300 bg-white px-4 py-2 text-sm font-semibold text-black"
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
                                        updateAppointmentStatus(
                                          appointment.id,
                                          "CANCELLED",
                                        );
                                      }
                                    }}
                                    className="rounded-lg border border-neutral-300 bg-white px-4 py-2 text-sm font-semibold text-black"
                                  >
                                    Cancelar Cita
                                  </button>
                                </div>
                              )}

                              {appointment.status === "CHECKED_IN" && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    updateAppointmentStatus(
                                      appointment.id,
                                      "IN_PROGRESS",
                                    )
                                  }
                                  className="rounded-lg bg-black px-4 py-2 text-sm font-semibold text-white"
                                >
                                  Iniciar Servicio
                                </button>
                              )}

                              {appointment.status === "IN_PROGRESS" && (
                                <Link
                                  href={`/staff/checkout/${appointment.id}`}
                                  className="inline-block rounded-lg bg-black px-4 py-2 text-sm font-semibold text-white"
                                >
                                  Finalizar Servicio
                                </Link>
                              )}
                              <button
                                type="button"
                                onClick={() =>
                                  deleteAppointment(
                                    appointment.id,
                                    appointment.status,
                                  )
                                }
                                className="rounded-lg border border-red-300 bg-white px-4 py-2 text-sm font-semibold text-red-700"
                              >
                                Eliminar Cita
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Technician schedule blocking */}
          <div className="mt-8 rounded-xl bg-white p-5 shadow-sm">
            {/* Click to expand or collapse the schedule-blocking form. */}
            <button
              type="button"
              onClick={() => setShowBlockForm((current) => !current)}
              disabled={isSavingBlock}
              aria-expanded={showBlockForm}
              aria-controls="receptionist-block-form"
              className="flex w-full items-center justify-between gap-4 text-left"
            >
              <div>
                <h2 className="text-xl font-bold text-black">
                  Bloquear horario
                </h2>

                <p className="mt-1 text-sm text-neutral-500">
                  Gestionar disponibilidad de técnicas
                </p>
              </div>

              <span
                aria-hidden="true"
                className="text-xl font-semibold text-neutral-500"
              >
                {showBlockForm ? "−" : "+"}
              </span>
            </button>
            {/* Only display the blocking form when expanded. */}
            <div id="receptionist-block-form" hidden={!showBlockForm}>
              <div className="mt-5 grid gap-4 md:grid-cols-2 lg:grid-cols-5">
                <div>
                  <label className="block text-sm font-semibold text-black">
                    Técnica
                  </label>

                  <select
                    value={blockEmployeeId}
                    onChange={(event) =>
                      setBlockEmployeeId(Number(event.target.value))
                    }
                    className="mt-2 w-full rounded-xl border border-neutral-300 bg-white px-4 py-3 text-black"
                  >
                    <option value={0}>Seleccionar</option>

                    {employees.map((employee) => (
                      <option key={employee.id} value={employee.id}>
                        {employee.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-black">
                    Fecha
                  </label>

                  <input
                    type="date"
                    value={blockDate}
                    onChange={(event) => setBlockDate(event.target.value)}
                    className="mt-2 w-full rounded-xl border border-neutral-300 bg-white px-4 py-3 text-black"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-black">
                    Desde
                  </label>

                  <select
                    value={blockStartTime}
                    onChange={(event) => setBlockStartTime(event.target.value)}
                    className="mt-2 w-full rounded-xl border border-neutral-300 bg-white px-4 py-3 text-black"
                  >
                    {receptionTimeOptions.map((time) => (
                      <option key={time} value={time}>
                        {formatTime(time)}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-black">
                    Hasta
                  </label>

                  <select
                    value={blockEndTime}
                    onChange={(event) => setBlockEndTime(event.target.value)}
                    className="mt-2 w-full rounded-xl border border-neutral-300 bg-white px-4 py-3 text-black"
                  >
                    {receptionTimeOptions.map((time) => (
                      <option key={time} value={time}>
                        {formatTime(time)}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-black">
                    Motivo
                  </label>

                  <input
                    type="text"
                    maxLength={200}
                    value={blockReason}
                    onChange={(event) => setBlockReason(event.target.value)}
                    placeholder="Ej. Llega tarde"
                    className="mt-2 w-full rounded-xl border border-neutral-300 bg-white px-4 py-3 text-black"
                  />
                </div>
              </div>

              {blockError && (
                <p className="mt-4 text-sm font-medium text-red-700">
                  {blockError}
                </p>
              )}

              <button
                type="button"
                onClick={createScheduleBlock}
                disabled={isSavingBlock}
                className="mt-5 rounded-xl bg-black px-5 py-3 text-sm font-semibold text-white disabled:opacity-50"
              >
                {isSavingBlock ? "Bloqueando..." : "Bloquear horario"}
              </button>
            </div>
          </div>

          {/* Schedule blocks for the selected block date */}
          <div className="mt-6 rounded-xl bg-white p-5 shadow-sm">
            <h2 className="text-lg font-bold text-black">
              Horarios bloqueados
            </h2>

            <p className="mt-1 text-sm text-neutral-500">{blockDate}</p>

            {scheduleBlocks.filter(
              (block) => block.date.slice(0, 10) === blockDate,
            ).length === 0 ? (
              <p className="mt-4 text-sm text-neutral-500">
                No hay horarios bloqueados para esta fecha.
              </p>
            ) : (
              <div className="mt-4 space-y-3">
                {scheduleBlocks
                  .filter((block) => block.date.slice(0, 10) === blockDate)
                  .map((block) => (
                    <div
                      key={block.id}
                      className="flex flex-col gap-3 rounded-xl border border-neutral-200 p-4 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div>
                        <p className="font-semibold text-black">
                          {block.employee.name}
                        </p>

                        <p className="mt-1 text-sm text-neutral-600">
                          {formatTime(block.startTime)}
                          {" – "}
                          {formatTime(block.endTime)}
                        </p>

                        {block.reason && (
                          <p className="mt-1 text-sm text-neutral-500">
                            {block.reason}
                          </p>
                        )}
                      </div>

                      <button
                        type="button"
                        onClick={() => deleteScheduleBlock(block.id)}
                        className="rounded-lg border border-red-200 px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-50"
                      >
                        Eliminar
                      </button>
                    </div>
                  ))}
              </div>
            )}
          </div>
        </section>
      )}

      {activeTab === "rendimiento" && (
        <section
          id="panel-rendimiento"
          role="tabpanel"
          aria-labelledby="tab-rendimiento"
        >
          {/* Weekly salon performance */}
          <div className="mt-8">
            <h2 className="text-xl font-bold text-black">Esta Semana</h2>

            {/* Weekly goal */}
            <div className="mt-4 rounded-xl bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-neutral-500">Ventas</p>

                  <p className="mt-1 text-xl font-bold text-black">
                    {formatCOP(weeklySalesTotal)}
                  </p>
                </div>

                <div className="text-right">
                  <p className="text-sm font-medium text-neutral-500">
                    Meta Semanal
                  </p>

                  <p className="mt-1 text-xl font-bold text-black">
                    {formatCOP(weeklySalesGoal)}
                  </p>
                </div>
              </div>

              <div className="mt-4 h-3 overflow-hidden rounded-full bg-neutral-200">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${
                    weeklyGoalProgress < 40
                      ? "bg-[#D97777]"
                      : weeklyGoalProgress < 75
                        ? "bg-[#D9A441]"
                        : weeklyGoalProgress < 100
                          ? "bg-[#B76E79]"
                          : "bg-[#329D7B]"
                  }`}
                  style={{ width: `${weeklyGoalProgress}%` }}
                />
              </div>

              <div className="mt-3 flex justify-between text-sm text-neutral-500">
                <span>{weeklyGoalProgress}% completado</span>

                <span>
                  Faltan{" "}
                  {formatCOP(Math.max(weeklySalesGoal - weeklySalesTotal, 0))}
                </span>
              </div>
            </div>

            {/* Technician production */}
            <div className="mt-6">
              <h3 className="text-lg font-bold text-black">
                Producción por Técnica
              </h3>

              <div className="mt-3 overflow-x-auto rounded-xl border border-neutral-200 bg-white shadow-sm">
                <table className="w-full min-w-[420px] text-sm">
                  <thead className="bg-neutral-50 text-neutral-600">
                    <tr>
                      <th
                        scope="col"
                        className="px-4 py-3 text-left font-semibold"
                      >
                        Técnica
                      </th>
                      <th
                        scope="col"
                        className="px-4 py-3 text-right font-semibold"
                      >
                        Clientes
                      </th>
                      <th
                        scope="col"
                        className="px-4 py-3 text-right font-semibold"
                      >
                        Producción
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100">
                    {weeklyTechnicianSummary.map((employee) => (
                      <tr key={employee.id}>
                        <td className="px-4 py-3">
                          <Link
                            href={`/receptionist/technicians/${employee.id}`}
                            className="font-semibold text-black hover:underline"
                          >
                            {employee.name}
                          </Link>
                        </td>
                        <td className="px-4 py-3 text-right text-neutral-600">
                          {employee.customers}
                        </td>
                        <td className="px-4 py-3 text-right font-semibold text-black">
                          {formatCOP(employee.sales)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {weeklyTechnicianSummary.length === 0 && (
                  <p className="p-4 text-sm text-neutral-500">
                    No hay técnicas para mostrar.
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Monthly salon performance */}
          <div className="mt-8">
            <h2 className="text-xl font-bold text-black">Este Mes</h2>

            {/* Monthly goal */}
            <div className="mt-4 rounded-xl bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-neutral-500">Ventas</p>

                  <p className="mt-1 text-xl font-bold text-black">
                    {formatCOP(monthlySalesTotal)}
                  </p>
                </div>

                <div className="text-right">
                  <p className="text-sm font-medium text-neutral-500">
                    Meta Mensual
                  </p>

                  <p className="mt-1 text-xl font-bold text-black">
                    {formatCOP(monthlySalesGoal)}
                  </p>
                </div>
              </div>

              <div className="mt-4 h-3 overflow-hidden rounded-full bg-neutral-200">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${
                    monthlyGoalProgress < 40
                      ? "bg-[#D97777]"
                      : monthlyGoalProgress < 75
                        ? "bg-[#D9A441]"
                        : monthlyGoalProgress < 100
                          ? "bg-[#B76E79]"
                          : "bg-[#329D7B]"
                  }`}
                  style={{ width: `${monthlyGoalProgress}%` }}
                />
              </div>

              <div className="mt-3 flex justify-between text-sm text-neutral-500">
                <span>{monthlyGoalProgress}% completado</span>

                <span>
                  Faltan{" "}
                  {formatCOP(Math.max(monthlySalesGoal - monthlySalesTotal, 0))}
                </span>
              </div>
            </div>

            {/* Monthly technician production */}
            <div className="mt-6">
              <h3 className="text-lg font-bold text-black">
                Producción por Técnica
              </h3>

              <div className="mt-3 overflow-x-auto rounded-xl border border-neutral-200 bg-white shadow-sm">
                <table className="w-full min-w-[420px] text-sm">
                  <thead className="bg-neutral-50 text-neutral-600">
                    <tr>
                      <th
                        scope="col"
                        className="px-4 py-3 text-left font-semibold"
                      >
                        Técnica
                      </th>
                      <th
                        scope="col"
                        className="px-4 py-3 text-right font-semibold"
                      >
                        Clientes
                      </th>
                      <th
                        scope="col"
                        className="px-4 py-3 text-right font-semibold"
                      >
                        Producción
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100">
                    {monthlyTechnicianSummary.map((employee) => (
                      <tr key={employee.id}>
                        <td className="px-4 py-3">
                          <Link
                            href={`/receptionist/technicians/${employee.id}`}
                            className="font-semibold text-black hover:underline"
                          >
                            {employee.name}
                          </Link>
                        </td>
                        <td className="px-4 py-3 text-right text-neutral-600">
                          {employee.customers}
                        </td>
                        <td className="px-4 py-3 text-right font-semibold text-black">
                          {formatCOP(employee.sales)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {monthlyTechnicianSummary.length === 0 && (
                  <p className="p-4 text-sm text-neutral-500">
                    No hay técnicas para mostrar.
                  </p>
                )}
              </div>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
