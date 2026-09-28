import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { sql } from 'kysely';
import { app } from '../src/index.js';
import { db } from '../src/db/database.js';
import { migrateDown, migrateToLatest } from '../src/db/migrator.js';
import { createUser } from '../src/dal/users.js';
import { createTicket } from '../src/dal/tickets.js';
import { getTotalHoursForTicket, insertTimeLog } from '../src/dal/timeLogs.js';

const INT4_MAX = 2_147_483_647;

/** Creates a user directly through the DAL and returns its id. */
async function makeUser(name = 'Alice'): Promise<number> {
  const user = await createUser({
    name,
    email: `${name.toLowerCase()}@example.com`,
  });
  return user.id;
}

/** Creates a ticket directly through the DAL and returns its id. */
async function makeTicket(creatorId: number, title = 'Fix login bug') {
  const ticket = await createTicket({ title, creator_id: creatorId });
  return ticket.id;
}

/** POST /tickets/:id/time as the given user. */
function logHours(ticketId: number | string, userId: number, hours: unknown) {
  return request(app)
    .post(`/tickets/${ticketId}/time`)
    .set('X-User-Id', String(userId))
    .send({ hours });
}

/** GET /tickets/:id/time */
function getTotal(ticketId: number | string) {
  return request(app).get(`/tickets/${ticketId}/time`);
}

