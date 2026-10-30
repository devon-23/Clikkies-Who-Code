import type { ApiErrorBody, ApiErrorCode } from '../../shared/api.ts';
import { supabase } from './supabase.ts';

export class ApiClientError extends Error {
  readonly status: number;
  readonly code: ApiErrorCode | 'network';
  readonly requestId?: string;
  /** the rest of the error body -- e.g. `current` on a save conflict */
  readonly body: Record<string, unknown>;

  constructor(status: number, code: ApiErrorCode | 'network', message: string, requestId?: string, body: Record<string, unknown> = {}) {
    super(message);
    this.status = status;
    this.code = code;
    this.requestId = requestId;
    this.body = body;
  }
}

// Calls our API with the current session's token attached. supabase-js keeps
// the token fresh on its own, so it is read again on every call.
export async function api<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const headers = new Headers({ accept: 'application/json' });
  const token = supabase ? (await supabase.auth.getSession()).data.session?.access_token : undefined;
  if (token) headers.set('authorization', `Bearer ${token}`);
  if (init.body !== undefined) headers.set('content-type', 'application/json');

  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method: init.method ?? 'GET',
      headers,
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });
  } catch {
    throw new ApiClientError(0, 'network', 'Could not reach the archive. Check your connection and try again.');
  }

  if (res.status === 204) return undefined as T;

  const data: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const err = (data as ApiErrorBody | null)?.error;
    throw new ApiClientError(res.status, err?.code ?? 'internal', err?.message ?? 'Something went wrong.', err?.requestId, (data ?? {}) as Record<string, unknown>);
  }
  return data as T;
}

export function errorMessage(err: unknown): string {
  if (err instanceof ApiClientError) {
    return err.requestId ? `${err.message} (ref ${err.requestId.slice(0, 8)})` : err.message;
  }
  if (err instanceof Error) return err.message;
  return 'Something went wrong.';
}
