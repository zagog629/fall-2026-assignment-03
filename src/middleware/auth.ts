import { Request, Response, NextFunction } from 'express';
import { INT4_MAX } from '../utils/validation.js';

/**
 * Authentication middleware for routes that create or modify data.
 *
 * Reads the `X-User-Id` header, requires it to be a positive integer, and
 * stores it on `res.locals.userId` for downstream handlers. Responds with
 * 401 Unauthorized if the header is missing or not a valid id.
 *
 * Note: this only checks the header's shape, it does not verify that the user
 * exists (which is what lets you bootstrap the very first user via POST /users).
 */
export function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const header = req.header('X-User-Id')?.trim();

  if (header === undefined || !/^\d+$/.test(header)) {
    res.status(401).json({ error: 'Missing or invalid X-User-Id header' });
    return;
  }

  const userId = Number(header);
  if (!Number.isSafeInteger(userId) || userId < 1 || userId > INT4_MAX) {
    res.status(401).json({ error: 'Missing or invalid X-User-Id header' });
    return;
  }

  res.locals.userId = userId;
  next();
}

export default authMiddleware;
