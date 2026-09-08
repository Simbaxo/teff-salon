// Normalize customer phone numbers into a consistent international format.
export function normalizePhoneNumber(phone: string) {
  const cleaned = phone.trim().replace(/[^\d+]/g, "");

  // Colombian mobile number entered locally, e.g. 3001234567
  if (/^3\d{9}$/.test(cleaned)) {
    return `+57${cleaned}`;
  }

  // Colombian number entered with country code but no +
  if (/^57\d{10}$/.test(cleaned)) {
    return `+${cleaned}`;
  }

  // Already in international format, e.g. +12025550123
  if (/^\+\d{8,15}$/.test(cleaned)) {
    return cleaned;
  }

  // Reject numbers that cannot be normalized safely.
  return null;
}