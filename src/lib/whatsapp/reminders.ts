const HOURS_BEFORE_REMINDER = 24;

const HOUR_IN_MS = 60 * 60 * 1000;

const REMINDER_LEAD_TIME_MS = HOURS_BEFORE_REMINDER * HOUR_IN_MS;

export function getWhatsAppReminderTime(
  appointmentDate: Date,
  appointmentTime: string,
): Date {
  if (Number.isNaN(appointmentDate.getTime())) {
    throw new Error("INVALID_APPOINTMENT_DATE");
  }

  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(appointmentTime)) {
    throw new Error("INVALID_APPOINTMENT_TIME");
  }

  // TEFF stores appointment dates as UTC midnight.
  // The appointment time itself represents Medellín local time.
  const date = appointmentDate.toISOString().slice(0, 10);

  const appointmentDateTime = new Date(`${date}T${appointmentTime}:00-05:00`);

  return new Date(appointmentDateTime.getTime() - REMINDER_LEAD_TIME_MS);
}

export function shouldQueueWhatsAppReminder(
  appointmentDate: Date,
  appointmentTime: string,
  now: Date = new Date(),
): boolean {
  if (Number.isNaN(now.getTime())) {
    throw new Error("INVALID_CURRENT_DATE");
  }

  const reminderTime = getWhatsAppReminderTime(
    appointmentDate,
    appointmentTime,
  );

  // The appointment must be at least 24 hours away.
  // Otherwise, skip the reminder entirely.
  return reminderTime.getTime() >= now.getTime();
}
