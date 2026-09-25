// ============================================================
// SahakariSIP - Local installment reminders (on-device)
// ============================================================
// The web app's daily cron sends Web Push (VAPID) + email - neither
// reaches a native Android app, and the APK never registered a push
// token. So the APK schedules OS notifications locally instead.
//
// Due dates come from the SAME source as the web: fund_config's
// registered schedule columns resolved by the central schedule engine
// (src/lib/sip-schedule.ts) - phone and web always agree on when an
// installment is due, and a schedule confirmed on either device works.
//
// Cadence (NOT daily): a countdown-style ladder - the first reminder
// fires 10 days before the due date, then 5, 3, and 1 day remaining,
// plus one notification on the due date itself. Reminders are
// re-scheduled on every app open (no server, no background service),
// and a cycle that is already paid (an entry recorded after the
// previous due date) gets none - the same suppression rule as the web
// cron.
// ============================================================

import Constants, { ExecutionEnvironment } from "expo-constants";
import type { DataStore } from "../data/store";
import { nepalTodayAD, computeSchedule, formatBSDate } from "../calendar/bs";
import { resolveSchedule } from "../sip-schedule";

const REMINDER_DAYS = [10, 5, 3, 1, 0];
const FIRE_HOUR_NEPAL = 9;

function fireDate(dueDate: string, daysBefore: number): Date {
  const base = new Date(
    `${dueDate}T${String(FIRE_HOUR_NEPAL).padStart(2, "0")}:00:00+05:45`
  );
  base.setDate(base.getDate() - daysBefore);
  return base;
}

const isExpoGo =
  Constants.appOwnership === "expo" ||
  Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

async function getNotificationsModule() {
  if (isExpoGo) return null;
  try {
    return await import("expo-notifications");
  } catch {
    return null;
  }
}

/** Drop every pending local reminder (toggle off, sign-out, refresh). */
export async function cancelLocalReminders(): Promise<void> {
  try {
    const Notifications = await getNotificationsModule();
    if (!Notifications) return;
    await Notifications.cancelAllScheduledNotificationsAsync();
  } catch {
    // Nothing scheduled / module unavailable.
  }
}

/**
 * Re-schedule local reminders for every active fund. Called when push is
 * enabled and on every app open, so the weekly trigger dates stay current.
 * A fund whose current cycle is already paid gets no reminders until the
 * next cycle - matching the web cron's suppression rule.
 */
export async function refreshLocalReminders(store: DataStore): Promise<void> {
  try {
    const Notifications = await getNotificationsModule();
    if (!Notifications) return;

    const { status } = await Notifications.getPermissionsAsync();
    if (status !== "granted") return;

    const fundsRes = await store.getFundConfigs();
    const funds = fundsRes.success ? fundsRes.data ?? [] : [];
    if (funds.length === 0) {
      await Notifications.cancelAllScheduledNotificationsAsync();
      return;
    }

    const entriesRes = await store.getEntries({ page: 1, pageSize: 1000 });
    const allEntries = entriesRes.success ? entriesRes.data?.entries ?? [] : [];
    const entryDates = new Map<string, string[]>();
    for (const e of allEntries) {
      const list = entryDates.get(e.fund_id) || [];
      list.push(e.purchase_date);
      entryDates.set(e.fund_id, list);
    }

    await Notifications.cancelAllScheduledNotificationsAsync();

    const todayStr = nepalTodayAD();

    for (const fund of funds) {
      const { sip } = resolveSchedule({
        frequency: fund.frequency,
        calendar_system: fund.calendar_system,
        anchor_date: fund.anchor_date,
        start_date: fund.start_date,
        schedule_verified: fund.schedule_verified,
      });
      const { nextDue, prevDue, daysRemaining } = computeSchedule(sip, todayStr);

      const dates = entryDates.get(fund.id) || [];
      if (dates.some((d) => d > prevDue)) continue;

      const amount = Number(fund.monthly_sip).toLocaleString();
      const dueLabel =
        sip.calendarSystem === "BS"
          ? `${nextDue} (${formatBSDate(nextDue)} BS)`
          : nextDue;

      for (const days of REMINDER_DAYS) {
        if (days > daysRemaining) continue;
        const when = fireDate(nextDue, days);
        if (when.getTime() <= Date.now()) continue;

        await Notifications.scheduleNotificationAsync({
          content: {
            title:
              days === 0
                ? `SIP installment due today: ${fund.fund_name}`
                : `SIP installment due in ${days} day${days === 1 ? "" : "s"}`,
            body:
              days === 0
                ? `Your SIP installment of NPR ${amount} is due today. Tap to record your entry.`
                : `Your SIP installment of NPR ${amount} for ${fund.fund_name} is due on ${dueLabel}.`,
          },
          trigger: { type: "date", date: when } as any,
        });
      }
    }
  } catch {
    // Scheduling is best-effort - never block the app on it.
  }
}
