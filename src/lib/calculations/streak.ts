// ============================================================
// SahakariSIP — SIP Streak Calculator
// ============================================================
//
// Count of consecutive calendar months (most recent backwards from today)
// that have at least one entry for that fund.
// A gap month (no entry) breaks the streak.
// ============================================================

import { format, subMonths } from "date-fns";
import { parseDateSafe } from "../format";

/**
 * Calculate the SIP streak — consecutive months with at least one entry,
 * counting backwards from the current month.
 *
 * @param entryDates Array of purchase date strings (ISO format)
 * @returns Number of consecutive months in the streak
 */
export function calculateSipStreak(entryDates: string[]): number {
  if (entryDates.length === 0) return 0;

  // Build a Set of unique months that have entries
  const monthsWithEntries = new Set<string>();
  for (const dateStr of entryDates) {
    const monthKey = format(parseDateSafe(dateStr), "yyyy-MM");
    monthsWithEntries.add(monthKey);
  }

  // Walk backwards from the current month
  let streak = 0;
  let checkDate = new Date();

  for (let i = 0; i < 120; i++) {
    // Max 10 years back
    const monthKey = format(checkDate, "yyyy-MM");

    if (monthsWithEntries.has(monthKey)) {
      streak++;
      checkDate = subMonths(checkDate, 1);
    } else {
      break;
    }
  }

  return streak;
}
