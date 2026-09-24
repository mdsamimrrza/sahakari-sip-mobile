// ============================================================
// SahakariSIP — Portfolio Analytics Engine
// ============================================================
// Backend-agnostic port of the web app's `getDashboardData()`
// (src/lib/actions/dashboard.ts). Both the Supabase store and the
// on-device store feed raw rows through this exact pipeline, so the
// numbers are identical no matter where the data came from.
// ============================================================

import type {
  ChartDataPoint,
  DashboardData,
  DashboardSummary,
  Entry,
  FeeDragPoint,
  FundConfig,
  MonthlyContribution,
  NavHistoryRow,
  PortfolioChartPoint,
} from "../types";
import {
  CGT_NP_REDEMPTION,
  getCapitalGainsStatus,
  estimateBucketedCgt,
} from "../tax";
import {
  DP_CHARGE,
  LONG_TERM_HOLDING_DAYS,
  XIRR_MIN_ENTRIES,
} from "../constants";
import { buildCashFlows, calculateXirr } from "../calculations/xirr";
import { calculateSipStreak } from "../calculations/streak";
import {
  calculateFeeDrag,
  prepareFeeDragEntries,
} from "../calculations/fee-drag";
import { parseDateSafe } from "../format";

const MS_PER_DAY = 1000 * 60 * 60 * 24;

export interface ComputeDashboardInput {
  funds: FundConfig[];
  entries: Entry[];
  navHistory: NavHistoryRow[];
  /** "all" or a specific fund id */
  fundId?: string;
}

