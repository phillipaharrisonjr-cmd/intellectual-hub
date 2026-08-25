import { useCallback, useEffect, useState, type ReactNode } from 'react';
import Sidebar from '../components/Sidebar';
import { api, money, shortDate } from '../api';
import type { CustomerResponse, Opportunity, ReferralPriority } from '../types';

const PRIORITIES: { value: ReferralPriority; label: string }[] = [
  { value: 'this_week', label: 'This week' },
  { value: 'this_month', label: 'This month' },
  { value: 'later', label: 'Later' },
];

function StepArrow() {
  return (
    <svg
      className="shrink-0"
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="var(--arrow)"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M5 12h14" />
      <path d="M13 6l6 6-6 6" />
    </svg>
  );
}

function CheckIcon({ tone }: { tone: 'held' | 'gap' }) {
  const stroke = tone === 'held' ? 'var(--green-text)' : 'var(--amber-text)';
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {tone === 'held' ? <path d="M20 6L9 17l-5-5" /> : (
        <>
          <path d="M12 5v14" />
          <path d="M5 12h14" />
        </>
      )}
    </svg>
  );
}

function Card({ title, aside, children }: { title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <div className="card">
      <div className="flex items-start justify-between gap-3">
        <h2 className="card-title">{title}</h2>
        {aside}
      </div>
      {children}
    </div>
  );
}

