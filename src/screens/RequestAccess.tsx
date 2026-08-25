import { useState, type ReactNode } from 'react';
import { api } from '../api';
import { ROLES, ROLE_LABELS, setIdentity, type Role } from '../identity';

const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,24}$/;

const STEPS = ['Organization', 'Your details', 'Role', 'Review'] as const;

const USER_TYPES = [
  { value: 'bank_employee', label: 'Bank employee' },
  { value: 'service_partner', label: 'Service partner' },
  { value: 'other', label: 'Other' },
];

interface Form {
  organization: string;
  userType: string;
  fullName: string;
  workEmail: string;
  title: string;
  requestedRole: Role | '';
  reason: string;
}

const EMPTY: Form = {
  organization: '',
  userType: 'bank_employee',
  fullName: '',
  workEmail: '',
  title: '',
  requestedRole: '',
  reason: '',
};

function Field({ id, label, required, error, children }: { id: string; label: string; required?: boolean; error?: string | null; children: ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <label htmlFor={id} className="text-[11.5px] font-semibold uppercase tracking-[0.06em] text-[color:var(--navy-500)]">
        {label} {required && <span className="text-[color:var(--amber-500)]">*</span>}
      </label>
      {children}
      {error && <div className="text-[12.5px] font-medium text-[color:var(--amber-text)]">{error}</div>}
    </div>
  );
}

const inputClass =
  'w-full rounded border border-[color:var(--line-strong)] bg-[color:var(--surface)] px-4 py-3 text-sm text-[color:var(--ink)]';

