import { Request, Response, NextFunction } from 'express';
import { HttpError } from '../utils/http.js';

/** Responds 404 (JSON) for any request that did not match a route. */
export function notFoundHandler(_req: Request, res: Response): void {
  res.status(404).json({ error: 'Not found' });
}

/**
 * Central error handler. Converts HttpErrors and body-parser errors (such as
 * malformed JSON) into JSON responses and hides details of unexpected errors.
 */
export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (res.headersSent) {
    next(err);
    return;
  }

  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message });
    return;
  }

  if (typeof err === 'object' && err !== null) {
    const { type, status } = err as { type?: unknown; status?: unknown };
    if (type === 'entity.parse.failed') {
      res.status(400).json({ error: 'Request body contains invalid JSON' });
      return;
    }
    if (typeof status === 'number' && status >= 400 && status < 500) {
      res.status(status).json({ error: 'Bad request' });
      return;
    }
  }

  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
}