export function computeDashboardData({
  funds,
  entries,
  navHistory,
  fundId = "all",
}: ComputeDashboardInput): DashboardData {
  const scopedFundId = fundId && fundId !== "all" ? fundId : null;

  // ---- Summary: invested / units ----

  const totalInvested = entries.reduce((sum, e) => sum + Number(e.amount), 0);
  const totalUnits = entries.reduce((sum, e) => sum + Number(e.units), 0);

  // Determine latest NAV for current value calculation
  let latestNav: number | null = null;
  let latestNavDate: string | null = null;

  if (scopedFundId) {
    const fund = funds.find((f) => f.id === scopedFundId);
    latestNav = fund?.latest_nav ? Number(fund.latest_nav) : null;
    latestNavDate = fund?.latest_nav_date ?? null;
  } else {
    // "All Funds" — use each fund's latest NAV for its units, then derive
    // the blended per-unit value.
    let totalValue = 0;
    let hasAllNavs = true;

    for (const fund of funds) {
      if (!fund.latest_nav) {
        hasAllNavs = false;
        break;
      }
      const fundUnits = entries
        .filter((e) => e.fund_id === fund.id)
        .reduce((sum, e) => sum + Number(e.units), 0);
      totalValue += fundUnits * Number(fund.latest_nav);
    }

    if (hasAllNavs && funds.length > 0) {
      latestNav = totalUnits > 0 ? totalValue / totalUnits : null;
    }
  }

  // ---- Rollover Wallet: chronological leftover cash per fund ----
  const fundRolloverMap = new Map<string, number>();
  const sortedEntries = [...entries].sort(
    (a, b) =>
      parseDateSafe(a.purchase_date).getTime() -
        parseDateSafe(b.purchase_date).getTime() ||
      new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );

  for (const e of sortedEntries) {
    const carried = fundRolloverMap.get(e.fund_id) || 0;
    const amt = Number(e.amount);
    const u = Number(e.units);
    const n = Number(e.nav);
    const dpFee = amt >= DP_CHARGE ? DP_CHARGE : 0;
    const net = Math.max(0, amt + carried - dpFee);
    const unitCost = u * n;
    const leftover = Math.max(0, net - unitCost);
    fundRolloverMap.set(e.fund_id, leftover);
  }

  const unallottedCash = scopedFundId
    ? fundRolloverMap.get(scopedFundId) || 0
    : Array.from(fundRolloverMap.values()).reduce((sum, val) => sum + val, 0);

  // Pure Portfolio Value = totalUnits * latestNav (excluding rollover cash)
  const currentValue = latestNav !== null ? totalUnits * latestNav : null;
  // Effective Invested = Total Money Deposited minus Unallotted Rollover Wallet Cash
  const effectiveInvested = Math.max(0, totalInvested - unallottedCash);
  const gainLoss =
    currentValue !== null ? currentValue - effectiveInvested : null;
  const gainLossPct =
    gainLoss !== null && effectiveInvested > 0
      ? (gainLoss / effectiveInvested) * 100
      : null;

  // ---- Per-fund latest NAV lookup ----
  const fundLatestNavMap = new Map<string, number>();
  for (const f of funds) {
    if (f.latest_nav) fundLatestNavMap.set(f.id, Number(f.latest_nav));
  }

  // ---- Capital Gains Tax ----
  // Nepal IRD taxes each LOT of units separately based on THAT lot's own
  // holding period (> 365 days = long-term @ 3.75%, else short-term @ 5%).
  const todayMs = Date.now();
  let longTermGainSum = 0;
  let shortTermGainSum = 0;

  for (const e of entries) {
    const fundNav = fundLatestNavMap.get(e.fund_id);
    if (fundNav === undefined) continue; // Can't value this lot without a current NAV

    const lotCostBasis = Number(e.amount);
    const lotCurrentValue = Number(e.units) * fundNav;
    const lotGain = lotCurrentValue - lotCostBasis;

    const purchaseMs = parseDateSafe(e.purchase_date).getTime();
    const daysHeld = (todayMs - purchaseMs) / MS_PER_DAY;

    if (daysHeld > LONG_TERM_HOLDING_DAYS) {
      longTermGainSum += lotGain;
    } else {
      shortTermGainSum += lotGain;
    }
  }

  // Tax applies only to NET positive gain within each bucket.
  // Use verified rates from tax.ts (CGT_NP_REDEMPTION: 3.75% long-term, 5% short-term)
  const cgtLongRate = CGT_NP_REDEMPTION.longTermRatePct / 100;
  const cgtShortRate = CGT_NP_REDEMPTION.shortTermRatePct / 100;

  const estimatedCgtLongTerm =
    longTermGainSum > 0 ? longTermGainSum * cgtLongRate : 0;
  const estimatedCgtShortTerm =
    shortTermGainSum > 0 ? shortTermGainSum * cgtShortRate : 0;

  // Taxable bases (loss lots excluded)
  const cgtTaxableLongTerm = Math.max(0, longTermGainSum);
  const cgtTaxableShortTerm = Math.max(0, shortTermGainSum);

  // CGT status from verified source
  const { status: cgtStatus, message: cgtMessage } = getCapitalGainsStatus();

  // ---- XIRR ----
  let xirr: number | null = null;
  if (entries.length >= XIRR_MIN_ENTRIES && currentValue !== null) {
    const cashFlows = buildCashFlows(entries, currentValue);
    xirr = calculateXirr(cashFlows);
  }

  // ---- SIP Streak ----
  const sipStreak = calculateSipStreak(entries.map((e) => e.purchase_date));

  const summary: DashboardSummary = {
    totalInvested,
    totalUnits,
    currentValue,
    unallottedCash,
    gainLoss,
    gainLossPct,
    cgtStatus,
    cgtMessage,
    estimatedCgtLongTerm,
    estimatedCgtShortTerm,
    cgtTaxableLongTerm,
    cgtTaxableShortTerm,
    xirr,
    sipStreak,
    latestNav,
    latestNavDate,
  };

  // ---- Chart data ----
  // NAV history & Portfolio Value timeline — built PER FUND throughout,
  // because a blended/scalar NAV is only valid when exactly one fund is in
  // view. Tracking each fund's own units and NAV independently prevents one
  // fund's NAV from overwriting another's on a shared date.

  const fundNavTimeline = new Map<string, Map<string, number>>(); // fundId -> date -> nav
  const ensureFundMap = (fid: string) => {
    if (!fundNavTimeline.has(fid)) fundNavTimeline.set(fid, new Map());
    return fundNavTimeline.get(fid)!;
  };

  // 1. Seed with entry purchase NAVs, each tagged to its own fund
  for (const entry of entries) {
    if (entry.purchase_date && entry.nav) {
      ensureFundMap(entry.fund_id).set(entry.purchase_date, Number(entry.nav));
    }
  }

  // 2. Overlay nav_history rows, each tagged to its own fund_id (never mixed)
  for (const row of navHistory) {
    ensureFundMap(row.fund_id).set(row.nav_date, Number(row.nav_value));
  }

  // 3. Ensure each fund's own latest NAV/date is included in ITS OWN map
  for (const f of funds) {
    if (f.latest_nav && f.latest_nav_date) {
      ensureFundMap(f.id).set(f.latest_nav_date, Number(f.latest_nav));
    }
  }

  // Combined timeline of every date anything happened, across every fund in view
  const timelineDates = Array.from(
    new Set([
      ...entries.map((e) => e.purchase_date),
      ...Array.from(fundNavTimeline.values()).flatMap((m) =>
        Array.from(m.keys())
      ),
    ])
  ).sort((a, b) => a.localeCompare(b));

  // Running state PER FUND — units accumulated and last-known NAV.
  const runningUnitsByFund = new Map<string, number>();
  const lastKnownNavByFund = new Map<string, number>();
  for (const f of funds) {
    const firstEntry = entries
      .filter((e) => e.fund_id === f.id)
      .sort((a, b) => a.purchase_date.localeCompare(b.purchase_date))[0];
    if (firstEntry) lastKnownNavByFund.set(f.id, Number(firstEntry.nav));
    runningUnitsByFund.set(f.id, 0);
  }

  const processedEntryIds = new Set<string>();
  const portfolioChart: PortfolioChartPoint[] = [];
  const blendedNavPoints: ChartDataPoint[] = []; // used only for "All Funds" NAV chart
  let runningInvested = 0;

  for (const dt of timelineDates) {
    const entriesOnDate = entries.filter(
      (e) => e.purchase_date <= dt && !processedEntryIds.has(e.id)
    );
    for (const e of entriesOnDate) {
      runningUnitsByFund.set(
        e.fund_id,
        (runningUnitsByFund.get(e.fund_id) || 0) + Number(e.units)
      );
      runningInvested += Number(e.amount);
      processedEntryIds.add(e.id);
    }

    // Update each fund's own last-known NAV independently
    for (const [fid, fundMap] of fundNavTimeline.entries()) {
      if (fundMap.has(dt)) {
        lastKnownNavByFund.set(fid, fundMap.get(dt)!);
      }
    }

    let portfolioValue = 0;
    let totalUnitsAtDate = 0;
    for (const f of funds) {
      const units = runningUnitsByFund.get(f.id) || 0;
      const nav = lastKnownNavByFund.get(f.id) || 0;
      portfolioValue += units * nav;
      totalUnitsAtDate += units;
    }

    portfolioChart.push({
      date: dt,
      portfolioValue,
      totalInvested: runningInvested,
    });

    if (totalUnitsAtDate > 0) {
      blendedNavPoints.push({
        date: dt,
        value: portfolioValue / totalUnitsAtDate,
      });
    }
  }

  // NAV history chart: a single selected fund shows its own real NAV series.
  // "All Funds" shows the weighted blended per-unit value instead.
  const navHistorySeries: ChartDataPoint[] = scopedFundId
    ? Array.from((fundNavTimeline.get(scopedFundId) ?? new Map()).entries())
        .map(([date, value]) => ({ date, value }))
        .sort((a, b) => a.date.localeCompare(b.date))
    : blendedNavPoints;

  // ---- Monthly contributions ----
  const monthlyMap = new Map<
    string,
    { total: number; breakdownMap: Map<string, number> }
  >();
  for (const entry of entries) {
    const monthKey = entry.purchase_date
      ? entry.purchase_date.substring(0, 7)
      : "";
    if (monthKey) {
      if (!monthlyMap.has(monthKey)) {
        monthlyMap.set(monthKey, { total: 0, breakdownMap: new Map() });
      }
      const mData = monthlyMap.get(monthKey)!;
      mData.total += Number(entry.amount);

      const fundName =
        funds.find((f) => f.id === entry.fund_id)?.fund_name || "Unknown Fund";
      mData.breakdownMap.set(
        fundName,
        (mData.breakdownMap.get(fundName) || 0) + Number(entry.amount)
      );
    }
  }
  const monthlyContributions: MonthlyContribution[] = Array.from(
    monthlyMap.entries()
  ).map(([month, mData]) => ({
    month,
    amount: mData.total,
    breakdown: Array.from(mData.breakdownMap.entries()).map(
      ([fundName, amount]) => ({ fundName, amount })
    ),
  }));

  // ---- Fee drag ----
  const feeRatePct = scopedFundId
    ? Number(funds.find((f) => f.id === scopedFundId)?.fee_rate_pct ?? 0)
    : funds.length > 0
      ? funds.reduce((sum, f) => sum + Number(f.fee_rate_pct), 0) / funds.length
      : 0;

  const feeDragEntries = prepareFeeDragEntries(
    entries.map((e) => ({
      purchase_date: e.purchase_date,
      nav: Number(e.nav),
      units: Number(e.units),
    }))
  );
  const feeDragChart: FeeDragPoint[] = calculateFeeDrag(
    feeDragEntries,
    feeRatePct
  );

  return {
    summary,
    funds,
    portfolioChart,
    monthlyContributions,
    navHistory: navHistorySeries,
    feeDragChart,
    entries,
  };
}