export default function RequestAccess({ onSignedIn }: { onSignedIn?: () => void } = {}) {
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<Form>(EMPTY);
  const [errors, setErrors] = useState<Partial<Record<keyof Form, string>>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [signIn, setSignIn] = useState(false);
  const [signInRole, setSignInRole] = useState<Role>('analyst');
  const [signInName, setSignInName] = useState('');

  const set = (key: keyof Form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    setForm((f) => ({ ...f, [key]: e.target.value }));
    setErrors((prev) => ({ ...prev, [key]: undefined }));
  };

  function validateStep(): boolean {
    const next: Partial<Record<keyof Form, string>> = {};
    if (step === 0) {
      if (!form.organization.trim()) next.organization = 'Organization is required';
    } else if (step === 1) {
      if (!form.fullName.trim()) next.fullName = 'Full name is required';
      if (!EMAIL.test(form.workEmail.trim().toLowerCase())) next.workEmail = 'Enter a valid work email address';
    } else if (step === 2) {
      if (!form.requestedRole) next.requestedRole = 'Choose the role you need';
    }
    setErrors(next);
    return Object.values(next).every((v) => !v);
  }

  const continueStep = () => {
    if (validateStep()) setStep((s) => Math.min(s + 1, 3));
  };

  const submit = async () => {
    setSubmitting(true);
    setSubmitError(null);
    try {
      if (honeypotFilled()) {
        setDone('acc_ok'); // bots get the success screen and nothing else
        return;
      }
      const payload = {
        organization: form.organization.trim(),
        userType: form.userType,
        fullName: form.fullName.trim(),
        workEmail: form.workEmail.trim().toLowerCase(),
        title: form.title.trim() || undefined,
        requestedRole: form.requestedRole,
        reason: form.reason.trim() || undefined,
      };
      const r = await api<{ id: string; status: string }>('/api/access-requests', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      setDone(r.id);
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : 'Something went wrong — try again.');
    } finally {
      setSubmitting(false);
    }
  };

  // Bots often set input values directly instead of typing.
  function honeypotFilled(): boolean {
    const el = document.querySelector<HTMLInputElement>('input[name="website"]');
    return Boolean(el && el.value.trim());
  }

  const enterPortal = () => {
    const name = signInName.trim() || 'Dana Whitfield';
    setIdentity({ role: signInRole, name });
    if (onSignedIn) onSignedIn();
    else window.location.assign('/');
  };

  return (
    <div className="grid min-h-screen grid-cols-1 lg:grid-cols-2">
      {/* Left: brand panel */}
      <div
        className="relative hidden flex-col overflow-hidden p-12 text-[color:var(--sidebar-ink)] lg:flex"
        style={{ background: 'linear-gradient(155deg, var(--navy-900) 0%, var(--navy-700) 42%, var(--navy-500) 100%)' }}
      >
        <div className="relative flex max-w-md grow flex-col">
          <div className="flex items-center gap-3.5">
            <svg width="46" height="46" viewBox="0 0 48 48" aria-hidden="true">
              <defs>
                <linearGradient id="ragr" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0" stopColor="var(--amber-300)" />
                  <stop offset="1" stopColor="var(--navy-500)" />
                </linearGradient>
              </defs>
              <path d="M2.9 43.2L13 25.9L17.8 22.1L22.1 4.8L27.4 19.2L31.7 14.9L38.4 26.4L45.1 43.2Z" fill="url(#ragr)" />
              <path d="M22.1 4.8L27.4 19.2L31.7 14.9L38.4 26.4L45.1 43.2L22.1 43.2Z" fill="var(--navy-900)" opacity=".25" />
              <path d="M22.1 4.8L26.6 16.8L24.7 13L23.8 19.2L22.6 12L21.5 20.6L20.2 13L19.2 19.2Z" fill="var(--paper)" />
            </svg>
            <div className="leading-none">
              <div className="text-[26px] font-extrabold tracking-tight" style={{ fontFamily: 'var(--font-display)' }}>
                Denali
              </div>
              <div className="mt-1.5 text-[8.5px] font-bold uppercase tracking-[0.32em] text-[color:var(--amber-300)]">
                Treasury Intelligence
              </div>
            </div>
          </div>

          <div className="flex grow flex-col justify-center py-12">
            <div className="mb-5 flex items-center gap-3.5">
              <span className="h-px w-6 bg-[color:var(--amber-300)]" />
              <span className="text-[10px] font-bold uppercase tracking-[0.24em] text-[color:var(--amber-300)]">Request access</span>
            </div>
            <h1 className="m-0 text-[52px] font-bold leading-[1.04] tracking-tight" style={{ fontFamily: 'var(--font-display)' }}>
              Know your
              <br />
              <span className="text-[color:var(--amber-300)]">territory.</span>
            </h1>
            <p className="mt-5 max-w-sm text-base leading-relaxed text-[color:var(--sidebar-text)]">
              Denali reads ACH and core activity to surface the treasury products your customers run outside the bank.
            </p>
            <div className="mt-8 grid gap-3.5 text-[14.5px] text-[color:var(--sidebar-text)]">
              {['Surface what competitors hold', 'Evidence-backed opportunities', 'Approval-gated to CRM', 'Every action audited'].map((v) => (
                <div key={v} className="flex items-center gap-3">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-[color:var(--amber-500)]">
                    <svg width="9" height="9" viewBox="0 0 16 16" aria-hidden="true">
                      <path d="M3 8.5L6.5 12L13 4" fill="none" stroke="var(--amber-300)" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </span>
                  {v}
                </div>
              ))}
            </div>
          </div>

          <div className="border-t border-[color:var(--sidebar-line)] pt-5 text-[11.5px] text-[color:var(--sidebar-text)]">
            No core integration required to start · Jack Henry · Fiserv · FIS · CSI · 110+ more
          </div>
        </div>
      </div>

      {/* Right: form */}
      <div className="flex flex-col bg-[color:var(--panel)]">
        <div className="flex items-center justify-end gap-1 border-b border-[color:var(--line)] px-9 py-4 text-[13px] text-[color:var(--muted)]">
          Already have access?
          <button type="button" className="cursor-pointer border-0 bg-transparent p-0 text-[13px] font-bold text-[color:var(--navy-700)]" onClick={() => setSignIn((s) => !s)}>
            Sign in
          </button>
        </div>

        <div className="flex grow items-center justify-center px-13 py-9">
          <div className="w-full max-w-[470px]">
            {signIn && (
              <div className="card mb-6">
                <h2 className="card-title">Demo sign-in</h2>
                <p className="mt-1 mb-0 text-[12.5px] text-[color:var(--muted)]">
                  Role-based access until SSO lands. The backend trusts this role — demo data only.
                </p>
                <div className="mt-4 grid gap-4">
                  <Field id="signin-role" label="Role" required>
                    <select id="signin-role" className={inputClass} value={signInRole} onChange={(e) => setSignInRole(e.target.value as Role)}>
                      {ROLES.map((r) => (
                        <option key={r} value={r}>
                          {ROLE_LABELS[r]}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field id="signin-name" label="Your name">
                    <input id="signin-name" className={inputClass} placeholder="Dana Whitfield" value={signInName} onChange={(e) => setSignInName(e.target.value)} autoComplete="name" />
                  </Field>
                  <button type="button" className="btn btn-primary" onClick={enterPortal}>
                    Enter portal
                  </button>
                </div>
              </div>
            )}

            {done ? (
              <div className="grid gap-4">
                <div className="flex h-11 w-11 items-center justify-center rounded-full bg-[color:var(--green-bg)]">
                  <svg width="18" height="18" viewBox="0 0 16 16" aria-hidden="true">
                    <path d="M3 8.5L6.5 12L13 4" fill="none" stroke="var(--green-text)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
                <div className="text-[26px] font-bold leading-tight" style={{ fontFamily: 'var(--font-display)' }}>
                  Request received
                </div>
                <p className="m-0 text-sm leading-relaxed text-[color:var(--muted)]">
                  Your request was routed to an approver at {form.organization.trim() || 'your bank'}. Data access is granted only
                  after they confirm your role — you will hear back by email. Nothing is automatic.
                </p>
              </div>
            ) : (
              <>
                <div className="flex gap-2 px-0.5" aria-hidden="true">
                  {STEPS.map((s, i) => (
                    <div
                      key={s}
                      className="h-[3px] flex-1 rounded-sm"
                      style={{ background: i <= step ? 'linear-gradient(90deg, var(--amber-500), var(--amber-300))' : 'var(--line)' }}
                    />
                  ))}
                </div>
                <div className="mt-4 mb-6 text-[11px] font-semibold uppercase tracking-[0.12em] text-[color:var(--amber-500)]">
                  Step {step + 1} of 4 · {STEPS[step]}
                </div>

                {/* Honeypot: hidden from humans, tempting to bots. Deliberately
                    uncontrolled — bots write straight to the DOM. */}
                <div className="absolute -left-[9999px] top-auto h-px w-px overflow-hidden" aria-hidden="true">
                  <label htmlFor="website">Website</label>
                  <input id="website" name="website" type="text" tabIndex={-1} autoComplete="off" defaultValue="" />
                </div>

                {step === 0 && (
                  <div className="grid gap-6">
                    <div>
                      <div className="text-[26px] font-bold leading-tight" style={{ fontFamily: 'var(--font-display)' }}>
                        Identify your organization
                      </div>
                      <p className="mt-2 mb-0 text-sm leading-relaxed text-[color:var(--muted)]">
                        Enter the name of your financial institution. We'll route your request to the right team.
                      </p>
                    </div>
                    <Field id="org" label="Organization / Bank name" required error={errors.organization}>
                      <input id="org" className={inputClass} placeholder="Pinecrest Bank" value={form.organization} onChange={set('organization')} autoComplete="organization" autoFocus />
                    </Field>
                    <Field id="usertype" label="User type" required>
                      <select id="usertype" className={inputClass} value={form.userType} onChange={set('userType')}>
                        {USER_TYPES.map((t) => (
                          <option key={t.value} value={t.value}>
                            {t.label}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <div className="rounded-md border border-[color:var(--line)] bg-[color:var(--surface)] px-3.5 py-2.5 text-[13px] leading-normal text-[color:var(--muted)]">
                      Bank employees are matched to their institution's tenant. Data access is granted only after an approver at your bank confirms your role.
                    </div>
                  </div>
                )}

                {step === 1 && (
                  <div className="grid gap-6">
                    <div className="text-[26px] font-bold leading-tight" style={{ fontFamily: 'var(--font-display)' }}>
                      Tell us who you are
                    </div>
                    <Field id="fullname" label="Full name" required error={errors.fullName}>
                      <input id="fullname" className={inputClass} value={form.fullName} onChange={set('fullName')} autoComplete="name" autoFocus />
                    </Field>
                    <Field id="email" label="Work email" required error={errors.workEmail}>
                      <input id="email" className={inputClass} type="email" placeholder="you@yourbank.com" value={form.workEmail} onChange={set('workEmail')} autoComplete="email" inputMode="email" />
                    </Field>
                    <Field id="title" label="Title">
                      <input id="title" className={inputClass} placeholder="Commercial Banker" value={form.title} onChange={set('title')} autoComplete="organization-title" />
                    </Field>
                  </div>
                )}

                {step === 2 && (
                  <div className="grid gap-6">
                    <div className="text-[26px] font-bold leading-tight" style={{ fontFamily: 'var(--font-display)' }}>
                      What will you do in Denali?
                    </div>
                    <Field id="role" label="Requested role" required error={errors.requestedRole}>
                      <select id="role" className={inputClass} value={form.requestedRole} onChange={set('requestedRole')}>
                        <option value="" disabled>
                          Choose a role
                        </option>
                        {ROLES.map((r) => (
                          <option key={r} value={r}>
                            {ROLE_LABELS[r]}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field id="reason" label="What do you need it for?">
                      <textarea id="reason" className={inputClass} rows={3} maxLength={2000} value={form.reason} onChange={set('reason')} placeholder="Managing the north book, need gap visibility." />
                    </Field>
                  </div>
                )}

                {step === 3 && (
                  <div className="grid gap-6">
                    <div className="text-[26px] font-bold leading-tight" style={{ fontFamily: 'var(--font-display)' }}>
                      Review and submit
                    </div>
                    <div className="card grid gap-2.5 text-sm">
                      {[
                        ['Organization', form.organization],
                        ['User type', USER_TYPES.find((t) => t.value === form.userType)?.label || form.userType],
                        ['Name', form.fullName],
                        ['Work email', form.workEmail],
                        ['Title', form.title || '—'],
                        ['Requested role', form.requestedRole ? ROLE_LABELS[form.requestedRole] : '—'],
                      ].map(([label, value]) => (
                        <div key={label} className="flex justify-between gap-4">
                          <span className="text-[color:var(--muted)]">{label}</span>
                          <span className="text-right font-semibold">{value}</span>
                        </div>
                      ))}
                    </div>
                    {submitError && <div className="text-[13px] font-medium text-[color:var(--amber-text)]">{submitError}</div>}
                  </div>
                )}

                <div className="mt-8 flex items-center justify-between">
                  {step > 0 ? (
                    <button type="button" className="btn" onClick={() => setStep((s) => s - 1)}>
                      Back
                    </button>
                  ) : (
                    <span />
                  )}
                  {step < 3 ? (
                    <button type="button" className="btn btn-primary px-8" onClick={continueStep}>
                      Continue
                    </button>
                  ) : (
                    <button type="button" className="btn btn-primary px-8" onClick={() => void submit()} disabled={submitting}>
                      Submit request
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        </div>

        <div className="border-t border-[color:var(--line)] px-9 py-4 text-center text-[11.5px] text-[color:var(--muted)]">
          No automatic access. Every request reviewed. Every action audited.
        </div>
      </div>
    </div>
  );
}
