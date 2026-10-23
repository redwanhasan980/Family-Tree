import 'client-only';

import { getToken } from 'firebase/app-check';

import { getFirebaseClient } from '@/lib/firebase/client';

/**
 * Calls the app's own Route Handlers (DESIGN §10) as the signed-in user. Failures throw an
 * `ApiError` whose `code` is the server's error code (`not_found`, `expired`, …) or
 * `network` when the request never reached the server.
 */
export class ApiError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
    message: string = code,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

interface ErrorBody {
  error?: { code?: unknown; message?: unknown };
}

export async function callApi<T>(
  path: `/api/${string}`,
  { method = 'POST', body }: { method?: 'POST' | 'DELETE'; body?: unknown } = {},
): Promise<T> {
  const { auth, appCheck } = getFirebaseClient();
  const user = auth.currentUser;
  if (!user) throw new ApiError('unauthenticated', 401);

  const headers: Record<string, string> = { Authorization: `Bearer ${await user.getIdToken()}` };
  if (appCheck) headers['X-Firebase-AppCheck'] = (await getToken(appCheck)).token;
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  let response: Response;
  try {
    response = await fetch(path, {
      method,
      headers,
      ...(body !== undefined && { body: JSON.stringify(body) }),
    });
  } catch {
    throw new ApiError('network', 0);
  }
  const data = (await response.json().catch(() => null)) as unknown;
  if (!response.ok) {
    const error = (data as ErrorBody | null)?.error;
    throw new ApiError(
      typeof error?.code === 'string' ? error.code : 'internal',
      response.status,
      typeof error?.message === 'string' ? error.message : undefined,
    );
  }
  return data as T;
}
