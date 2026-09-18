// ============================================================
// SahakariSIP — Projection Calculator
// ============================================================
//
// Projects future SIP growth from the current corpus.
// Uses monthly compounding, seeded with today's actual portfolio value.
// Supports step-up (annual increase in SIP amount).
// ============================================================

import type {
  ProjectionParams,
  ProjectionRow,
  ProjectionChartPoint,
} from "../types";
import { PROJECTION_YEARS } from "../constants";
import { toDateKey } from "../format";

/**
 * Calculate future value projections for a SIP portfolio.
 *
 * Seeded with the current corpus (not zero) — projections continue from
 * where the real data currently stands.
 *
 * @returns Array of projection rows for the table (at 5, 10, 15, 20 years)
 */
export function calculateProjectionTable(
  params: ProjectionParams
): ProjectionRow[] {
  const {
    currentCorpus,
    monthlySip,
    annualReturnPct,
    stepUpPct,
    realPrincipalSoFar,
  } = params;
  const monthlyRate = annualReturnPct / 100 / 12;

  const rows: ProjectionRow[] = [];

  for (const year of PROJECTION_YEARS) {
    const totalMonths = year * 12;
    let corpus = currentCorpus;
    let totalInvested = 0; // Additional investment beyond current corpus
    let currentMonthlySip = monthlySip;

    for (let month = 1; month <= totalMonths; month++) {
      // Apply step-up at every 12-month boundary
      if (stepUpPct > 0 && month > 1 && (month - 1) % 12 === 0) {
        currentMonthlySip *= 1 + stepUpPct / 100;
      }

      // Monthly compounding: grow existing corpus, then add new SIP
      corpus = corpus * (1 + monthlyRate) + currentMonthlySip;
      totalInvested += currentMonthlySip;
    }

    rows.push({
      year,
      monthlySip: Math.round(currentMonthlySip), // Current SIP at that year
      corpusValue: Math.round(corpus),
      totalInvested: Math.round(totalInvested + realPrincipalSoFar),
      totalGain: Math.round(corpus - totalInvested - realPrincipalSoFar),
    });
  }

  return rows;
}

/**
 * Generate monthly chart data points for projection visualization.
 * Returns points for the full projection period (up to 20 years).
 */
export function calculateProjectionChartData(
  historicalData: Array<{ date: string; value: number }>,
  params: ProjectionParams
): ProjectionChartPoint[] {
  const points: ProjectionChartPoint[] = [];

  // Add historical (actual) data points
  for (const point of historicalData) {
    points.push({
      date: point.date,
      value: point.value,
      type: "actual",
    });
  }

  // Generate projected points (monthly for 20 years)
  const { currentCorpus, monthlySip, annualReturnPct, stepUpPct } = params;
  const monthlyRate = annualReturnPct / 100 / 12;
  const totalMonths = 20 * 12; // Always project 20 years for the chart

  let corpus = currentCorpus;
  let currentMonthlySip = monthlySip;
  const today = new Date();

  for (let month = 1; month <= totalMonths; month++) {
    // Apply step-up
    if (stepUpPct > 0 && month > 1 && (month - 1) % 12 === 0) {
      currentMonthlySip *= 1 + stepUpPct / 100;
    }

    corpus = corpus * (1 + monthlyRate) + currentMonthlySip;

    // Create a date for this point
    const pointDate = new Date(today);
    pointDate.setMonth(pointDate.getMonth() + month);

    points.push({
      date: toDateKey(pointDate),
      value: Math.round(corpus),
      type: "projected",
    });
  }

  return points;
}
