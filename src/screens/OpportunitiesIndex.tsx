import { useEffect, useState, type ReactNode } from 'react';
import Sidebar from '../components/Sidebar';
import { api, money } from '../api';
import type { OpportunitiesResponse } from '../types';

export default function OpportunitiesIndex() {
  const [data, setData] = useState<OpportunitiesResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<OpportunitiesResponse>('/api/opportunities')
      .then(setData)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'failed to load'));
  }, []);

  return (
    <div className="flex min-h-screen bg-[color:var(--paper)]">
      <Sidebar active="Dashboard" />
      <main className="flex min-w-0 grow flex-col px-9 pb-7 pt-6">
        <h1 className="m-0 text-[28px] font-bold tracking-tight">Opportunities</h1>
        <div className="mt-1 text-[13.5px] text-[color:var(--muted)]">
          Ranked by projected annual revenue to the bank
        </div>

        {error && <p className="mt-4 text-sm text-[color:var(--muted)]">Could not load opportunities: {error}</p>}
        {!error && !data && <p className="mt-4 text-sm text-[color:var(--muted)]">Loading…</p>}

        {data && (
          <>
            <div className="mt-4 flex gap-3">
              <Fact label="Open opportunities" value={String(data.summary.opportunities)} />
              <Fact label="Projected / yr" value={money(data.summary.annualRevenue)} />
              <Fact label="High confidence" value={String(data.summary.high)} />
              <Fact label="Customers" value={String(data.summary.customers)} />
            </div>

            {data.opportunities.length === 0 ? (
              <div className="card mt-4 text-sm text-[color:var(--muted)]">
                No opportunities yet. Load the demo book with{' '}
                <span className="desc">cd backend &amp;&amp; npm run seed:demo</span> while the backend is running.
              </div>
            ) : (
              <div className="card mt-4">
                <table className="dn-table">
                  <thead>
                    <tr>
                      <th>Customer</th>
                      <th>Product gap</th>
                      <th>Seen at</th>
                      <th className="text-right">90-day flow</th>
                      <th className="text-right">Projected / yr</th>
                      <th className="text-right">Score</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.opportunities.map((o) => (
                      <tr key={o.id}>
                        <td>
                          <a className="font-semibold" href={`/customers/${encodeURIComponent(o.customerId)}`}>
                            {o.customerName}
                          </a>
                          {o.industry && <div className="text-xs text-[color:var(--muted)]">{o.industry}</div>}
                        </td>
                        <td>{o.product}</td>
                        <td>
                          <span className="desc">{o.heldElsewhereAt}</span>
                        </td>
                        <td className="num text-right">{money(o.flow.total)}</td>
                        <td className="num text-right font-semibold">{money(o.projection.annualRevenue)}</td>
                        <td className="num text-right">{o.score}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="card px-4 py-3">
      <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[color:var(--muted)]">{label}</div>
      <div className="num mt-1 text-xl font-extrabold">{value}</div>
    </div>
  );
}