/**
 * Chronological rollover-wallet balance for a single fund.
 * Mirrors the web app's `getFundRolloverCash()`.
 */
export function computeFundRolloverCash(
  entries: Array<{
    amount: number;
    nav: number;
    units: number;
    purchase_date: string;
    created_at: string;
  }>
): number {
  const sorted = [...entries].sort(
    (a, b) =>
      parseDateSafe(a.purchase_date).getTime() -
        parseDateSafe(b.purchase_date).getTime() ||
      new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );

  let runningRollover = 0;
  for (const entry of sorted) {
    const freshAmount = Number(entry.amount);
    const dpFee = freshAmount >= DP_CHARGE ? DP_CHARGE : 0;
    const totalAvailable = freshAmount + runningRollover;
    const netCash = Math.max(0, totalAvailable - dpFee);
    const unitCost = Number(entry.units) * Number(entry.nav);
    runningRollover = Math.max(0, netCash - unitCost);
  }

  return runningRollover;
}

/**
 * Per-entry rollover breakdown used by the History table.
 * Mirrors the web app's `breakdownMap` in `entry-table.tsx`.
 */
export function computeEntryBreakdowns(
  entries: Entry[]
): Map<string, EntryBreakdownLite> {
  const sortedAsc = [...entries].sort(
    (a, b) =>
      parseDateSafe(a.purchase_date).getTime() -
        parseDateSafe(b.purchase_date).getTime() ||
      new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );

  const map = new Map<string, EntryBreakdownLite>();
  const fundRollovers = new Map<string, number>();

  for (const entry of sortedAsc) {
    const carriedRollover = fundRollovers.get(entry.fund_id) || 0;
    const freshAmount = Number(entry.amount);
    const dpFee = freshAmount >= DP_CHARGE ? DP_CHARGE : 0;
    const totalAvailable = freshAmount + carriedRollover;
    const netCash = Math.max(0, totalAvailable - dpFee);
    const unitCost = Number(entry.units) * Number(entry.nav);
    const remainingRollover = Math.max(0, netCash - unitCost);

    fundRollovers.set(entry.fund_id, remainingRollover);

    map.set(entry.id, {
      freshAmount,
      carriedRollover,
      totalAvailable,
      dpFee,
      netCash,
      unitCost,
      remainingRollover,
    });
  }

  return map;
}

export interface EntryBreakdownLite {
  freshAmount: number;
  carriedRollover: number;
  totalAvailable: number;
  dpFee: number;
  netCash: number;
  unitCost: number;
  remainingRollover: number;
}
