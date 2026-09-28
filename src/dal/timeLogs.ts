import { db, TimeLog } from '../db/database.js';

/** Inserts a time log row and returns the stored record. */
export async function insertTimeLog(
  ticketId: number,
  userId: number,
  hours: number,
): Promise<TimeLog> {
  return await db
    .insertInto('time_logs')
    .values({ ticket_id: ticketId, user_id: userId, hours })
    .returningAll()
    .executeTakeFirstOrThrow();
}

/**
 * Returns the total hours logged against a ticket, or 0 if nothing has been
 * logged yet.
 *
 * The summation happens in SQL (`SUM`), not in JavaScript. Two details:
 * - `SUM` returns NULL when no rows match, so it is wrapped in `COALESCE`.
 * - `SUM(integer)` is a Postgres `bigint`, which the `pg` driver returns as a
 *   string, so the result is converted to a real number before returning.
 */
export async function getTotalHoursForTicket(
  ticketId: number,
): Promise<number> {
  const result = await db
    .selectFrom('time_logs')
    .select((eb) =>
      eb.fn
        .coalesce(eb.fn.sum<string | null>('hours'), eb.lit(0))
        .as('total_hours'),
    )
    .where('ticket_id', '=', ticketId)
    .executeTakeFirstOrThrow();

  return Number(result.total_hours);
}
