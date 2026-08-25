// Who is using the portal. Role-based demo identity until SSO/JWT lands — the
// backend treats the role header as trusted, so this is a convenience, not
// security (see backend/README.md, Roles).
export type Role = 'analyst' | 'approver' | 'executive' | 'admin';

export interface Identity {
  role: Role;
  name: string;
}

export const ROLES: Role[] = ['analyst', 'approver', 'executive', 'admin'];
export const ROLE_LABELS: Record<Role, string> = {
  analyst: 'Banker',
  approver: 'Approver',
  executive: 'Executive',
  admin: 'Admin',
};

const KEY = 'denali.identity';
const DEFAULT: Identity = { role: 'analyst', name: 'Dana Whitfield' };

export function getIdentity(): Identity {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed: unknown = JSON.parse(raw);
      if (
        parsed &&
        typeof parsed === 'object' &&
        ROLES.includes((parsed as Identity).role) &&
        typeof (parsed as Identity).name === 'string' &&
        (parsed as Identity).name.trim()
      ) {
        return { role: (parsed as Identity).role, name: (parsed as Identity).name.trim().slice(0, 80) };
      }
    }
  } catch {
    // storage unavailable — fall through to the default
  }
  return DEFAULT;
}

export function setIdentity(identity: Identity): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(identity));
  } catch {
    // storage unavailable — identity lasts for this page only
  }
}
