// ============================================================
// SahakariSIP — Formatting Utilities
// ============================================================
// Ported verbatim from the web app (src/lib/format.ts).
// ============================================================

import { format, formatDistanceToNow } from "date-fns";
import { CURRENCY_CODE, CURRENCY_LOCALE } from "./constants";

/**
 * Format a number as NPR currency with international digit grouping.
 * e.g. 1234567.89 → "NPR 1,234,567.89"
 */
export function formatCurrency(value: number, showSign = false): string {
  const formatted = new Intl.NumberFormat(CURRENCY_LOCALE, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Math.abs(value));

  const sign = showSign && value > 0 ? "+" : value < 0 ? "-" : "";
  return `${CURRENCY_CODE} ${sign}${formatted}`;
}

/**
 * Format a number as NPR without decimals (for summary cards).
 * e.g. 1234567 → "NPR 1,234,567"
 */
export function formatCurrencyWhole(value: number, showSign = false): string {
  const formatted = new Intl.NumberFormat(CURRENCY_LOCALE, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(Math.abs(value));

  const sign = showSign && value > 0 ? "+" : value < 0 ? "-" : "";
  return `${CURRENCY_CODE} ${sign}${formatted}`;
}

/**
 * Format a percentage value.
 * e.g. 12.345 → "+12.35%" or "-3.20%"
 */
export function formatPercentage(
  value: number | null | undefined,
  showSign = true
): string {
  if (value === null || value === undefined || isNaN(value)) return "—";
  const sign = showSign && value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
}

/**
 * Format units with 4 decimal places (standard mutual fund precision).
 * e.g. 12345.6789 → "12,345.6789"
 */
export function formatUnits(value: number): string {
  return new Intl.NumberFormat(CURRENCY_LOCALE, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 4,
  }).format(value);
}

/**
 * Format NAV with 2 decimal places.
 * e.g. 13.25 → "13.25"
 */
export function formatNav(value: number): string {
  return value.toFixed(2);
}

/**
 * Format a date string for display.
 * e.g. "2024-03-15" → "Mar 15, 2024"
 */
export function formatDate(dateStr: string): string {
  if (!dateStr) return "—";
  return format(parseDateSafe(dateStr), "MMM d, yyyy");
}

/**
 * Format a date for chart axis.
 * e.g. "2024-03-15" → "Mar '24"
 */
export function formatDateShort(dateStr: string): string {
  if (!dateStr) return "";
  return format(parseDateSafe(dateStr), "MMM ''yy");
}

/**
 * Format a date as relative time.
 * e.g. "2 days ago"
 */
export function formatRelativeDate(dateStr: string): string {
  return formatDistanceToNow(parseDateSafe(dateStr), { addSuffix: true });
}

/**
 * Format a month key.
 * e.g. "2024-03" → "Mar 2024"
 */
export function formatMonth(monthKey: string): string {
  const [year, month] = monthKey.split("-");
  const date = new Date(parseInt(year, 10), parseInt(month, 10) - 1, 1);
  return format(date, "MMM yyyy");
}

/**
 * Format a month key compactly for chart axes.
 * e.g. "2024-03" → "Mar '24"
 */
export function formatMonthShort(monthKey: string): string {
  const [year, month] = monthKey.split("-");
  const date = new Date(parseInt(year, 10), parseInt(month, 10) - 1, 1);
  return format(date, "MMM ''yy");
}

/**
 * Format SIP streak for display.
 * e.g. 14 → "14 months 🔥", 0 → "0 months"
 */
export function formatStreak(months: number): string {
  if (months === 0) return "0 months";
  const label = months === 1 ? "1 month" : `${months} months`;
  return months >= 3 ? `${label} 🔥` : label;
}

/**
 * Compact large currency values for chart axes.
 * e.g. 125000 → "125k"
 */
export function formatCompact(value: number): string {
  if (Math.abs(value) >= 10000000) return `${(value / 10000000).toFixed(1)}Cr`;
  if (Math.abs(value) >= 100000) return `${(value / 100000).toFixed(1)}L`;
  if (Math.abs(value) >= 1000) return `${Math.round(value / 1000)}k`;
  return `${Math.round(value)}`;
}

// ---------- Internal helpers ----------

/**
 * Parse "YYYY-MM-DD" as a *local* midnight date.
 *
 * `new Date("2024-03-15")` is parsed as UTC midnight, which shifts to the
 * previous day in negative-offset timezones (e.g. Nepal is UTC+5:45, but a
 * user in the Americas would see "Mar 14"). Parsing the components manually
 * keeps dates stable regardless of device timezone — same approach the web
 * app uses in `buildCashFlows`.
 */
export function parseDateSafe(dateStr: string): Date {
  if (!dateStr) return new Date(NaN);
  const parts = dateStr.split("-").map(Number);
  if (parts.length === 3 && !parts.some(isNaN)) {
    return new Date(parts[0], parts[1] - 1, parts[2]);
  }
  return new Date(dateStr);
}

/** Convert a Date to a "YYYY-MM-DD" local-date string (no timezone drift). */
export function toDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = `${date.getMonth() + 1}`.padStart(2, "0");
  const d = `${date.getDate()}`.padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Today as a "YYYY-MM-DD" local-date string. */
export function todayKey(): string {
  return toDateKey(new Date());
}
