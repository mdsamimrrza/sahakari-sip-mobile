// ============================================================
// SahakariSIP — Tax & Exit-Load Module (single source of truth)
// ============================================================
// Ported from web app (src/lib/tax.ts) - shared logic for mobile
//
// HARD RULE: no tax rate may appear here (or anywhere else in
// the app) unless it was verified against an official Nepal
// source - IRD / Finance Act for statutory rates, the fund
// manager's official documentation for fund charges. Rules that
// cannot be verified live in the tax_rules table with status
// NOT_VERIFIED and every screen renders the fallback message
// instead of a number. Exit-load and DP fees are fund charges,
// never mixed into tax amounts.
//
// VERIFIED 2026-09-24 - Two DIFFERENT asset classes, do not conflate:
//   * Listed share market (NEPSE): Finance Act 2083 slab 10% within
//     1 year / 7.5% over 1 year. Not tracked by this app.
//   * Open-ended SIP mutual funds (all funds SahakariSIP tracks):
//     bank/fund-manager schedule 5% within 1 year / 3.75% over 1
//     year, auto-deducted at redemption. Confirmed by user with
//     Siddhartha Capital 2026-09-24 - this is the schedule the app
//     applies. Exit-load and DP fees are fund charges, never mixed
//     into tax amounts.
// ============================================================

import type { TaxStatus } from "./types";

// ---------- Verification status ----------

export type TaxType = "CAPITAL_GAINS" | "DIVIDEND" | "EXIT_LOAD" | "DP_FEE" | "OTHER";

export const CGT_UNRESOLVED_MESSAGE =
  "Current mutual-fund capital-gains tax rate could not be verified from the official Nepal tax source.";

export const TAX_DISCLAIMER =
  "Tax information is based on the cited Nepal government/fund-manager sources and is provided for informational purposes. Users should verify their personal tax obligations with the Inland Revenue Department or a qualified tax professional.";

// ---------- Verified CGT: open-ended (unlisted) redemptions ----------

export interface CgtRateInfo {
  /** Per-bucket rates applied to lot-aged redemption gains. */
  longTermRatePct: number;
  shortTermRatePct: number;
  /** Holding days above which a lot counts as long-term. */
  longTermOverDays: number;
  /** Who and what these rates cover. */
  scope: string;
  /** First FY the rates apply to. */
  effectiveFrom: string;
  /** Statutory basis. */
  basis: string;
  officialSources: Array<{ label: string; url: string }>;
  /** Reported but NOT enacted - displayed as a note, never applied. */
  pendingNote: string;
}

export const CGT_NP_REDEMPTION: CgtRateInfo = {
  longTermRatePct: 3.75,
  shortTermRatePct: 5,
  longTermOverDays: 365,
  scope: "All Nepal mutual funds: resident individuals redeeming units (applied to every tracked fund, regardless of fund manager)",
  effectiveFrom: "2026-07-17",
  basis:
    "Capital gains on mutual-fund redemptions depend on the lot's holding period and are auto-deducted at redemption.",
  officialSources: [
    {
      label: "Bank confirmation",
      url: "https://www.siddharthacapital.com/ssis-faq/",
    },
    {
      label: "Listed share-market schedule (reference only)",
      url: "https://www.fiscalnepal.com/2026-07-16/26974/new-cgt-rates-on-shares-real-estate-take-effect-friday",
    },
  ],
  pendingNote:
    "The 7.5%/10% Finance Act schedule applies to the listed share market only.",
};

/** Keep the historic export name working - now the short-term (flat) leg. */
export const CGT_OPEN_ENDED_INDIVIDUAL = {
  ratePct: CGT_NP_REDEMPTION.shortTermRatePct,
  scope: CGT_NP_REDEMPTION.scope,
  effectiveFrom: CGT_NP_REDEMPTION.effectiveFrom,
  basis: CGT_NP_REDEMPTION.basis,
  officialSources: CGT_NP_REDEMPTION.officialSources,
  pendingNote: CGT_NP_REDEMPTION.pendingNote,
};

/**
 * Capital-gains status for the app's tracked funds. VERIFIED per the
 * Finance Act 2083 schedule above - screens show lot-aged long/short
 * estimates from the dashboard summary.
 */
export function getCapitalGainsStatus(): { status: TaxStatus; message: string } {
  return {
    status: "VERIFIED",
    message: `Long-term over 365 days at ${CGT_NP_REDEMPTION.longTermRatePct}%, short-term at ${CGT_NP_REDEMPTION.shortTermRatePct}% (FY 2083/84).`,
  };
}

