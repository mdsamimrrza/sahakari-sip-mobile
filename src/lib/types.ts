// ============================================================
// SahakariSIP — Type Definitions
// ============================================================
// Ported verbatim from the web app (src/lib/types.ts) so both
// clients share an identical data model.
// ============================================================

// ---------- Tax / Exit-Load types (shared with web) ----------

export type TaxStatus = "VERIFIED" | "NOT_VERIFIED" | "NOT_APPLICABLE";

export interface ExitLoadTier {
  /** Tier applies while the lot has been held strictly less than this many days. */
  maxDays: number | null; // null = no upper bound (the catch-all/terminal tier)
  ratePct: number;
}

export interface ExitLoadSchedule {
  fundName: string;
  status: TaxStatus;
  officialSourceUrl: string | null;
  verifiedAt: string | null;
  /** Sorted ascending by maxDays; the terminal tier's rate is usually 0. */
  tiers: ExitLoadTier[];
}

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
  // ---- Registered SIP schedule (source of truth for due dates) ----
  sip_type: "UNLIMITED";
  frequency: "MONTHLY" | "QUARTERLY" | null;
  calendar_system: "AD" | "BS" | null;
  /** User's registered first SIP due date (AD ISO string), null until confirmed. */
  anchor_date: string | null;
  /** True once the user confirmed the registered schedule. */
  schedule_verified: boolean;
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
  /** CGT verification status (see src/lib/tax.ts). */
  cgtStatus: TaxStatus;
  cgtMessage: string | null;
  /** Lot-aged CGT estimates (FY 2083/84 verified slab applied per bucket). */
  estimatedCgtLongTerm: number;
  estimatedCgtShortTerm: number;
  /** Taxable gain bases behind the estimates (loss lots excluded). */
  cgtTaxableLongTerm: number;
  cgtTaxableShortTerm: number;
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
