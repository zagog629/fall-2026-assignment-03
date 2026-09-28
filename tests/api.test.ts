import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../src/index.js';
import type { Ticket, User } from '../src/db/database.js';
import { createUser } from '../src/dal/users.js';
import { createTicket } from '../src/dal/tickets.js';

/**
 * The auth middleware only checks that X-User-Id is a valid number, so any
 * id works for creating the very first user (there is no user to log in as yet).
 */
const BOOTSTRAP_ID = '1';

async function createUserViaApi(
  overrides: Partial<{ name: string; email: string }> = {},
): Promise<User> {
  const res = await request(app)
    .post('/users')
    .set('X-User-Id', BOOTSTRAP_ID)
    .send({ name: 'Alice', email: 'alice@example.com', ...overrides });
  expect(res.status).toBe(201);
  return res.body as User;
}

async function createTicketViaApi(
  userId: number,
  body: Record<string, unknown> = { title: 'Fix login bug' },
): Promise<Ticket> {
  const res = await request(app)
    .post('/tickets')
    .set('X-User-Id', String(userId))
    .send(body);
  expect(res.status).toBe(201);
  return res.body as Ticket;
}

describe('Part 1: API Integration Tests', () => {
  describe('auth middleware', () => {
    it('returns 401 when X-User-Id is missing on POST /users', async () => {
      const res = await request(app)
        .post('/users')
        .send({ name: 'Alice', email: 'alice@example.com' });

      expect(res.status).toBe(401);
      expect(res.body).toHaveProperty('error');
    });

    it('returns 401 when X-User-Id is missing on POST /tickets', async () => {
      const res = await request(app)
        .post('/tickets')
        .send({ title: 'No auth' });

      expect(res.status).toBe(401);
      expect(res.body).toHaveProperty('error');
    });

    it('returns 401 when X-User-Id is missing on PATCH /tickets/:id/status', async () => {
      const user = await createUserViaApi();
      const ticket = await createTicketViaApi(user.id);

      const res = await request(app)
        .patch(`/tickets/${ticket.id}/status`)
        .send({ status: 'DONE' });

      expect(res.status).toBe(401);
    });

    it.each(['abc', '0', '-5', '1.5', '', '1e3', '99999999999'])(
      'returns 401 when X-User-Id is not a valid id (%j)',
      async (badId) => {
        const res = await request(app)
          .post('/tickets')
          .set('X-User-Id', badId)
          .send({ title: 'Bad header' });

        expect(res.status).toBe(401);
      },
    );

    it('does not require X-User-Id on GET routes', async () => {
      expect((await request(app).get('/users')).status).toBe(200);
      expect((await request(app).get('/tickets')).status).toBe(200);
    });

    it('returns 401 when X-User-Id does not belong to an existing user', async () => {
      const res = await request(app)
        .post('/tickets')
        .set('X-User-Id', '4242')
        .send({ title: 'Ghost user' });

      expect(res.status).toBe(401);
    });
  });

  describe('users', () => {
    it('creates a user and returns 201 with the new record', async () => {
      const res = await request(app)
        .post('/users')
        .set('X-User-Id', BOOTSTRAP_ID)
        .send({ name: 'Alice', email: 'alice@example.com' });

      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({
        id: expect.any(Number),
        name: 'Alice',
        email: 'alice@example.com',
      });
      expect(res.body).toHaveProperty('created_at');
    });

    it('returns 400 for an invalid user payload', async () => {
      const bad: Record<string, unknown>[] = [
        {},
        { name: 'Alice' },
        { email: 'alice@example.com' },
        { name: '   ', email: 'alice@example.com' },
        { name: 'Alice', email: 'not-an-email' },
        { name: 123, email: 'alice@example.com' },
        { name: 'Alice', email: ['alice@example.com'] },
      ];

      for (const payload of bad) {
        const res = await request(app)
          .post('/users')
          .set('X-User-Id', BOOTSTRAP_ID)
          .send(payload);
        expect(res.status, JSON.stringify(payload)).toBe(400);
        expect(res.body).toHaveProperty('error');
      }
    });

    it('returns 400 for malformed JSON', async () => {
      const res = await request(app)
        .post('/users')
        .set('X-User-Id', BOOTSTRAP_ID)
        .set('Content-Type', 'application/json')
        .send('{"name": "Alice",');

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error');
    });

    it('returns 409 when the email is already taken', async () => {
      await createUserViaApi();

      const res = await request(app)
        .post('/users')
        .set('X-User-Id', BOOTSTRAP_ID)
        .send({ name: 'Alice Again', email: 'alice@example.com' });

      expect(res.status).toBe(409);
    });

    it('lists all users', async () => {
      await createUserViaApi({ name: 'Alice', email: 'alice@example.com' });
      await createUserViaApi({ name: 'Bob', email: 'bob@example.com' });

      const res = await request(app).get('/users');

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(2);
      expect(res.body.map((u: User) => u.name)).toEqual(['Alice', 'Bob']);
    });

    it('returns an empty array when there are no users', async () => {
      const res = await request(app).get('/users');

      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });

    it('fetches a single user by id', async () => {
      const created = await createUserViaApi();

      const res = await request(app).get(`/users/${created.id}`);

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        id: created.id,
        name: 'Alice',
        email: 'alice@example.com',
      });
    });

    it('returns 404 for a user that does not exist', async () => {
      const res = await request(app).get('/users/9999');

      expect(res.status).toBe(404);
      expect(res.body).toHaveProperty('error');
    });

    it('returns 404 for an id too large to exist, and 400 for a malformed id', async () => {
      expect((await request(app).get('/users/99999999999')).status).toBe(404);
      expect((await request(app).get('/users/abc')).status).toBe(400);
      expect((await request(app).get('/users/0')).status).toBe(400);
    });
  });

  describe('tickets', () => {
    it('creates a ticket with creator_id taken from X-User-Id', async () => {
      const user = await createUserViaApi();

      const res = await request(app)
        .post('/tickets')
        .set('X-User-Id', String(user.id))
        .send({ title: 'Fix login bug', description: 'Users cannot log in' });

      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({
        id: expect.any(Number),
        title: 'Fix login bug',
        description: 'Users cannot log in',
        status: 'TODO',
        creator_id: user.id,
        assignee_id: null,
      });
    });

    it('ignores a creator_id sent in the body and trusts the header', async () => {
      const alice = await createUserViaApi();
      const bob = await createUserViaApi({
        name: 'Bob',
        email: 'bob@example.com',
      });

      const res = await request(app)
        .post('/tickets')
        .set('X-User-Id', String(alice.id))
        .send({ title: 'Sneaky', creator_id: bob.id });

      expect(res.status).toBe(201);
      expect(res.body.creator_id).toBe(alice.id);
    });

    it('allows a ticket without a description', async () => {
      const user = await createUserViaApi();

      const ticket = await createTicketViaApi(user.id, {
        title: 'Just a title',
      });

      expect(ticket.description).toBeNull();
    });

    it('returns 400 for an invalid ticket payload', async () => {
      const user = await createUserViaApi();
      const bad: Record<string, unknown>[] = [
        {},
        { description: 'no title' },
        { title: '' },
        { title: '   ' },
        { title: 42 },
        { title: 'x'.repeat(256) },
        { title: 'ok', description: 42 },
      ];

      for (const payload of bad) {
        const res = await request(app)
          .post('/tickets')
          .set('X-User-Id', String(user.id))
          .send(payload);
        expect(res.status, JSON.stringify(payload)).toBe(400);
        expect(res.body).toHaveProperty('error');
      }
    });

    it('fetches a single ticket by id', async () => {
      const user = await createUserViaApi();
      const created = await createTicketViaApi(user.id);

      const res = await request(app).get(`/tickets/${created.id}`);

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        id: created.id,
        title: 'Fix login bug',
      });
    });

    it('returns 404 for a ticket that does not exist', async () => {
      const res = await request(app).get('/tickets/9999');

      expect(res.status).toBe(404);
      expect(res.body).toHaveProperty('error');
    });

    it('returns 400 for a malformed ticket id', async () => {
      expect((await request(app).get('/tickets/abc')).status).toBe(400);
      expect((await request(app).get('/tickets/-1')).status).toBe(400);
    });

    it('returns a JSON 404 for an unknown route', async () => {
      const res = await request(app).get('/nope');

      expect(res.status).toBe(404);
      expect(res.body).toHaveProperty('error');
    });
  });

  describe('GET /tickets pagination and filtering', () => {
    const STATUSES = ['TODO', 'IN_PROGRESS', 'DONE'];

    /** Seeds 25 tickets: 9 TODO, 8 IN_PROGRESS, 8 DONE (ids 1..25). */
    async function seedTickets(): Promise<void> {
      const user = await createUser({
        name: 'Seeder',
        email: 'seeder@example.com',
      });
      for (let i = 0; i < 25; i++) {
        await createTicket({
          title: `Ticket ${i + 1}`,
          creator_id: user.id,
          status: STATUSES[i % 3],
          description: null,
        });
      }
    }

    it('returns every ticket when no query params are given', async () => {
      await seedTickets();

      const res = await request(app).get('/tickets');

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(25);
    });

    it('honors limit', async () => {
      await seedTickets();

      const res = await request(app).get('/tickets?limit=10');

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(10);
      expect(res.body.map((t: Ticket) => t.id)).toEqual([
        1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
      ]);
    });

    it('honors offset to fetch subsequent pages without overlap', async () => {
      await seedTickets();

      const page1 = await request(app).get('/tickets?limit=10&offset=0');
      const page2 = await request(app).get('/tickets?limit=10&offset=10');
      const page3 = await request(app).get('/tickets?limit=10&offset=20');

      expect(page1.body).toHaveLength(10);
      expect(page2.body).toHaveLength(10);
      expect(page3.body).toHaveLength(5);
      expect(page2.body[0].id).toBe(11);
      expect(page3.body[0].id).toBe(21);

      const allIds = [...page1.body, ...page2.body, ...page3.body].map(
        (t: Ticket) => t.id,
      );
      expect(new Set(allIds).size).toBe(25);
    });

    it('returns an empty array when offset is past the end', async () => {
      await seedTickets();

      const res = await request(app).get('/tickets?limit=10&offset=100');

      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });

    it('filters by status', async () => {
      await seedTickets();

      const todo = await request(app).get('/tickets?status=TODO');
      const inProgress = await request(app).get('/tickets?status=IN_PROGRESS');
      const done = await request(app).get('/tickets?status=DONE');

      expect(todo.body).toHaveLength(9);
      expect(inProgress.body).toHaveLength(8);
      expect(done.body).toHaveLength(8);
      expect(todo.body.every((t: Ticket) => t.status === 'TODO')).toBe(true);
    });

    it('combines status filtering with pagination', async () => {
      await seedTickets();

      const res = await request(app).get(
        '/tickets?status=TODO&limit=4&offset=8',
      );

      expect(res.status).toBe(200);
      // 9 TODO tickets total, so skipping 8 leaves exactly 1
      expect(res.body).toHaveLength(1);
      expect(res.body[0].status).toBe('TODO');
    });

    it('returns 400 for invalid query params', async () => {
      const badQueries = [
        '?limit=abc',
        '?limit=0',
        '?limit=-1',
        '?limit=1.5',
        '?limit=',
        '?offset=-1',
        '?offset=abc',
        '?status=NOPE',
        '?status=todo',
        '?limit=1&limit=2',
      ];

      for (const query of badQueries) {
        const res = await request(app).get(`/tickets${query}`);
        expect(res.status, query).toBe(400);
        expect(res.body).toHaveProperty('error');
      }
    });
  });

  describe('PATCH /tickets/:id/status', () => {
    it('updates the status and returns 200 with the updated ticket', async () => {
      const user = await createUserViaApi();
      const ticket = await createTicketViaApi(user.id);

      const res = await request(app)
        .patch(`/tickets/${ticket.id}/status`)
        .set('X-User-Id', String(user.id))
        .send({ status: 'IN_PROGRESS' });

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        id: ticket.id,
        status: 'IN_PROGRESS',
      });

      const fetched = await request(app).get(`/tickets/${ticket.id}`);
      expect(fetched.body.status).toBe('IN_PROGRESS');
    });

    it('returns 404 when the ticket does not exist', async () => {
      const res = await request(app)
        .patch('/tickets/9999/status')
        .set('X-User-Id', '1')
        .send({ status: 'DONE' });

      expect(res.status).toBe(404);
    });

    it('returns 400 for an invalid or missing status', async () => {
      const user = await createUserViaApi();
      const ticket = await createTicketViaApi(user.id);

      for (const payload of [{}, { status: 'BLOCKED' }, { status: 5 }]) {
        const res = await request(app)
          .patch(`/tickets/${ticket.id}/status`)
          .set('X-User-Id', String(user.id))
          .send(payload);
        expect(res.status, JSON.stringify(payload)).toBe(400);
      }
    });

    it('returns 400 for a malformed ticket id', async () => {
      const res = await request(app)
        .patch('/tickets/abc/status')
        .set('X-User-Id', '1')
        .send({ status: 'DONE' });

      expect(res.status).toBe(400);
    });
  });
});
