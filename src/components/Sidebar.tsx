const NAV = [
  {
    group: 'Daily',
    items: [
      { label: 'Dashboard', href: '/' },
      { label: 'Upload Center', href: '#' },
      { label: 'Customers', href: '#' },
    ],
  },
  {
    group: 'Intelligence',
    items: [
      { label: 'ACH Intelligence', href: '#' },
      { label: 'Income Projections', href: '#' },
      { label: 'Merchant Residuals', href: '#' },
    ],
  },
  {
    group: 'Pipeline',
    items: [
      { label: 'Pipeline', href: '#' },
      { label: 'Referrals', href: '#' },
      { label: 'Approval Queue', href: '#' },
      { label: 'Executive Reports', href: '#' },
    ],
  },
  {
    group: 'Admin',
    items: [
      { label: 'Settings', href: '#' },
      { label: 'Audit Log', href: '#' },
    ],
  },
];

import { getIdentity, ROLE_LABELS } from '../identity';

export default function Sidebar({ active }: { active: string }) {
  const identity = getIdentity();
  const initials = identity.name
    .split(/\s+/)
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
  return (
    <aside
      className="flex w-[240px] shrink-0 flex-col text-[color:var(--sidebar-ink)]"
      style={{ background: 'linear-gradient(180deg, var(--navy-900) 0%, var(--navy-700) 70%, var(--navy-500) 100%)' }}
    >
      <div className="flex items-center gap-2.5 px-5 pt-5 pb-4">
        <svg width="30" height="30" viewBox="0 0 48 48" aria-hidden="true">
          <defs>
            <linearGradient id="dgr" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="var(--amber-300)" />
              <stop offset="1" stopColor="var(--navy-500)" />
            </linearGradient>
          </defs>
          <path d="M2.9 43.2L13 25.9L17.8 22.1L22.1 4.8L27.4 19.2L31.7 14.9L38.4 26.4L45.1 43.2Z" fill="url(#dgr)" />
          <path d="M22.1 4.8L27.4 19.2L31.7 14.9L38.4 26.4L45.1 43.2L22.1 43.2Z" fill="var(--navy-900)" opacity=".25" />
          <path d="M22.1 4.8L26.6 16.8L24.7 13L23.8 19.2L22.6 12L21.5 20.6L20.2 13L19.2 19.2Z" fill="var(--paper)" />
        </svg>
        <div className="leading-none">
          <div className="text-base font-extrabold tracking-tight" style={{ fontFamily: 'var(--font-display)' }}>
            Denali
          </div>
          <div className="mt-[3px] text-[8px] font-bold uppercase tracking-[0.22em] text-[color:var(--amber-300)]">
            Treasury Intelligence
          </div>
        </div>
      </div>
      <nav className="flex grow flex-col gap-1.5 px-2.5 py-1">
        {NAV.map((g) => (
          <div key={g.group}>
            <div className="navgroup">{g.group}</div>
            {g.items.map((item) => (
              <a key={item.label} className={`nav-item${item.label === active ? ' active' : ''}`} href={item.href}>
                {item.label === active && <span className="navbar-accent" />}
                <span>{item.label}</span>
              </a>
            ))}
          </div>
        ))}
      </nav>
      <a
        className="flex items-center gap-2 border-t border-[color:var(--sidebar-line)] px-3.5 py-3 text-[color:var(--sidebar-ink)] no-underline"
        href="/request-access"
        title="Switch user or request access"
      >
        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-[color:var(--amber-500)] text-[10px] font-bold">
          {initials || 'DW'}
        </div>
        <div className="leading-tight">
          <div className="text-xs font-semibold">{identity.name}</div>
          <div className="text-[10px] text-[color:var(--sidebar-text)]">{ROLE_LABELS[identity.role]}</div>
        </div>
      </a>
    </aside>
  );
}
