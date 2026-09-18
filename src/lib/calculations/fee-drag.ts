// ============================================================
// SahakariSIP — Fee Drag Calculator
// ============================================================
//
// The fee is NOT charged separately — it's embedded in the published NAV.
// This calculation is ILLUSTRATIVE: it shows what the fee "would look like"
// as a standalone deduction.
//
// Formula:
//   Monthly fee drag = corpus value × (fee_rate_pct / 100 / 12)
//   Cumulative = running sum
// ============================================================

import type { FeeDragPoint } from "../types";

interface FeeDragEntry {
  purchase_date: string;
  nav: number;
  cumulativeUnits: number; // Running total of units at this entry's date
}

/**
 * Calculate cumulative fee drag over time.
 *
 * At each entry date, we compute the corpus value (cumulative units × NAV at that date)
 * and apply the monthly fee rate to estimate what that period's fee drag looks like.
 */
export function calculateFeeDrag(
  entries: FeeDragEntry[],
  feeRatePct: number
): FeeDragPoint[] {
  if (entries.length === 0) return [];

  const monthlyRate = feeRatePct / 100 / 12;
  let cumulativeDrag = 0;
  const result: FeeDragPoint[] = [];

  for (const entry of entries) {
    const corpusValue = entry.cumulativeUnits * entry.nav;
    const monthlyDrag = corpusValue * monthlyRate;
    cumulativeDrag += monthlyDrag;

    result.push({
      date: entry.purchase_date,
      cumulativeDrag: Math.round(cumulativeDrag * 100) / 100,
      monthlyDrag: Math.round(monthlyDrag * 100) / 100,
    });
  }

  return result;
}

/**
 * Prepare entries for fee drag calculation by computing cumulative units at each date.
 */
export function prepareFeeDragEntries(
  entries: Array<{ purchase_date: string; nav: number; units: number }>
): FeeDragEntry[] {
  let cumulativeUnits = 0;

  return entries.map((entry) => {
    cumulativeUnits += entry.units;
    return {
      purchase_date: entry.purchase_date,
      nav: entry.nav,
      cumulativeUnits,
    };
  });
}
