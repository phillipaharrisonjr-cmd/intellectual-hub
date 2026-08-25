import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CustomerScreen from './CustomerScreen';
import type { CustomerResponse } from '../types';

// The 123 Ford story from the design canvas, in the exact shape
// GET /api/customers/:id returns (see backend/src/intelligence/opportunities.js).
const ford: CustomerResponse = {
  customer: {
    id: '2231',
    name: '123 Ford of Anchorage',
    officer: 'Dana Whitfield',
    industry: 'Auto dealer',
    heldAtBank: ['Operating DDA', 'Floorplan line', 'CRE mortgage', 'ACH origination', 'Business credit card', 'Positive pay'],
  },
  opportunities: [
    {
      id: '2231-merchant-services',
      customerId: '2231',
      customerName: '123 Ford of Anchorage',
      officer: 'Dana Whitfield',
      industry: 'Auto dealer',
      product: 'Merchant services',
      heldElsewhereAt: 'Worldpay',
      heldAtBank: ['Operating DDA', 'Floorplan line', 'CRE mortgage', 'ACH origination', 'Business credit card', 'Positive pay'],
      score: 99,
      confidence: 'High',
      customerInCore: true,
      flow: { total: 4213399.8, count: 63, days: 90, direction: 'credit', from: '2026-06-01', to: '2026-08-29' },
      projection: {
        model: 'merchant_cp',
        modelLabel: 'Merchant services (card present)',
        annualRevenue: 58900,
        depositUplift: 11800,
        fiveYearValue: 294500,
        steps: [
          { label: '90-day settlements', value: 4213399.8, note: '63 deposits' },
          { label: 'Gross card volume', value: 4317008, note: 'at 2.4% blended processing cost' },
          { label: 'Annualized volume', value: 17508338, note: '90 days scaled to 365' },
          { label: 'Net revenue to bank / yr', value: 58900, note: '0.34% net margin' },
        ],
        assumptionsVersion: '2.3',
      },
      benchmark: {
        status: 'within',
        basis: 'customer_revenue',
        industryLabel: 'New car dealers',
        annualizedFlow: 17087677,
        band: { min: 3150000, max: 19950000 },
        version: '0.1-starter',
      },
      explanation:
        '123 Ford of Anchorage shows 63 credits matching "Worldpay" over 90 days, $4,213,400 in total, classified as Merchant services by rule merchant-worldpay. The bank holds 6 products with this customer but not Merchant services. Projected at $58,900 per year using the merchant services (card present) model.',
      evidence: [
        { date: '2026-08-28', descriptor: 'WORLDPAY MERCH DEP', amount: 66879.36, direction: 'credit' },
        { date: '2026-08-27', descriptor: 'WORLDPAY MERCH DEP', amount: 66879.36, direction: 'credit' },
        { date: '2026-08-26', descriptor: 'WORLDPAY MERCH DEP', amount: 66879.36, direction: 'credit' },
      ],
      status: 'open',
      referralId: null,
    },
  ],
};

function mockFetch(routes: Record<string, () => { status?: number; body: unknown }>) {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const key = `${init?.method || 'GET'} ${url}`;
    const route = routes[key];
    if (!route) throw new Error(`no mock for ${key}`);
    const { status = 200, body } = route();
    return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('CustomerScreen', () => {
  it('renders the customer, relationship map, and confidence from the API', async () => {
    vi.stubGlobal('fetch', mockFetch({ 'GET /api/customers/2231': () => ({ body: ford }) }));
    render(<CustomerScreen customerId="2231" />);

    expect(await screen.findByRole('heading', { name: '123 Ford of Anchorage' })).toBeInTheDocument();
    expect(screen.getByText('High confidence')).toBeInTheDocument();
    expect(screen.getByText('Operating DDA')).toBeInTheDocument();
    expect(screen.getByText('Merchant services · Worldpay')).toBeInTheDocument();
  });

  it('renders every projection step with formatted values', async () => {
    vi.stubGlobal('fetch', mockFetch({ 'GET /api/customers/2231': () => ({ body: ford }) }));
    render(<CustomerScreen customerId="2231" />);

    expect(await screen.findByText('90-day settlements')).toBeInTheDocument();
    expect(screen.getByText('Gross card volume')).toBeInTheDocument();
    expect(screen.getByText('Annualized volume')).toBeInTheDocument();
    expect(screen.getByText('Net revenue to bank / yr')).toBeInTheDocument();
    expect(screen.getAllByText('$4.21M').length).toBeGreaterThan(0);
    expect(screen.getByText('$58,900')).toBeInTheDocument();
    expect(screen.getByText('0.34% net margin')).toBeInTheDocument();
  });

  it('renders the explanation and the ACH evidence rows', async () => {
    vi.stubGlobal('fetch', mockFetch({ 'GET /api/customers/2231': () => ({ body: ford }) }));
    render(<CustomerScreen customerId="2231" />);

    expect(await screen.findByText(ford.opportunities[0].explanation)).toBeInTheDocument();
    expect(screen.getAllByText('WORLDPAY MERCH DEP')).toHaveLength(3);
    expect(screen.getAllByText('$66,879')).toHaveLength(3);
  });

  it('shows the peer-band check from the benchmark', async () => {
    vi.stubGlobal('fetch', mockFetch({ 'GET /api/customers/2231': () => ({ body: ford }) }));
    render(<CustomerScreen customerId="2231" />);

    expect(await screen.findByText(/inside the plausible band/)).toBeInTheDocument();
    expect(screen.getByText(/\$3\.15M–\$19\.95M/)).toBeInTheDocument();
  });

  it('warns when the flow is above the plausible band', async () => {
    const above = {
      ...ford,
      opportunities: [
        {
          ...ford.opportunities[0],
          benchmark: { ...ford.opportunities[0].benchmark!, status: 'above' as const },
        },
      ],
    };
    vi.stubGlobal('fetch', mockFetch({ 'GET /api/customers/2231': () => ({ body: above }) }));
    render(<CustomerScreen customerId="2231" />);

    expect(await screen.findByText(/above the plausible band/)).toBeInTheDocument();
  });

  it('submits a referral and reflects the referred status', async () => {
    let referred = false;
    const routes = {
      'GET /api/customers/2231': () => ({
        body: referred
          ? { ...ford, opportunities: [{ ...ford.opportunities[0], status: 'referred', referralId: 'ref-1' }] }
          : ford,
      }),
      'POST /api/referrals': () => {
        referred = true;
        return { status: 201, body: { id: 'ref-1', status: 'submitted' } };
      },
    };
    const fetchMock = mockFetch(routes);
    vi.stubGlobal('fetch', fetchMock);
    render(<CustomerScreen customerId="2231" />);

    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'This week' }));
    await user.click(screen.getByRole('button', { name: 'Refer this opportunity' }));

    await waitFor(() => expect(screen.getByText(/Referred/)).toBeInTheDocument());
    const post = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST');
    expect(post).toBeDefined();
    expect(JSON.parse(String(post![1]!.body))).toMatchObject({
      opportunityId: '2231-merchant-services',
      priority: 'this_week',
    });
  });
});
