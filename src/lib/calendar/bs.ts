// ============================================================
// SahakariSIP — Bikram Sambat (BS) Calendar Helpers
// ============================================================
// Ported from web app (src/lib/calendar/bs.ts).
// Uses nepali-date-converter package for AD <-> BS conversion.
// All dates stored in DB as Gregorian (AD) "YYYY-MM-DD" strings.
// Conversion to/from BS happens only at scheduling/display boundary.
// ============================================================

import NepaliDatePkg from "nepali-date-converter";

// The package is CJS; under plain Node ESM the default import is the
// module.exports object, so resolve the class from `.default` when present.
const NepaliDate = ((NepaliDatePkg as any).default ?? NepaliDatePkg) as typeof NepaliDatePkg;

export const BS_MONTH_NAMES = [
  "Baisakh",
  "Jestha",
  "Asar",
  "Shrawan",
  "Bhadra",
  "Aswin",
  "Kartik",
  "Mangsir",
  "Poush",
  "Magh",
  "Falgun",
  "Chaitra",
] as const;

export interface BSDate {
  /** BS year, e.g. 2083 */
  year: number;
  /** BS month index 0-11 (0 = Baisakh) */
  month: number;
  /** BS day of month, 1-32 */
  day: number;
}

const kathmanduFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Kathmandu",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Calendar-day components of an instant in Nepal time. */
export function getNepalDateComponents(date: Date): { year: number; month: number; day: number } {
  const parts = kathmanduFormatter.formatToParts(date);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return { year: get("year"), month: get("month") - 1, day: get("day") };
}

