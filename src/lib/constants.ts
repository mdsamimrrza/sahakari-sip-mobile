// ============================================================
// SahakariSIP: Constants & Fund Presets
// ============================================================
// Ported verbatim from the web app (src/lib/constants.ts).
// ============================================================

import type { FundPreset } from "./types";

// ---------- Fund presets ----------

export const FUND_PRESETS: FundPreset[] = [
  {
    name: "NMB Saral Bachat Fund-E",
    feeRate: 1.8, // Total: 1.5% management + 0.2% depository + 0.1% supervision
    feeBreakdown: {
      management: 1.5,
      depository: 0.2,
      supervision: 0.1,
    },
  },
  {
    name: "NIBL Sahabhagita Fund",
    feeRate: 1.57,
    feeBreakdown: {
      management: 1.25,
      depository: 0.2,
      supervision: 0.12,
    },
  },
  {
    name: "SSIS",
    // From scheme documents: Management 1.50% + Depository 0.20% = 1.70% total
    feeRate: 1.7,
    feeBreakdown: {
      management: 1.5,
      depository: 0.2,
      supervision: 0.0, // Supervision fee: unspecified in prospectus excerpt; placeholder 0.0
    },
  },
];

// ---------- App metadata ----------

export const DP_CHARGE = 5; // Flat Depository Participant fee per transaction

export const APP_NAME = "SahakariSIP";
export const APP_DESCRIPTION =
  "Track your Nepali mutual fund SIP investments: see your real returns, understand fee drag, and project your growth.";
export const APP_TAGLINE =
  "Enter what you actually invested. See exactly what it's worth.";

// ---------- Distribution ----------

// GitHub release link for the APK download, opened from Settings → About.
// TODO: replace with the real release link, e.g.
// https://github.com/user/repo/releases/latest
export const APP_DOWNLOAD_URL =
  "https://github.com/YOUR_USERNAME/sahakarisip/releases/latest";

// ---------- Currency ----------

export const CURRENCY_CODE = "NPR";
export const CURRENCY_LOCALE = "en-IN"; // International grouping: 1,234,567

// ---------- Projection defaults ----------

export const RETURN_SCENARIOS = [8, 10, 12] as const;
export const STEP_UP_OPTIONS = [0, 5, 10, 15] as const;
export const PROJECTION_YEARS = [5, 10, 15, 20] as const;

// ---------- Validation limits ----------

export const MIN_PASSWORD_LENGTH = 8;
export const MAX_NOTES_LENGTH = 500;
export const XIRR_MIN_ENTRIES = 3; // Show XIRR only when ≥ 3 entries
export const MIN_SIP_AMOUNT = 1000; // Minimum monthly SIP amount (NPR)

// ---------- Navigation items (mobile bottom tab bar, mirrors web) ----------

export const NAV_ITEMS = [
  { label: "Dashboard", href: "/dashboard", icon: "LayoutDashboard" as const },
  { label: "History", href: "/history", icon: "History" as const },
  { label: "Projections", href: "/projections", icon: "TrendingUp" as const },
  { label: "Settings", href: "/settings", icon: "Settings" as const },
] as const;

// ---------- Chart colors (resolved at runtime from the active theme) ----------

export const CHART_COLORS = {
  primary: "chartPrimary",
  positive: "chartPositive",
  negative: "chartNegative",
  invested: "chartInvested",
  feeDrag: "chartFeeDrag",
  grid: "chartGrid",
  text: "chartText",
} as const;

// ---------- CGT rates (Nepal IRD) ----------
// NOTE: Actual rates are now defined in src/lib/tax.ts (CGT_NP_REDEMPTION)
// which has verified rates: 3.75% long-term (>365 days), 5% short-term (≤365 days).
// This constant remains for holding-period logic only.
export const LONG_TERM_HOLDING_DAYS = 365;
