import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { createUser, getAllUsers, getUserById } from '../dal/users.js';
import { HttpError, asyncHandler, isUniqueViolation } from '../utils/http.js';
import {
  asObject,
  fitsInInt4,
  parseId,
  requiredEmail,
  requiredString,
} from '../utils/validation.js';

const router = Router();

// GET /users - list every user
router.get(
  '/',
  asyncHandler(async (_req, res) => {
    const users = await getAllUsers();
    res.status(200).json(users);
  }),
);

// GET /users/:id - fetch a single user, 404 if it does not exist
router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    const user = fitsInInt4(id) ? await getUserById(id) : undefined;

    if (!user) {
      throw new HttpError(404, 'User not found');
    }
    res.status(200).json(user);
  }),
);

// POST /users - create a user from { name, email }
router.post(
  '/',
  authMiddleware,
  asyncHandler(async (req, res) => {
    const body = asObject(req.body);
    const name = requiredString(body, 'name', 255);
    const email = requiredEmail(body);

    try {
      const user = await createUser({ name, email });
      res.status(201).json(user);
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new HttpError(409, 'A user with that email already exists');
      }
      throw err;
    }
  }),
);

export default router;
