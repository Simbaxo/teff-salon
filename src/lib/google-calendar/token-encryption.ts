import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12;
const TAG_BYTES = 16;

function getTokenKey(): Buffer {
  const key = process.env.TEFF_GOOGLE_CALENDAR_TOKEN_KEY;

  if (!key || !/^[a-fA-F0-9]{64}$/.test(key)) {
    throw new Error("Google Calendar token key must be 64 hex characters.");
  }

  return Buffer.from(key, "hex");
}

export function encryptGoogleCalendarRefreshToken(token: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, getTokenKey(), iv);
  const ciphertext = Buffer.concat([
    cipher.update(token, "utf8"),
    cipher.final(),
  ]);

  return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString(
    "base64",
  );
}

export function decryptGoogleCalendarRefreshToken(encrypted: string): string {
  const data = Buffer.from(encrypted, "base64");

  if (data.length <= IV_BYTES + TAG_BYTES) {
    throw new Error("Invalid encrypted Google Calendar refresh token.");
  }

  const iv = data.subarray(0, IV_BYTES);
  const tag = data.subarray(IV_BYTES, IV_BYTES + TAG_BYTES);
  const ciphertext = data.subarray(IV_BYTES + TAG_BYTES);

  const decipher = createDecipheriv(ALGORITHM, getTokenKey(), iv);
  decipher.setAuthTag(tag);

  return Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]).toString("utf8");
}
