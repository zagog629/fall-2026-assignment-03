import { HttpError } from './http.js';

/** Largest value a Postgres `integer` (int4) column can hold. */
export const INT4_MAX = 2_147_483_647;

export const TICKET_STATUSES = ['TODO', 'IN_PROGRESS', 'DONE'] as const;
export type TicketStatus = (typeof TICKET_STATUSES)[number];

/** True if `id` could exist in a serial/integer primary key column. */
export function fitsInInt4(id: number): boolean {
  return id <= INT4_MAX;
}

/** Parses a positive integer id from a URL param. Throws 400 if malformed. */
export function parseId(value: unknown, name = 'id'): number {
  if (typeof value === 'string' && /^\d+$/.test(value)) {
    const n = Number(value);
    if (Number.isSafeInteger(n) && n > 0) return n;
  }
  throw new HttpError(400, `"${name}" must be a positive integer`);
}

/** Parses an optional non-negative integer query param. Throws 400 if invalid. */
export function optionalIntQuery(
  value: unknown,
  name: string,
  min: number,
): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value === 'string' && /^\d+$/.test(value)) {
    const n = Number(value);
    if (Number.isSafeInteger(n) && n >= min) return n;
  }
  throw new HttpError(400, `"${name}" must be an integer >= ${min}`);
}

export function isTicketStatus(value: unknown): value is TicketStatus {
  return (
    typeof value === 'string' &&
    (TICKET_STATUSES as readonly string[]).includes(value)
  );
}

/** Validates a ticket status value. Throws 400 if it is not an allowed status. */
export function parseStatus(value: unknown, name = 'status'): TicketStatus {
  if (isTicketStatus(value)) return value;
  throw new HttpError(
    400,
    `"${name}" must be one of: ${TICKET_STATUSES.join(', ')}`,
  );
}

/** Ensures a request body is a plain JSON object. Throws 400 otherwise. */
export function asObject(body: unknown): Record<string, unknown> {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw new HttpError(400, 'Request body must be a JSON object');
  }
  return body as Record<string, unknown>;
}

/** Reads a required, non-blank string field (trimmed). Throws 400 if invalid. */
export function requiredString(
  body: Record<string, unknown>,
  field: string,
  maxLength = 255,
): string {
  const value = body[field];
  if (typeof value !== 'string' || value.trim() === '') {
    throw new HttpError(
      400,
      `"${field}" is required and must be a non-empty string`,
    );
  }
  const trimmed = value.trim();
  if (trimmed.length > maxLength) {
    throw new HttpError(
      400,
      `"${field}" must be at most ${maxLength} characters`,
    );
  }
  return trimmed;
}

/** Reads an optional string field. Missing/null becomes null. Throws 400 if not a string. */
export function optionalString(
  body: Record<string, unknown>,
  field: string,
): string | null {
  const value = body[field];
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') {
    throw new HttpError(400, `"${field}" must be a string`);
  }
  return value;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Reads a required email field. Throws 400 if missing or not shaped like an email. */
export function requiredEmail(
  body: Record<string, unknown>,
  field = 'email',
): string {
  const email = requiredString(body, field, 255);
  if (!EMAIL_PATTERN.test(email)) {
    throw new HttpError(400, `"${field}" must be a valid email address`);
  }
  return email;
}
