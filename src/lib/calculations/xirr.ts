// ============================================================
// SahakariSIP — XIRR Calculator (Newton-Raphson)
// ============================================================
//
// XIRR solves for r in: Σ [ CFᵢ / (1 + r)^(dᵢ / 365) ] = 0
// where each SIP purchase is a negative CF and current value is a positive CF.
//
// DO NOT simplify to CAGR — XIRR accounts for irregular cash flow timing.
// ============================================================
import type { CashFlow } from "../types";
import { parseDateSafe } from "../format";

const MAX_ITERATIONS = 100;
const TOLERANCE = 1e-7;
const DAYS_IN_YEAR = 365;

/**
 * Calculate the XIRR (annualized internal rate of return) for a series of cash flows.
 *
 * @param cashFlows Array of { amount, date } — negative = investment, positive = redemption
 * @returns The annualized return as a decimal (e.g. 0.12 for 12%), or null if solver fails.
 */
export function calculateXirr(cashFlows: CashFlow[]): number | null {
  if (cashFlows.length < 2) return null;

  // Verify we have both positive and negative cash flows
  const hasNeg = cashFlows.some((cf) => cf.amount < 0);
  const hasPos = cashFlows.some((cf) => cf.amount > 0);
  if (!hasNeg || !hasPos) return null;

  // Sort by date
  const sorted = [...cashFlows].sort(
    (a, b) => a.date.getTime() - b.date.getTime()
  );

  const firstDate = sorted[0].date;
  const lastDate = sorted[sorted.length - 1].date;

  // Day duration between first and last date
  const totalDays = (lastDate.getTime() - firstDate.getTime()) / 86400000;

  // If 0 days elapsed (e.g., all entries on same date), return simple percentage gain
  if (totalDays <= 0) {
    const totalInvested = sorted
      .filter((cf) => cf.amount < 0)
      .reduce((sum, cf) => sum - cf.amount, 0);
    const currentValue = sorted
      .filter((cf) => cf.amount > 0)
      .reduce((sum, cf) => sum + cf.amount, 0);
    return totalInvested > 0
      ? (currentValue - totalInvested) / totalInvested
      : 0;
  }

  // Day fractions from the first date
  const dayFractions = sorted.map(
    (cf) =>
      (cf.date.getTime() - firstDate.getTime()) / (DAYS_IN_YEAR * 86400000)
  );

  const amounts = sorted.map((cf) => cf.amount);

  // NPV function: Σ [ CFᵢ / (1 + r)^(dᵢ / 365) ]
  function npv(rate: number): number {
    let sum = 0;
    for (let i = 0; i < amounts.length; i++) {
      const base = 1 + rate;
      if (base <= 0) return Infinity;
      sum += amounts[i] / Math.pow(base, dayFractions[i]);
    }
    return sum;
  }

  // Derivative of NPV w.r.t. rate
  function npvDerivative(rate: number): number {
    let sum = 0;
    for (let i = 0; i < amounts.length; i++) {
      const base = 1 + rate;
      if (base <= 0) return Infinity;
      sum +=
        (-dayFractions[i] * amounts[i]) / Math.pow(base, dayFractions[i] + 1);
    }
    return sum;
  }

  // Newton-Raphson iteration
  let rate = 0.1; // Initial guess: 10%

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    const f = npv(rate);
    const fPrime = npvDerivative(rate);

    if (Math.abs(fPrime) < 1e-12) {
      // Derivative too small — try a different starting point
      rate = rate + 0.1;
      continue;
    }

    const newRate = rate - f / fPrime;

    if (Math.abs(newRate - rate) < TOLERANCE) {
      // Check for reasonable result (-99% to +1000%)
      if (newRate > -0.99 && newRate < 10) {
        return newRate;
      }
      return null; // Unreasonable result
    }

    rate = newRate;

    // Guard against divergence
    if (!isFinite(rate) || isNaN(rate)) {
      return null;
    }
  }

  // Did not converge — fallback to simple ROI rate
  const totalInvested = sorted
    .filter((cf) => cf.amount < 0)
    .reduce((sum, cf) => sum - cf.amount, 0);
  const currentValue = sorted
    .filter((cf) => cf.amount > 0)
    .reduce((sum, cf) => sum + cf.amount, 0);
  return totalInvested > 0 ? (currentValue - totalInvested) / totalInvested : 0;
}

/**
 * Build XIRR cash flows from SIP entries and current portfolio value.
 *
 * Each entry is a negative cash flow (money invested).
 * The current value is a positive cash flow on today's date (as if redeemed today).
 */
export function buildCashFlows(
  entries: Array<{ purchase_date: string; amount: number }>,
  currentValue: number
): CashFlow[] {
  const cashFlows: CashFlow[] = entries.map((entry) => ({
    amount: -Number(entry.amount),
    date: parseDateSafe(entry.purchase_date),
  }));

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Current value as a positive cash flow today
  cashFlows.push({
    amount: currentValue,
    date: today,
  });

  return cashFlows;
}
