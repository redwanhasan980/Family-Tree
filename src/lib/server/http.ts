import 'server-only';

import { logger } from '@/lib/logger';

import type { z } from 'zod';

/**
 * Error codes returned by Route Handlers (DESIGN §10.1). The client maps `code` to a
 * localized message; `message` is for developers only and never contains user data.
 */
export const ERROR_STATUS = {
  invalid_request: 400,
  unauthenticated: 401,
  forbidden: 403,
  guest_not_allowed: 403,
  /** The action needs a fresh sign-in (account deletion, DESIGN §9.6). */
  reauth_required: 403,
  not_found: 404,
  conflict: 409,
  expired: 410,
  rate_limited: 429,
  internal: 500,
  /** A service this server isn't set up for (photos without Cloudinary keys). */
  unavailable: 503,
} as const;

export type ErrorCode = keyof typeof ERROR_STATUS;

export interface ErrorBody {
  error: { code: ErrorCode; message: string };
}

export class HttpError extends Error {
  readonly status: number;

  constructor(
    readonly code: ErrorCode,
    message: string = code,
  ) {
    super(message);
    this.name = 'HttpError';
    this.status = ERROR_STATUS[code];
  }
}

const NO_STORE = { 'Cache-Control': 'no-store' };

/** JSON success response. API responses are per user, so they are never cached. */
export function json<T>(data: T, init: { status?: number } = {}): Response {
  return Response.json(data, { status: init.status ?? 200, headers: NO_STORE });
}

export function errorResponse(error: HttpError): Response {
  const body: ErrorBody = { error: { code: error.code, message: error.message } };
  return Response.json(body, { status: error.status, headers: NO_STORE });
}

/**
 * Reads a JSON body and validates it. Schemas should be strict objects, so unknown keys
 * are rejected (DESIGN §10.1).
 */
export async function readJson<S extends z.ZodType>(
  request: Request,
  schema: S,
): Promise<z.infer<S>> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw new HttpError('invalid_request', 'Body must be JSON.');
  }
  const result = schema.safeParse(body);
  if (!result.success) {
    const paths = result.error.issues.map((issue) => issue.path.join('.') || '(root)');
    throw new HttpError('invalid_request', `Invalid fields: ${[...new Set(paths)].join(', ')}`);
  }
  return result.data;
}

type Handler<C> = (request: Request, context: C) => Promise<Response>;

/**
 * Wraps a Route Handler so every failure returns `{ error: { code, message } }`.
 * Unexpected errors are logged (codes only) and reported as `internal`.
 */
export function route<C>(name: string, handler: Handler<C>): Handler<C> {
  return async (request, context) => {
    try {
      return await handler(request, context);
    } catch (error) {
      if (error instanceof HttpError) return errorResponse(error);
      logger.error(`api.${name}`, error);
      return errorResponse(new HttpError('internal', 'Something went wrong.'));
    }
  };
}
