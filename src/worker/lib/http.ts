import { HTTPException } from 'hono/http-exception';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import type { ApiErrorCode } from '../../shared/api.ts';

// Thrown anywhere in a handler; app.onError turns it into the JSON error body
// the client expects. Messages are written for players, so keep them plain
// and never put anything secret in one.
export class ApiError extends HTTPException {
  constructor(
    status: ContentfulStatusCode,
    public readonly code: ApiErrorCode,
    message: string,
  ) {
    super(status, { message });
  }
}

export const unauthenticated = () =>
  new ApiError(401, 'unauthenticated', 'Sign in to continue.');

export const forbidden = (message = 'You do not have access to that.') =>
  new ApiError(403, 'forbidden', message);

// Postgres unique_violation. postgres-js puts the code on the error; Drizzle
// may wrap that error and keep the original as `cause`
export function isUniqueViolation(err: unknown): boolean {
  for (let e: unknown = err; e && typeof e === 'object'; e = (e as { cause?: unknown }).cause) {
    if ((e as { code?: unknown }).code === '23505') return true;
  }
  return false;
}
