// Role comes from these headers until SSO lands (see backend README).
// The demo identity matches the seeded book's officer.
const ROLE = 'analyst';
const USER = 'Dana Whitfield';

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: {
      'x-denali-role': ROLE,
      'x-denali-user': USER,
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...init.headers,
    },
  });
  const data: unknown = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message = (data as { error?: string }).error || `${res.status} ${res.statusText}`;
    throw new Error(message);
  }
  return data as T;
}

export function money(n: number): string {
  if (Math.abs(n) >= 1_000_000) {
    return `$${(n / 1_000_000).toFixed(2).replace(/\.?0+$/, '')}M`;
  }
  return `$${Math.round(n).toLocaleString('en-US')}`;
}

export function shortDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(`${iso}T00:00:00Z`);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}
