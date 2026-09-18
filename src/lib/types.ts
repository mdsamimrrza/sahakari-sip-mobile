// ============================================================
// SahakariSIP — Type Definitions
// ============================================================
// Ported verbatim from the web app (src/lib/types.ts) so both
// clients share an identical data model.
// ============================================================

// ---------- Database row types ----------

export interface FundConfig {
  id: string;
  user_id: string;
  fund_name: string;
  fee_rate_pct: number;
  start_date: string; // ISO date string
  monthly_sip: number;
  latest_nav: number | null;
  latest_nav_date: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Entry {
  id: string;
  user_id: string;
  fund_id: string;
  purchase_date: string; // ISO date string
  amount: number;
  nav: number;
  units: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface NavHistoryRow {
  id: string;
  user_id: string;
  fund_id: string;
  nav_date: string;
  nav_value: number;
  created_at: string;
}

export interface EntryBreakdown {
  freshAmount: number;
  carriedRollover: number;
  totalAvailable: number;
  dpFee: number;
  netCash: number;
  units: number;
  nav: number;
  unitCost: number;
  remainingRollover: number;
}

// ---------- Computed / dashboard types ----------

export interface DashboardSummary {
  totalInvested: number;
  totalUnits: number;
  currentValue: number | null; // null if latest_nav not set
  unallottedCash: number; // Leftover cash from whole unit allotments + DP fee
  gainLoss: number | null;
  gainLossPct: number | null;
  estimatedCgtLongTerm: number | null; // 7.5% tax for > 1 year
  estimatedCgtShortTerm: number | null; // 10.0% tax for < 1 year
  xirr: number | null; // null if < 3 entries or solver fails
  sipStreak: number;
  latestNav: number | null;
  latestNavDate: string | null;
}

export interface ChartDataPoint {
  date: string;
  value: number;
  label?: string;
}

export interface PortfolioChartPoint {
  date: string;
  portfolioValue: number;
  totalInvested: number;
}

export interface MonthlyContribution {
  month: string; // "YYYY-MM"
  amount: number;
  breakdown?: Array<{
    fundName: string;
    amount: number;
  }>;
}

export interface FeeDragPoint {
  date: string;
  cumulativeDrag: number;
  monthlyDrag: number;
}

export interface ProjectionRow {
  year: number;
  monthlySip: number;
  corpusValue: number;
  totalInvested: number;
  totalGain: number;
}

export interface ProjectionChartPoint {
  date: string;
  value: number;
  type: "actual" | "projected";
}

// ---------- Form types ----------

export interface EntryFormData {
  fund_id: string;
  purchase_date: Date;
  amount: number;
  nav: number;
  units: number;
  notes?: string;
}

export interface FundConfigFormData {
  fund_name: string;
  fee_rate_pct: number;
  start_date: Date;
  monthly_sip: number;
}

export interface CsvRow {
  date: string;
  amount: number;
  nav: number;
  units?: number;
  notes?: string;
}

export interface CsvImportResult {
  imported: number;
  skipped: number;
  errors: Array<{ row: number; message: string }>;
}

// ---------- Projection parameters ----------

export type ReturnScenario = 8 | 10 | 12;
export type StepUpRate = 0 | 5 | 10 | 15;

export interface ProjectionParams {
  currentCorpus: number;
  monthlySip: number;
  annualReturnPct: ReturnScenario;
  stepUpPct: StepUpRate;
  yearsToProject: number;
  realPrincipalSoFar: number; // Actual sum of money invested so far (cost basis),
  // distinct from currentCorpus which includes gains
}

// ---------- XIRR types ----------

export interface CashFlow {
  amount: number; // negative = investment, positive = redemption
  date: Date;
}

// ---------- Action response ----------

export interface ActionResult<T = void> {
  success: boolean;
  data?: T;
  error?: string;
  redirect?: string;
}

// ---------- Fund preset type ----------

export interface FundPreset {
  name: string;
  feeRate: number;
  feeBreakdown?: {
    management: number;
    depository: number;
    supervision: number;
  };
}

// ---------- Dashboard aggregate (returned by getDashboardData) ----------

export interface DashboardData {
  summary: DashboardSummary;
  funds: FundConfig[];
  portfolioChart: PortfolioChartPoint[];
  monthlyContributions: MonthlyContribution[];
  navHistory: ChartDataPoint[];
  feeDragChart: FeeDragPoint[];
  entries: Entry[];
}

// ---------- Notification preferences ----------

export interface NotificationPreferences {
  push_enabled: boolean;
  email_enabled: boolean;
  reminder_day: number;
  notify_days_before: number;
}

// ---------- Notifications log (bell dropdown) ----------

export interface NotificationItem {
  id: string;
  title: string;
  body: string;
  type?: string;
  url?: string | null;
  is_read: boolean;
  created_at: string;
}
