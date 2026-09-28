// ============================================================
// SahakariSIP — Resolve the EFFECTIVE SIP schedule for a fund.
// ============================================================
// Ported from web app (src/lib/sip-schedule.ts).
//
// Priority (per product rule):
//   1. The user's CONFIRMED registered schedule (frequency,
//      calendar, anchor).
//   2. Fallback: the user's own SIP registration/start date, treated as a
//      monthly BS anchor. Bank-confirmed rule (Siddhartha Capital,
//      2026-09-24): every installment repeats the initial payment date on
//      the BS calendar, so recurrence runs in BS and converts to AD for
//      display. Still user-entered data - the app never derives a due
//      date from payment history or fund-name assumptions.
//
// One resolver, used by cards, dashboard and the reminder cron -
// no screen computes its own schedule.
// ============================================================

import type { SIPScheduleInput } from "./calendar/bs";

export interface FundScheduleFields {
  frequency: SIPScheduleInput["frequency"] | null;
  calendar_system: SIPScheduleInput["calendarSystem"] | null;
  anchor_date: string | null;
  start_date: string;
  schedule_verified: boolean;
}

export interface ResolvedSchedule {
  sip: SIPScheduleInput;
  /** "registered" = user-confirmed; "registration" = derived from the start date. */
  source: "registered" | "registration";
}

export function resolveSchedule(f: FundScheduleFields): ResolvedSchedule {
  if (f.schedule_verified && f.frequency && f.calendar_system && f.anchor_date) {
    return {
      sip: { frequency: f.frequency, calendarSystem: f.calendar_system, anchorDate: f.anchor_date },
      source: "registered",
    };
  }
  return {
    sip: { frequency: "MONTHLY", calendarSystem: "BS", anchorDate: f.start_date },
    source: "registration",
  };
}