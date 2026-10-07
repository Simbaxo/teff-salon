// TEFF operates in Medellín, Colombia.
export const TEFF_TIME_ZONE = "America/Bogota";

// Return today's calendar date in TEFF's local timezone as YYYY-MM-DD.
export function getTeffToday() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TEFF_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

// Convert a TEFF calendar date into the exact start of that day
// in Medellín. Useful when querying timestamp fields such as Sale.createdAt
export function getTeffDayStart(date: string) {
  return new Date(`${date}T00:00:00-05:00`);
}

// Add calendar days to a YYYY-MM-DD date without changing time zones
export function addTeffDays(
  date: string,
  days: number
) {
  const [year, month, day] = date
    .split("-")
    .map(Number);

  const value = new Date(
    Date.UTC(year, month - 1, day)
  );

  value.setUTCDate(
    value.getUTCDate() + days
  );

  return value
    .toISOString()
    .slice(0, 10);
}

// Return the day of the week for a YYYY-MM-DD date.
// 0 = Sunday, 1 = Monday, ... 6 = Saturday.
export function getTeffDayOfWeek(date: string) {
  const [year, month, day] = date.split("-").map(Number);

  return new Date(
    Date.UTC(year, month - 1, day)
  ).getUTCDay();
}

// Return the current time in TEFF's timezone as minutes after midnight.
export function getTeffCurrentMinutes() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TEFF_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date());

  const hour = Number(
    parts.find((part) => part.type === "hour")?.value ?? 0
  );

  const minute = Number(
    parts.find((part) => part.type === "minute")?.value ?? 0
  );

  return hour * 60 + minute;
}

// Check whether an appointment's start time has passed in Medellín.
export function hasTeffAppointmentStarted(
  date: string,
  startTime: string
) {
  const appointmentDateTime = new Date(
    `${date.slice(0, 10)}T${startTime}:00-05:00`
  );

  return new Date() >= appointmentDateTime;
}