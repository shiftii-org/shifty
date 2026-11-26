/** Credential administration input rules, shared by backend and regression tests. */
export function normalizeCredentialName(value: string): string {
  const name = value?.trim().replace(/\s+/g, " ");
  if (!name || name.length < 2 || name.length > 100) {
    throw new Error("Certification name must be 2–100 characters.");
  }
  return name;
}

export function validateWarningDays(value: number): number {
  if (!Number.isInteger(value) || value < 0 || value > 365) {
    throw new Error("Expiry warning days must be a whole number from 0 to 365.");
  }
  return value;
}

function isCalendarDate(date: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const parsed = new Date(date + "T12:00:00Z");
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === date;
}

export function validateCredentialDates(
  issuedAt?: string | null,
  expiresAt?: string | null,
): { issuedAt: string | null; expiresAt: string | null } {
  const issued = issuedAt || null;
  const expires = expiresAt || null;
  if ((issued && !isCalendarDate(issued)) || (expires && !isCalendarDate(expires))) {
    throw new Error("Use real dates in YYYY-MM-DD format.");
  }
  if (issued && expires && expires < issued) {
    throw new Error("Expiry date must not be earlier than issue date.");
  }
  return { issuedAt: issued, expiresAt: expires };
}

/** Never accept/store full licence numbers in the current Shiftii schema. */
export function validateIdentifierLast4(value?: string | null): string | null {
  const last4 = value?.trim() || null;
  if (last4 && !/^[A-Za-z0-9]{4}$/.test(last4)) {
    throw new Error("Only the final 4 letters or digits of an identifier may be stored.");
  }
  return last4;
}

export function credentialCoversShift(
  credential: { issuedAt: string | null; expiresAt: string | null; verified: boolean },
  shiftDate: string,
): boolean {
  if (!credential.verified || !isCalendarDate(shiftDate)) return false;
  if (credential.issuedAt && credential.issuedAt > shiftDate) return false;
  if (credential.expiresAt && credential.expiresAt < shiftDate) return false;
  return true;
}
