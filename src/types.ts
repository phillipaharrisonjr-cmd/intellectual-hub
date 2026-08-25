export interface ProjectionStep {
  label: string;
  value: number;
  note: string;
}

export interface Projection {
  model: string;
  modelLabel: string;
  annualRevenue: number;
  depositUplift: number;
  fiveYearValue: number;
  steps: ProjectionStep[];
  assumptionsVersion: string;
}

export interface EvidenceRow {
  date: string | null;
  descriptor: string;
  amount: number;
  direction: 'credit' | 'debit';
}

export interface Flow {
  total: number;
  count: number;
  days: number;
  direction: string;
  from: string;
  to: string;
}

export type Confidence = 'High' | 'Medium' | 'Low';

export interface Benchmark {
  status: 'within' | 'above' | 'below' | 'unknown';
  basis: 'customer_revenue' | 'peer_band' | null;
  industryLabel: string | null;
  annualizedFlow: number;
  band: { min: number; max: number } | null;
  version: string;
}

export interface Opportunity {
  id: string;
  customerId: string;
  customerName: string;
  officer: string | null;
  industry: string | null;
  product: string;
  heldElsewhereAt: string;
  heldAtBank: string[];
  score: number;
  confidence: Confidence;
  customerInCore: boolean;
  flow: Flow;
  projection: Projection;
  benchmark?: Benchmark;
  explanation: string;
  evidence: EvidenceRow[];
  status: string;
  referralId: string | null;
}

export interface Customer {
  id: string;
  name: string;
  officer?: string | null;
  industry?: string | null;
  heldAtBank: string[];
}

export interface CustomerResponse {
  customer: Customer;
  opportunities: Opportunity[];
}

export interface OpportunitiesResponse {
  summary: {
    opportunities: number;
    customers: number;
    annualRevenue: number;
    high: number;
    byProduct: { product: string; count: number; annualRevenue: number }[];
  };
  opportunities: Opportunity[];
}

export type ReferralPriority = 'this_week' | 'this_month' | 'later';