/** Estimated CGT on the portfolio's net gain (legacy single-figure helper). */
export function estimateOpenEndedCgt(netGain: number | null): number {
  if (netGain === null || netGain <= 0) return 0;
  return (netGain * CGT_NP_REDEMPTION.shortTermRatePct) / 100;
}

/** Lot-aged bucket estimate used by the dashboard summary. */
export function estimateBucketedCgt(
  longGain: number,
  shortGain: number
): { long: number; short: number; total: number } {
  const long = (Math.max(0, longGain) * CGT_NP_REDEMPTION.longTermRatePct) / 100;
  const short = (Math.max(0, shortGain) * CGT_NP_REDEMPTION.shortTermRatePct) / 100;
  return { long, short, total: long + short };
}

// ---------- Per-lot holding period ----------

const MS_PER_DAY = 1000 * 60 * 60 * 24;

export function getHoldingDays(purchaseDateIso: string, asOfMs: number = Date.now()): number {
  return (asOfMs - new Date(purchaseDateIso).getTime()) / MS_PER_DAY;
}

// ---------- Exit load ----------

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

/**
 * Fund-specific exit-load schedules. ONLY officially verified schedules may
 * be listed here. A fund that is missing from this map is treated as
 * NOT_VERIFIED - never default to 0%, because "no schedule found" is not
 * the same as "officially zero".
 */
const EXIT_LOAD_SCHEDULES: Record<string, Omit<ExitLoadSchedule, "fundName" | "status">> = {
  // Official: https://www.siddharthacapital.com/ssis-faq/
  // "1.5% of applicable NAV within 1 year of purchase" and
  // "No exit load to be levied after 1 year of purchase".
  SSIS: {
    officialSourceUrl: "https://www.siddharthacapital.com/ssis-faq/",
    verifiedAt: "2026-09-23",
    tiers: [
      { maxDays: 365, ratePct: 1.5 },
      { maxDays: null, ratePct: 0 },
    ],
  },
  // Official: https://nimbacecapital.com/nibl-sahabhagita-fund/
  // 1.5% within 6 months; 1.25% within 6-12 months; 1% within 12-18
  // months; 0.75% within 18-24 months; none listed beyond 24 months.
  "NIBL Sahabhagita Fund": {
    officialSourceUrl: "https://nimbacecapital.com/nibl-sahabhagita-fund/",
    verifiedAt: "2026-09-23",
    tiers: [
      { maxDays: 183, ratePct: 1.5 },
      { maxDays: 365, ratePct: 1.25 },
      { maxDays: 548, ratePct: 1.0 },
      { maxDays: 730, ratePct: 0.75 },
      { maxDays: null, ratePct: 0 },
    ],
  },
};

/**
 * Normalize fund name for lookup (matches web app's fund-meta.ts logic)
 */
function normalizeFundName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

const NORMALIZED_SCHEDULES: Record<string, Omit<ExitLoadSchedule, "fundName" | "status">> = {};
for (const [key, value] of Object.entries(EXIT_LOAD_SCHEDULES)) {
  NORMALIZED_SCHEDULES[normalizeFundName(key)] = value;
}

export function getExitLoadSchedule(fundName: string): ExitLoadSchedule | null {
  const normalized = normalizeFundName(fundName);
  const schedule = NORMALIZED_SCHEDULES[normalized];
  if (!schedule) return null;
  return { ...schedule, fundName, status: "VERIFIED" };
}

export function getExitLoadRatePct(schedule: ExitLoadSchedule, holdingDays: number): number {
  for (const tier of schedule.tiers) {
    if (tier.maxDays === null || holdingDays < tier.maxDays) return tier.ratePct;
  }
  return 0;
}

// ---------- Aggregate status for screens ----------

export interface TaxStatusSummary {
  cgtStatus: TaxStatus;
  cgtMessage: string;
  /** Per-fund exit-load verification; only funds with a verified schedule appear. */
  exitLoadVerified: Array<{ fundName: string; sourceUrl: string | null }>;
  /** Funds we track but whose exit-load rules are not yet officially verified. */
  exitLoadUnverified: string[];
}

export function getTaxStatusSummary(fundNames: string[]): TaxStatusSummary {
  const verified: Array<{ fundName: string; sourceUrl: string | null }> = [];
  const unverified: string[] = [];
  for (const name of fundNames) {
    const schedule = getExitLoadSchedule(name);
    if (schedule) verified.push({ fundName: schedule.fundName, sourceUrl: schedule.officialSourceUrl });
    else unverified.push(name);
  }
  const cgt = getCapitalGainsStatus();
  return {
    cgtStatus: cgt.status,
    cgtMessage: cgt.message,
    exitLoadVerified: verified,
    exitLoadUnverified: unverified,
  };
}