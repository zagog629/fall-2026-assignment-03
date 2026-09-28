import { Request, Response, NextFunction, RequestHandler } from 'express';

/**
 * An error that carries an HTTP status code. Throw it from a route handler and
 * the central error handler turns it into a `{ "error": "..." }` JSON response.
 */
export class HttpError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
  }
}

/**
 * Express 4 does not catch rejected promises from async handlers. This wrapper
 * forwards them to `next()` so the error handler sees them.
 */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
): RequestHandler {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
}

/** True when a Postgres error is a unique-constraint violation (SQLSTATE 23505). */
export function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code: unknown }).code === '23505'
  );
}