/** AD date as "YYYY-MM-DD" for a given Nepal-calendar day. */
export function adToString({ year, month, day }: { year: number; month: number; day: number }): string {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** Today's AD date ("YYYY-MM-DD") in Nepal time, regardless of server timezone. */
export function nepalTodayAD(): string {
  return adToString(getNepalDateComponents(new Date()));
}

/** Parse an AD "YYYY-MM-DD" string into Nepal-calendar day components. */
export function parseADString(dateStr: string): { year: number; month: number; day: number } {
  const [year, month, day] = dateStr.split("-").map(Number);
  return { year, month: month - 1, day };
}

/** Convert an AD "YYYY-MM-DD" string to BS. Throws if outside the library's supported range (BS 2000-2090). */
export function adToBS(dateStr: string): BSDate {
  const { year, month, day } = parseADString(dateStr);
  // Noon UTC keeps the calendar day stable under any server timezone, since the
  // library reads local-time components from the JS Date.
  const bs = new NepaliDate(new Date(Date.UTC(year, month, day, 12)));
  return { year: bs.getYear(), month: bs.getMonth(), day: bs.getDate() };
}

/** Convert a BS date to an AD "YYYY-MM-DD" string. Throws if outside the library's supported range. */
export function bsToADString(bs: BSDate): string {
  const ad = new NepaliDate(bs.year, bs.month, bs.day).getAD();
  return adToString({ year: ad.year, month: ad.month, day: ad.date });
}

/** BS day-of-month (1-32) for an AD "YYYY-MM-DD" string. */
export function getBSDayOfMonth(dateStr: string): number {
  return adToBS(dateStr).day;
}

/** Number of days in a BS month (BS months have 29-32 days depending on the year). */
export function getBSDaysInMonth(year: number, month: number): number {
  const next = month === 11 ? { year: year + 1, month: 0 } : { year, month: month + 1 };
  const nextStartAD = bsToADString({ year: next.year, month: next.month, day: 1 });
  const { year: y, month: m, day: d } = parseADString(nextStartAD);
  const lastDay = new Date(Date.UTC(y, m, d) - 24 * 60 * 60 * 1000);
  const lastDayStr = `${lastDay.getUTCFullYear()}-${String(lastDay.getUTCMonth() + 1).padStart(2, "0")}-${String(lastDay.getUTCDate()).padStart(2, "0")}`;
  // The BS day number of the month's final day is the month's length.
  return adToBS(lastDayStr).day;
}

/**
 * AD "YYYY-MM-DD" of a due date in a BS month, clamped to the last day of that
 * month when the target day exceeds the month's length (e.g. day 32 in a
 * 31-day month lands on the 31st).
 */
export function bsDueDateToAD(year: number, month: number, targetDay: number): string {
  const daysInMonth = getBSDaysInMonth(year, month);
  return bsToADString({ year, month, day: Math.min(targetDay, daysInMonth) });
}

/** Start of the next BS month as an AD "YYYY-MM-DD" string. */
export function nextBSMonthStart(year: number, month: number): string {
  const next = month === 11 ? { year: year + 1, month: 0 } : { year, month: month + 1 };
  return bsToADString({ year: next.year, month: next.month, day: 1 });
}

/** "Shrawan 25, 2082" style label for an AD "YYYY-MM-DD" string. */
export function formatBSDate(dateStr: string): string {
  const bs = adToBS(dateStr);
  return `${BS_MONTH_NAMES[bs.month]} ${bs.day}, ${bs.year}`;
}

/** Whole-day difference between two AD "YYYY-MM-DD" strings (b - a). */
export function adDayDifference(a: string, b: string): number {
  const toUTC = (s: string) => {
    const { year, month, day } = parseADString(s);
    return Date.UTC(year, month, day);
  };
  return Math.round((toUTC(b) - toUTC(a)) / (24 * 60 * 60 * 1000));
}

export interface DueSchedule {
  /** Next upcoming installment due date, "YYYY-MM-DD" */
  nextDue: string;
  /** Previous installment due date (start of the current payment cycle), "YYYY-MM-DD" */
  prevDue: string;
  /** Whole days from today until nextDue */
  daysRemaining: number;
}

export type CalendarSystem = "AD" | "BS";
export type SIPFrequency = "MONTHLY" | "QUARTERLY" | "SEMI_ANNUALLY" | "ANNUALLY";

/** Calendar-month step per frequency. Never a fixed day count. */
export const FREQUENCY_MONTHS: Record<SIPFrequency, number> = {
  MONTHLY: 1,
  QUARTERLY: 3,
  SEMI_ANNUALLY: 6,
  ANNUALLY: 12,
};

export interface SIPScheduleInput {
  frequency: SIPFrequency;
  calendarSystem: CalendarSystem;
  /** The user's registered first due date, AD "YYYY-MM-DD". */
  anchorDate: string;
}

/** Add (signed) calendar months to an AD date, clamping to the real month length (Jan 31 + 1m = Feb 28/29). */
function addADMonths(dateStr: string, months: number): string {
  const { year, month, day } = parseADString(dateStr);
  const total = month + months;
  const y = year + Math.floor(total / 12);
  const m = ((total % 12) + 12) % 12;
  const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return adToString({ year: y, month: m, day: Math.min(day, lastDay) });
}

/** Add (signed) calendar months to a BS date, clamping to the verified BS month length. */
function addBSMonths(bs: BSDate, months: number): BSDate {
  const total = bs.month + months;
  const year = bs.year + Math.floor(total / 12);
  const month = ((total % 12) + 12) % 12;
  return { year, month, day: bs.day };
}

/**
 * The k-th installment due date (k may be negative) computed FROM THE ANCHOR,
 * never chained from the previous occurrence. Recurrence happens in the SIP's
 * own calendar system; BS occurrences are converted to AD with the verified
 * calendar. Weekend/holiday never shifts a due date.
 */
export function installmentDueDate(sip: SIPScheduleInput, k: number): string {
  const step = FREQUENCY_MONTHS[sip.frequency] * k;
  if (sip.calendarSystem === "AD") {
    return k === 0 ? sip.anchorDate : addADMonths(sip.anchorDate, step);
  }
  const anchorBS = adToBS(sip.anchorDate);
  const occ = addBSMonths(anchorBS, step);
  return bsDueDateToAD(occ.year, occ.month, anchorBS.day);
}

/**
 * The next `count` installment due dates on/after today, derived from the
 * registered schedule. Used for previews (e.g. the fund edit dialog's
 * "Next SIP Installments") - the cron and dashboard read single
 * next/prev values via computeSchedule.
 *
 * Pass `startFromAnchor: true` to preview the schedule itself (installments
 * #1, #2, #3 from the registered first due date) instead of skipping to
 * the next upcoming one.
 */
export function upcomingDueDates(
  sip: SIPScheduleInput,
  todayStr: string,
  count: number,
  startFromAnchor = false
): string[] {
  const step = FREQUENCY_MONTHS[sip.frequency];
  let k = 0;
  if (!startFromAnchor) {
    const { year: ty, month: tm } = parseADString(todayStr);
    const { year: ay, month: am } = parseADString(sip.anchorDate);
    k = Math.max(0, Math.floor(((ty - ay) * 12 + (tm - am)) / step));
    let due = installmentDueDate(sip, k);
    let guard = 0;
    while (due < todayStr && guard++ < 5000) {
      k += 1;
      due = installmentDueDate(sip, k);
    }
  }
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    out.push(installmentDueDate(sip, k + i));
  }
  return out;
}

/**
 * The ONE scheduling entry point: next/previous installment due dates derived
 * from the user's REGISTERED schedule. Dashboard, calendar, history and
 * notifications must all read through this - no screen-specific date math.
 */
export function computeSchedule(sip: SIPScheduleInput, todayStr: string): DueSchedule {
  const step = FREQUENCY_MONTHS[sip.frequency];
  // Jump close to today, then walk forward - occurrences are monotonic in k.
  const { year: ty, month: tm } = parseADString(todayStr);
  const { year: ay, month: am } = parseADString(sip.anchorDate);
  let k = Math.max(0, Math.floor(((ty - ay) * 12 + (tm - am)) / step));
  let nextDue = installmentDueDate(sip, k);
  while (nextDue < todayStr) {
    k += 1;
    nextDue = installmentDueDate(sip, k);
  }
  return {
    nextDue,
    prevDue: installmentDueDate(sip, k - 1),
    daysRemaining: adDayDifference(todayStr, nextDue),
  };
}