describe('Part 2: Time Logs Tests', () => {
  describe('total hours aggregation (POST then GET)', () => {
    it('sums several time logs on a single ticket', async () => {
      const userId = await makeUser();
      const ticketId = await makeTicket(userId);

      for (const hours of [2, 3, 5]) {
        expect((await logHours(ticketId, userId, hours)).status).toBe(201);
      }

      const res = await getTotal(ticketId);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ticket_id: ticketId, total_hours: 10 });
    });

    it('reflects the running total after each new log', async () => {
      const userId = await makeUser();
      const ticketId = await makeTicket(userId);

      let expected = 0;
      for (const hours of [1, 4, 2, 8]) {
        await logHours(ticketId, userId, hours);
        expected += hours;

        const res = await getTotal(ticketId);
        expect(res.body.total_hours).toBe(expected);
      }
      expect(expected).toBe(15);
    });

    it('adds up logs from different users on the same ticket', async () => {
      const alice = await makeUser('Alice');
      const bob = await makeUser('Bob');
      const ticketId = await makeTicket(alice);

      await logHours(ticketId, alice, 3);
      await logHours(ticketId, bob, 4);
      await logHours(ticketId, alice, 1);

      const res = await getTotal(ticketId);
      expect(res.body.total_hours).toBe(8);
    });

    it('only counts hours logged against the requested ticket', async () => {
      const userId = await makeUser();
      const ticketA = await makeTicket(userId, 'Ticket A');
      const ticketB = await makeTicket(userId, 'Ticket B');

      await logHours(ticketA, userId, 2);
      await logHours(ticketA, userId, 3);
      await logHours(ticketB, userId, 7);

      expect((await getTotal(ticketA)).body).toEqual({
        ticket_id: ticketA,
        total_hours: 5,
      });
      expect((await getTotal(ticketB)).body).toEqual({
        ticket_id: ticketB,
        total_hours: 7,
      });
    });

    it('returns 0 for an existing ticket with no time logged', async () => {
      const userId = await makeUser();
      const ticketId = await makeTicket(userId);

      const res = await getTotal(ticketId);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ticket_id: ticketId, total_hours: 0 });
    });

    it('returns total_hours as a JSON number, not a string', async () => {
      const userId = await makeUser();
      const ticketId = await makeTicket(userId);
      await logHours(ticketId, userId, 6);

      const res = await getTotal(ticketId);
      // Postgres SUM(integer) is a bigint, which the pg driver returns as a string.
      expect(typeof res.body.total_hours).toBe('number');
      expect(typeof res.body.ticket_id).toBe('number');
    });

    it('does not overflow a 32-bit integer when the sum gets large', async () => {
      const userId = await makeUser();
      const ticketId = await makeTicket(userId);

      await logHours(ticketId, userId, INT4_MAX);
      await logHours(ticketId, userId, INT4_MAX);

      const res = await getTotal(ticketId);
      expect(res.body.total_hours).toBe(INT4_MAX * 2);
    });
  });

  describe('POST /tickets/:id/time', () => {
    it('returns 201 and the stored log, using the X-User-Id header as user_id', async () => {
      const userId = await makeUser();
      const ticketId = await makeTicket(userId);

      const res = await logHours(ticketId, userId, 4);

      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({
        id: expect.any(Number),
        ticket_id: ticketId,
        user_id: userId,
        hours: 4,
      });
      expect(res.body).toHaveProperty('logged_at');
    });

    it('ignores a user_id supplied in the body and trusts only the header', async () => {
      const alice = await makeUser('Alice');
      const bob = await makeUser('Bob');
      const ticketId = await makeTicket(alice);

      const res = await request(app)
        .post(`/tickets/${ticketId}/time`)
        .set('X-User-Id', String(alice))
        .send({ hours: 2, user_id: bob });

      expect(res.status).toBe(201);
      expect(res.body.user_id).toBe(alice);
    });

    it('returns 401 when X-User-Id is missing', async () => {
      const userId = await makeUser();
      const ticketId = await makeTicket(userId);

      const res = await request(app)
        .post(`/tickets/${ticketId}/time`)
        .send({ hours: 2 });

      expect(res.status).toBe(401);
      expect(res.body).toHaveProperty('error');
      expect((await getTotal(ticketId)).body.total_hours).toBe(0);
    });

    it('returns 401 when X-User-Id does not belong to an existing user', async () => {
      const userId = await makeUser();
      const ticketId = await makeTicket(userId);

      const res = await logHours(ticketId, 4242, 2);

      expect(res.status).toBe(401);
      expect((await getTotal(ticketId)).body.total_hours).toBe(0);
    });

    it('returns 404 when the ticket does not exist', async () => {
      const userId = await makeUser();

      expect((await logHours(9999, userId, 2)).status).toBe(404);
      // Larger than a Postgres integer: must be a 404, not a 500.
      expect((await logHours(INT4_MAX + 1, userId, 2)).status).toBe(404);
    });

    it('returns 400 when the ticket id is not a positive integer', async () => {
      const userId = await makeUser();

      for (const badId of ['abc', '0', '-1', '1.5']) {
        expect((await logHours(badId, userId, 2)).status).toBe(400);
      }
    });

    it.each([0, -3, 1.5, '3', null, true, [2], { value: 2 }, INT4_MAX + 1])(
      'returns 400 and logs nothing for invalid hours %j',
      async (bad) => {
        const userId = await makeUser();
        const ticketId = await makeTicket(userId);

        const res = await logHours(ticketId, userId, bad);

        expect(res.status).toBe(400);
        expect(res.body).toHaveProperty('error');
        expect((await getTotal(ticketId)).body.total_hours).toBe(0);
      },
    );

    it('returns 400 when hours is missing from the body', async () => {
      const userId = await makeUser();
      const ticketId = await makeTicket(userId);

      const res = await request(app)
        .post(`/tickets/${ticketId}/time`)
        .set('X-User-Id', String(userId))
        .send({});

      expect(res.status).toBe(400);
    });
  });

  describe('GET /tickets/:id/time', () => {
    it('does not require X-User-Id', async () => {
      const userId = await makeUser();
      const ticketId = await makeTicket(userId);

      expect((await getTotal(ticketId)).status).toBe(200);
    });

    it('returns 404 when the ticket does not exist', async () => {
      expect((await getTotal(9999)).status).toBe(404);
      expect((await getTotal(INT4_MAX + 1)).status).toBe(404);
    });

    it('returns 400 when the ticket id is not a positive integer', async () => {
      for (const badId of ['abc', '0', '-1']) {
        expect((await getTotal(badId)).status).toBe(400);
      }
    });
  });

  describe('DAL', () => {
    it('insertTimeLog returns the inserted row', async () => {
      const userId = await makeUser();
      const ticketId = await makeTicket(userId);

      const log = await insertTimeLog(ticketId, userId, 3);

      expect(log).toMatchObject({
        id: expect.any(Number),
        ticket_id: ticketId,
        user_id: userId,
        hours: 3,
      });
      expect(log.logged_at).toBeInstanceOf(Date);
    });

    it('getTotalHoursForTicket sums in SQL and returns a number', async () => {
      const userId = await makeUser();
      const ticketId = await makeTicket(userId);
      await insertTimeLog(ticketId, userId, 2);
      await insertTimeLog(ticketId, userId, 3);
      await insertTimeLog(ticketId, userId, 5);

      const total = await getTotalHoursForTicket(ticketId);

      expect(total).toBe(10);
    });

    it('getTotalHoursForTicket returns 0 when there are no logs', async () => {
      const userId = await makeUser();
      const ticketId = await makeTicket(userId);

      expect(await getTotalHoursForTicket(ticketId)).toBe(0);
    });
  });

  describe('time_logs schema', () => {
    it('rejects a log for a ticket that does not exist (foreign key)', async () => {
      const userId = await makeUser();

      await expect(insertTimeLog(9999, userId, 2)).rejects.toMatchObject({
        code: '23503',
      });
    });

    it('rejects a log for a user that does not exist (foreign key)', async () => {
      const userId = await makeUser();
      const ticketId = await makeTicket(userId);

      await expect(insertTimeLog(ticketId, 9999, 2)).rejects.toMatchObject({
        code: '23503',
      });
    });

    it('rejects non-positive hours (check constraint)', async () => {
      const userId = await makeUser();
      const ticketId = await makeTicket(userId);

      await expect(insertTimeLog(ticketId, userId, 0)).rejects.toMatchObject({
        code: '23514',
      });
    });

    it('deletes a ticket’s time logs when the ticket is deleted', async () => {
      const userId = await makeUser();
      const ticketId = await makeTicket(userId);
      await insertTimeLog(ticketId, userId, 2);

      await db.deleteFrom('tickets').where('id', '=', ticketId).execute();

      const remaining = await db
        .selectFrom('time_logs')
        .select('id')
        .where('ticket_id', '=', ticketId)
        .execute();
      expect(remaining).toHaveLength(0);
    });

    it('down() drops the table and up() recreates it', async () => {
      const tableExists = async () => {
        const { rows } = await sql<{ exists: boolean }>`
          SELECT to_regclass('public.time_logs') IS NOT NULL AS exists
        `.execute(db);
        return rows[0].exists;
      };

      expect(await tableExists()).toBe(true);
      try {
        await migrateDown(db);
        expect(await tableExists()).toBe(false);
      } finally {
        // Always restore the schema so later tests are unaffected.
        await migrateToLatest(db);
      }
      expect(await tableExists()).toBe(true);
    });
  });
});
