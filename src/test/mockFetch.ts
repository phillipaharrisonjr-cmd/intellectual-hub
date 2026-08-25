import { vi } from 'vitest';

export function mockFetch(routes: Record<string, () => { status?: number; body: unknown }>) {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const key = `${init?.method || 'GET'} ${String(input)}`;
    const route = routes[key];
    if (!route) throw new Error(`no mock for ${key}`);
    const { status = 200, body } = route();
    return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  });
}
