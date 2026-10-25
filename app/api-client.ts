export const NETWORK_ERROR = '인터넷 연결이 불안정해요. 연결을 확인한 뒤 다시 시도해주세요.';
export type ApiError = Error & { status?: number };
// JSON request helper for client components: a body means a write (POST by default), no body means a fresh GET.
// Errors carry `status`; a 401 means the session ended, so callers can offer a login link.
export async function api<T = Record<string, unknown>>(path: string, body?: unknown, method = 'POST'): Promise<T> {
  const response = await fetch(
    path,
    body
      ? { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
      : { cache: 'no-store' },
  ).catch(() => {
    throw new Error(NETWORK_ERROR);
  });
  const data = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) {
    const error: ApiError = new Error(
      response.status === 401 && body
        ? '로그인이 끝났어요. 다시 로그인해주세요.'
        : data.error || '요청을 처리하지 못했어요. 잠시 후 다시 시도해주세요.',
    );
    error.status = response.status;
    throw error;
  }
  return data;
}
