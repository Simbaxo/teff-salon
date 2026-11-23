import { hasTeffAppointmentStarted } from "@/lib/datetime";

// Translate appointment statuses to Spanish.
export function getStatusLabel(status: string) {
  switch (status) {
    case "BOOKED":
      return "Reservada";
    case "REQUESTED":
      return "Pendiente";
    case "COMPLETED":
      return "Completada";
    case "CANCELLED":
      return "Cancelada";
    case "NO_SHOW":
      return "No Asistió";
    case "CHECKED_IN":
      return "Cliente llego";
    case "IN_PROGRESS":
      return "En servicio";
    default:
      return status;
  }
}

export function getStatusClasses(status: string) {
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

// A client can only be marked as a no-show after the appointment starts.
export function canMarkNoShow(date: string, startTime: string) {
  return hasTeffAppointmentStarted(date, startTime);
}

// Display appointment times in AM/PM format.
export function formatTime(time: string) {
  const [hours, minutes] = time.split(":").map(Number);

  const period = hours >= 12 ? "PM" : "AM";
  const displayHour = hours % 12 || 12;

  return `${displayHour}:${minutes.toString().padStart(2, "0")} ${period}`;
}