export default function CustomerScreen({ customerId }: { customerId: string }) {
  const [data, setData] = useState<CustomerResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [partner, setPartner] = useState('');
  const [priority, setPriority] = useState<ReferralPriority>('this_month');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setData(await api<CustomerResponse>(`/api/customers/${encodeURIComponent(customerId)}`));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'failed to load');
    }
  }, [customerId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (error) {
    return (
      <Shell active="Customers">
        <p className="text-sm text-[color:var(--muted)]">Could not load this customer: {error}</p>
      </Shell>
    );
  }
  if (!data) {
    return (
      <Shell active="Customers">
        <p className="text-sm text-[color:var(--muted)]">Loading…</p>
      </Shell>
    );
  }

  const { customer } = data;
  const opportunities = [...data.opportunities].sort((a, b) => b.projection.annualRevenue - a.projection.annualRevenue);
  const primary: Opportunity | undefined = opportunities[0];

  const refer = async () => {
    if (!primary) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const body: Record<string, string> = { opportunityId: primary.id, priority };
      if (partner.trim()) body.partner = partner.trim();
      await api(`/api/referrals`, { method: 'POST', body: JSON.stringify(body) });
      await load();
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : 'referral failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Shell active="Customers">
      <div className="flex items-end justify-between">
        <div>
          <div className="text-[12.5px] font-medium text-[color:var(--muted)]">
            <a href="/">Opportunities</a>
            <span>&nbsp; / &nbsp;</span>
            <span className="text-[color:var(--ink)]">{customer.name}</span>
          </div>
          <div className="mt-1.5 flex items-center gap-3">
            <h1 className="m-0 text-[28px] font-bold tracking-tight">{customer.name}</h1>
            {primary && <span className="badge-confidence">{primary.confidence} confidence</span>}
          </div>
          <div className="mt-1 text-[13.5px] text-[color:var(--muted)]">
            {[customer.industry, customer.officer && `Officer ${customer.officer}`, `${customer.heldAtBank.length} products with us`]
              .filter(Boolean)
              .join(' · ')}
          </div>
        </div>
      </div>

      {!primary ? (
        <div className="card mt-4 text-sm text-[color:var(--muted)]">
          No open opportunities for this customer. Upload ACH activity and run a scan.
        </div>
      ) : (
        <div className="mt-4 grid grow grid-cols-[minmax(0,1fr)_340px] items-start gap-4">
          {/* Left column */}
          <div className="flex min-w-0 flex-col gap-4">
            <Card
              title="Relationship map"
              aside={
                <div className="text-[12.5px] text-[color:var(--muted)]">
                  {customer.heldAtBank.length} products with us · {opportunities.length} with a competitor
                </div>
              }
            >
              <div className="mt-3 flex flex-wrap gap-2">
                {customer.heldAtBank.map((p) => (
                  <span key={p} className="chip">
                    <CheckIcon tone="held" />
                    {p}
                  </span>
                ))}
                {opportunities.map((o) => (
                  <span key={o.id} className="chip chip-gap">
                    <CheckIcon tone="gap" />
                    {`${o.product} · ${o.heldElsewhereAt}`}
                  </span>
                ))}
              </div>
            </Card>

            <Card
              title={`What we are missing on ${primary.product.toLowerCase()}`}
              aside={
                <div className="text-[12.5px] text-[color:var(--muted)]">Assumptions v{primary.projection.assumptionsVersion}</div>
              }
            >
              <div className="mt-0.5 text-[12.5px] text-[color:var(--muted)]">
                Projection from {primary.flow.days} days of {primary.heldElsewhereAt} {primary.flow.direction}s,{' '}
                {shortDate(primary.flow.from)} – {shortDate(primary.flow.to)}
              </div>
              <div className="mt-4 flex items-center gap-2.5">
                {primary.projection.steps.map((s, i) => (
                  <div key={s.label} className="contents">
                    {i > 0 && <StepArrow />}
                    <div className={`step${i === primary.projection.steps.length - 1 ? ' step-final' : ''}`}>
                      <div className="label">{s.label}</div>
                      <div className="val num">{money(s.value)}</div>
                      <div className="sub">{s.note}</div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-3.5 flex gap-6 border-t border-[color:var(--line)] pt-3.5 text-[12.5px] text-[color:var(--muted)]">
                {primary.projection.depositUplift > 0 && (
                  <div>
                    <span className="font-semibold text-[color:var(--ink)]">+ {money(primary.projection.depositUplift)}</span>{' '}
                    settlement-balance deposit uplift
                  </div>
                )}
                <div>
                  <span className="font-semibold text-[color:var(--ink)]">5-yr value</span>{' '}
                  {money(primary.projection.fiveYearValue)} at 100% retention
                </div>
                <div>
                  <span className="font-semibold text-[color:var(--ink)]">Model</span> {primary.projection.modelLabel}
                </div>
              </div>
            </Card>

            <div className="card grid grid-cols-[minmax(0,1fr)_240px] gap-6">
              <div>
                <h2 className="card-title">ACH evidence</h2>
                <div className="mt-0.5 text-[12.5px] text-[color:var(--muted)]">
                  Most recent {primary.flow.direction}s matching this descriptor
                </div>
                <table className="dn-table mt-3">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Descriptor</th>
                      <th>Direction</th>
                      <th className="text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {primary.evidence.map((row, i) => (
                      <tr key={i}>
                        <td className="num">{shortDate(row.date)}</td>
                        <td>
                          <span className="desc">{row.descriptor}</span>
                        </td>
                        <td className="capitalize">{row.direction}</td>
                        <td className="num text-right font-semibold">{money(row.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[color:var(--muted)]">
                  Flow in window
                </div>
                <div className="mt-3 flex flex-col gap-2 text-[13px]">
                  <div className="flex justify-between">
                    <span className="text-[color:var(--muted)]">Total</span>
                    <span className="num font-semibold">{money(primary.flow.total)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[color:var(--muted)]">Occurrences</span>
                    <span className="num font-semibold">{primary.flow.count}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[color:var(--muted)]">Window</span>
                    <span className="num font-semibold">
                      {shortDate(primary.flow.from)} – {shortDate(primary.flow.to)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[color:var(--muted)]">Score</span>
                    <span className="num font-semibold">{primary.score}/100</span>
                  </div>
                </div>
                <div className="mt-3.5 text-[12.5px] leading-relaxed text-[color:var(--muted)]">
                  Evidence shows the {Math.min(primary.evidence.length, 8)} most recent rows; the projection uses every row in
                  the window.
                </div>
              </div>
            </div>
          </div>

          {/* Right column */}
          <div className="flex min-w-0 flex-col gap-4">
            <Card title="Why we are confident">
              <div className="mt-3 flex flex-col gap-2.5 text-[13px] leading-snug">
                <div>Descriptor matched the {primary.heldElsewhereAt} pattern — score {primary.score}/100</div>
                <div>
                  {primary.customerInCore
                    ? `In the core file with ${customer.heldAtBank.length} products, none covering ${primary.product.toLowerCase()}`
                    : 'Customer not found in the core file yet'}
                </div>
                <div>
                  {primary.flow.count} matching {primary.flow.direction}s in the {primary.flow.days}-day window
                </div>
                {primary.benchmark && primary.benchmark.status !== 'unknown' && primary.benchmark.band && (
                  <div className={primary.benchmark.status === 'above' ? 'font-semibold text-[color:var(--amber-text)]' : ''}>
                    Annualized flow {money(primary.benchmark.annualizedFlow)} is {primary.benchmark.status === 'above' ? 'above' : primary.benchmark.status === 'below' ? 'below' : 'inside'} the
                    plausible band of {money(primary.benchmark.band.min)}–{money(primary.benchmark.band.max)}
                    {primary.benchmark.basis === 'customer_revenue'
                      ? ' for this customer’s revenue'
                      : primary.benchmark.industryLabel
                        ? ` for ${primary.benchmark.industryLabel.toLowerCase()}`
                        : ''}
                    {primary.benchmark.status === 'above' ? ' — verify the descriptor match before referring' : ''}
                  </div>
                )}
                {primary.benchmark && primary.benchmark.status === 'unknown' && (
                  <div className="text-[color:var(--muted)]">
                    No peer benchmark — add SIC/NAICS to the core file for this customer
                  </div>
                )}
              </div>
            </Card>

            <Card title="How this was computed">
              <p className="mt-3 mb-0 text-[13px] leading-relaxed text-[color:var(--navy-500)]">{primary.explanation}</p>
            </Card>

            <Card title="Route this opportunity">
              {primary.status !== 'open' ? (
                <div className="mt-3 text-[13px] leading-relaxed">
                  <span className="font-semibold">Referred</span> — status: {primary.status}
                  {primary.referralId ? ` · ${primary.referralId}` : ''}. Approval-gated before any CRM push.
                </div>
              ) : (
                <>
                  <div className="mt-3 text-xs font-semibold text-[color:var(--muted)]">Product partner</div>
                  <input
                    className="mt-1.5 w-full rounded-md border border-[color:var(--line-strong)] bg-[color:var(--surface)] px-3 py-2.5 text-[13.5px]"
                    placeholder="e.g. Merchant Services"
                    value={partner}
                    onChange={(e) => setPartner(e.target.value)}
                  />
                  <div className="mt-3 text-xs font-semibold text-[color:var(--muted)]">Priority</div>
                  <div className="mt-1.5 flex gap-2">
                    {PRIORITIES.map((p) => (
                      <button
                        key={p.value}
                        type="button"
                        className={`pill${priority === p.value ? ' pill-active' : ''}`}
                        onClick={() => setPriority(p.value)}
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
                  <button type="button" className="btn btn-primary mt-3.5 w-full" onClick={() => void refer()} disabled={submitting}>
                    Refer this opportunity
                  </button>
                  {submitError && <div className="mt-2 text-[12.5px] text-[color:var(--amber-text)]">{submitError}</div>}
                  <div className="mt-3.5 border-t border-[color:var(--line)] pt-3 text-[12.5px] leading-relaxed text-[color:var(--muted)]">
                    Window {shortDate(primary.flow.from)} – {shortDate(primary.flow.to)}
                    {customer.officer ? ` · Credit for the win goes to ${customer.officer}` : ''}
                  </div>
                </>
              )}
            </Card>
          </div>
        </div>
      )}
    </Shell>
  );
}

function Shell({ active, children }: { active: string; children: ReactNode }) {
  return (
    <div className="flex min-h-screen bg-[color:var(--paper)]">
      <Sidebar active={active} />
      <main className="flex min-w-0 grow flex-col px-9 pb-7 pt-6">{children}</main>
    </div>
  );
}
