import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import {
  createTicket,
  getAllTickets,
  getTicketById,
  updateTicketStatus,
} from '../dal/tickets.js';
import { getUserById } from '../dal/users.js';
import { getTotalHoursForTicket, insertTimeLog } from '../dal/timeLogs.js';
import { HttpError, asyncHandler } from '../utils/http.js';
import {
  asObject,
  fitsInInt4,
  optionalIntQuery,
  optionalString,
  parseId,
  parseStatus,
  requiredPositiveInt,
  requiredString,
} from '../utils/validation.js';

const router = Router();

// GET /tickets?limit=10&offset=0&status=TODO
// Returns all tickets, optionally paginated and filtered by status.
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const limit = optionalIntQuery(req.query.limit, 'limit', 1);
    const offset = optionalIntQuery(req.query.offset, 'offset', 0);
    const status =
      req.query.status === undefined
        ? undefined
        : parseStatus(req.query.status);

    const tickets = await getAllTickets({ limit, offset, status });
    res.status(200).json(tickets);
  }),
);

// GET /tickets/:id - fetch a single ticket, 404 if it does not exist
router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    const ticket = fitsInInt4(id) ? await getTicketById(id) : undefined;

    if (!ticket) {
      throw new HttpError(404, 'Ticket not found');
    }
    res.status(200).json(ticket);
  }),
);

// POST /tickets - create a ticket; creator_id comes from the X-User-Id header
router.post(
  '/',
  authMiddleware,
  asyncHandler(async (req, res) => {
    const body = asObject(req.body);
    const title = requiredString(body, 'title', 255);
    const description = optionalString(body, 'description');

    const creatorId: number = res.locals.userId;
    const creator = await getUserById(creatorId);
    if (!creator) {
      throw new HttpError(401, 'X-User-Id does not match an existing user');
    }

    const ticket = await createTicket({
      title,
      description,
      creator_id: creatorId,
    });
    res.status(201).json(ticket);
  }),
);

// PATCH /tickets/:id/status - update a ticket's status from { status }
router.patch(
  '/:id/status',
  authMiddleware,
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    const body = asObject(req.body);
    const status = parseStatus(body.status);

    const ticket = fitsInInt4(id)
      ? await updateTicketStatus(id, status)
      : undefined;

    if (!ticket) {
      throw new HttpError(404, 'Ticket not found');
    }
    res.status(200).json(ticket);
  }),
);

// POST /tickets/:id/time - log hours against a ticket from { hours };
// user_id comes from the X-User-Id header
router.post(
  '/:id/time',
  authMiddleware,
  asyncHandler(async (req, res) => {
    const ticketId = parseId(req.params.id);
    const body = asObject(req.body);
    const hours = requiredPositiveInt(body, 'hours');

    const userId: number = res.locals.userId;
    const user = await getUserById(userId);
    if (!user) {
      throw new HttpError(401, 'X-User-Id does not match an existing user');
    }

    const ticket = fitsInInt4(ticketId)
      ? await getTicketById(ticketId)
      : undefined;
    if (!ticket) {
      throw new HttpError(404, 'Ticket not found');
    }

    const timeLog = await insertTimeLog(ticketId, userId, hours);
    res.status(201).json(timeLog);
  }),
);

// GET /tickets/:id/time - total hours logged against a ticket (0 if none)
router.get(
  '/:id/time',
  asyncHandler(async (req, res) => {
    const ticketId = parseId(req.params.id);
    const ticket = fitsInInt4(ticketId)
      ? await getTicketById(ticketId)
      : undefined;
    if (!ticket) {
      throw new HttpError(404, 'Ticket not found');
    }

    const totalHours = await getTotalHoursForTicket(ticketId);
    res.status(200).json({ ticket_id: ticketId, total_hours: totalHours });
  }),
);

export default router;
