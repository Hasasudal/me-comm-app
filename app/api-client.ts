// JSON request helper for client components: a body means a write (POST by default), no body means a fresh GET.
export async function api<T = Record<string, unknown>>(path: string, body?: unknown, method = 'POST'): Promise<T> {
  const response = await fetch(
    path,
    body
      ? { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
      : { cache: 'no-store' },
  );
  const data = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) throw new Error(data.error || '요청을 처리하지 못했습니다. 잠시 후 다시 시도해주세요.');
  return data;
}
