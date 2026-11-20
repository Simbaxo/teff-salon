"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { getTeffToday } from "@/lib/datetime";
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
  const router = useRouter();
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


  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  // Web Push support for the salon iPad and other staff devices
  const [pushSupported, setPushSupported] = useState(false);

  const [notificationPermission, setNotificationPermission] =
    useState<NotificationPermission>("default");

  const [serviceWorkerReady, setServiceWorkerReady] = useState(false);

  const [isEnablingPush, setIsEnablingPush] = useState(false);

  const [pushEnabled, setPushEnabled] = useState(false);

  const [pushError, setPushError] = useState("");





















  // Keep the schedule-blocking form collapsed until needed.


  // Expand individual bookings, not all bookings for one customer.


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





  // Reassign an appointment to another qualified technician.
  // Appointment overlaps can be intentionally overridden after confirmation.


  // Update the operational status of an appointment.


  // Delete an appointment after explicit confirmation.


  // Change the date/time of one appointment block.
  // Appointment overlaps can be intentionally overridden after confirmation.


  const todaysAppointments = appointments
    .filter((appointment) => appointment.date.slice(0, 10) === today)
    .sort((a, b) => a.startTime.localeCompare(b.startTime));

  // Appointment list can display today or a previous date independently
  // from the dashboard's "today" KPI cards.


  // Count bookings separately from their scheduled service blocks.
  // Legacy appointments without bookingId remain independent.




  // Group appointments by booking while preserving individual
  // service blocks and their scheduling controls.


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

      // Open the reservation in the main Staff Agenda.
      // The booking was already marked as read successfully.
      const params = new URLSearchParams({
        date: notification.date.slice(0, 10),
        bookingId: String(notification.bookingId),
      });

      router.push(`/staff?${params.toString()}`);
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





  // A client can only be marked as a no-show after the appointment starts.


  return (
    <div className="mt-8">
      {/* Receptionist dashboard navigation */}
      <div
        role="tablist"
        aria-label="Secciones de recepción"
        className="grid grid-cols-2 gap-2 rounded-xl bg-white p-2 shadow-sm"
      >
        {(
          [
            ["resumen", "Resumen"],
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
                      const params = new URLSearchParams({
                        date: booking.date.slice(0, 10),
                      });

                      // Modern reservations have booking IDs.
                      // Older appointments can still be opened by date.
                      if (booking.groupKey.startsWith("booking-")) {
                        const bookingId = Number(
                          booking.groupKey.slice("booking-".length),
                        );

                        if (Number.isSafeInteger(bookingId) && bookingId > 0) {
                          params.set("bookingId", String(bookingId));
                        }
                      }

                      router.push(`/staff?${params.toString()}`);
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
