export function isCashboxWriteEnabled(): boolean {
  if (process.env.NODE_ENV !== "production") {
    return true;
  }

  return process.env.TEFF_CASHBOX_WRITES_ENABLED === "true";
}
