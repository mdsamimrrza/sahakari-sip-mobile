// ============================================================
// SahakariSIP - Upcoming Installments Popup (mobile)
// ============================================================
// Reminder ladder ported from the web daily-installments-popup: a fund
// pings once at 10 days before its due date, then 5, 3, 1 and the due
// day - tracked per fund + cycle, so quiet days stay quiet. Groups the
// list into today / tomorrow / this week / later.
//
// The web version asks the server for upcoming installments; here the
// same list is computed locally from the store using the central
// schedule engine - identical due-date rule, and it works offline.
// ============================================================

import React, { useCallback, useEffect, useRef, useState } from "react";
import { View } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  CalendarClock,
  Check,
  AlertTriangle,
  TrendingUp,
  Sparkles,
} from "lucide-react-native";
import { useAuth } from "@/lib/auth/AuthContext";
import { useTheme, radius, spacing, fontSize } from "@/theme";
import { Text, Button, Switch } from "@/components/ui/primitives";
import { Modal } from "@/components/ui/overlays";
import { formatCurrencyWhole, formatDate } from "@/lib/format";
import { nepalTodayAD, computeSchedule, formatBSDate } from "@/lib/calendar/bs";
import { resolveSchedule } from "@/lib/sip-schedule";
import type { DataStore } from "@/lib/data/store";

const POPUP_KEY = "sahakarisip.v1.installments_popup_shown";
const SHOWN_KEY = "sahakarisip.v1.installments_milestones_shown";

// Reminder ladder: a fund pings once at 10 days out, then 5, 3, 1, 0.
// Miss a rung (app closed) and the next unshown rung triggers instead.
const REMINDER_MILESTONES = [10, 5, 3, 1, 0];

interface UpcomingInstallment {
  fundId: string;
  fundName: string;
  nextDue: string;
  nextDueBS: string | null;
  amount: number;
  daysRemaining: number;
}

/** Same suppression rule as the web cron: skip a cycle already paid. */
async function loadUpcoming(store: DataStore): Promise<UpcomingInstallment[]> {
  const fundsRes = await store.getFundConfigs();
  if (!fundsRes.success) return [];
  const funds = fundsRes.data ?? [];
  const entriesRes = await store.getEntries({ page: 1, pageSize: 1000 });
  const allEntries = entriesRes.success ? entriesRes.data?.entries ?? [] : [];
  const entryDates = new Map<string, string[]>();
  for (const e of allEntries) {
    const list = entryDates.get(e.fund_id) || [];
    list.push(e.purchase_date);
    entryDates.set(e.fund_id, list);
  }

  const todayStr = nepalTodayAD();
  const items: UpcomingInstallment[] = [];
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
    if (dates.some((d) => d > prevDue)) continue; // cycle already paid
    items.push({
      fundId: fund.id,
      fundName: fund.fund_name,
      nextDue,
      nextDueBS: sip.calendarSystem === "BS" ? formatBSDate(nextDue) : null,
      amount: Number(fund.monthly_sip),
      daysRemaining,
    });
  }
  return items.sort((a, b) => a.daysRemaining - b.daysRemaining);
}

function groupInstallments(items: UpcomingInstallment[]) {
  const today: UpcomingInstallment[] = [];
  const tomorrow: UpcomingInstallment[] = [];
  const thisWeek: UpcomingInstallment[] = [];
  const later: UpcomingInstallment[] = [];
  for (const u of items) {
    if (u.daysRemaining === 0) today.push(u);
    else if (u.daysRemaining === 1) tomorrow.push(u);
    else if (u.daysRemaining <= 7) thisWeek.push(u);
    else later.push(u);
  }
  return { today, tomorrow, thisWeek, later };
}

function accentFor(daysRemaining: number) {
  if (daysRemaining === 0) return { color: "rose" as const, label: "Due today" };
  if (daysRemaining === 1) return { color: "amber" as const, label: "Due tomorrow" };
  return { color: "success" as const, label: `${daysRemaining}d` };
}

function InstallmentCard({ u }: { u: UpcomingInstallment }) {
  const { colors } = useTheme();
  const accent = accentFor(u.daysRemaining);
  const accentColor =
    accent.color === "rose"
      ? colors.destructive
      : accent.color === "amber"
        ? colors.amber
        : colors.success;

  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: spacing.md,
        padding: spacing.md,
        borderRadius: radius.xl,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.card,
        borderLeftWidth: 3,
        borderLeftColor: accentColor,
      }}
    >
      <View
        style={{
          height: 36,
          width: 36,
          borderRadius: radius.lg,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: colors.muted,
          borderWidth: 1,
          borderColor: accentColor,
        }}
      >
        <CalendarClock size={16} color={accentColor} />
      </View>
      <View style={{ flex: 1, gap: 2, minWidth: 0 }}>
        <Text variant="label" numberOfLines={1}>
          {u.fundName}
        </Text>
        <Text variant="caption" color={colors.mutedForeground} style={{ fontSize: fontSize.xs }} numberOfLines={1}>
          {formatDate(u.nextDue)}
          {u.nextDueBS ? ` - ${u.nextDueBS} BS` : ""} - {formatCurrencyWhole(u.amount)}
        </Text>
      </View>
      <Text variant="caption" style={{ fontWeight: "800", color: accentColor, fontSize: fontSize.xs }}>
        {accent.label}
      </Text>
    </View>
  );
}

function SectionHeader({ title, icon, color, count }: { title: string; icon: React.ReactNode; color: string; count: number }) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.xs, paddingBottom: spacing.xs }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
        {icon}
        <Text variant="caption" color={colors.mutedForeground} style={{ fontWeight: "800", fontSize: fontSize.xs }}>
          {title}
        </Text>
      </View>
      <Text variant="caption" style={{ fontWeight: "800", color, fontSize: fontSize.xs }}>
        {count}
      </Text>
    </View>
  );
}

function StatPill({ label, value, color, currency = false }: { label: string; value: number; color: string; currency?: boolean }) {
  const { colors } = useTheme();
  const tint =
    color === "rose" ? colors.destructive : color === "amber" ? colors.amber : colors.success;
  return (
    <View
      style={{
        flex: 1,
        minWidth: 0,
        gap: 2,
        padding: spacing.sm,
        borderRadius: radius.lg,
        borderWidth: 1,
        borderColor: `${tint}44`,
        backgroundColor: colors.card,
      }}
    >
      <Text variant="caption" color={colors.mutedForeground} style={{ fontSize: fontSize.xs }} numberOfLines={1}>
        {label}
      </Text>
      <Text variant="label" tabular numberOfLines={1}>
        {currency ? formatCurrencyWhole(value) : value}
      </Text>
    </View>
  );
}

export function InstallmentsPopup() {
  const { store } = useAuth();
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<UpcomingInstallment[]>([]);
  const [dontShowAgain, setDontShowAgain] = useState(false);
  // Which ladder rungs this fund cycle has already pinged for.
  const shownRungs = useRef<Set<string>>(new Set());
  const pendingRungs = useRef<string[]>([]);

  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(SHOWN_KEY);
        if (raw) shownRungs.current = new Set(JSON.parse(raw) as string[]);
        const items = store ? await loadUpcoming(store) : [];
        setItems(items);
        // Rung for each item: the next milestone it has reached or passed
        // (rungs are descending, so the LAST match is the nearest one).
        // d=6 -> 10 (5 not yet due); d=0 -> 0, never 10.
        pendingRungs.current = items.flatMap((u) => {
          const reached = REMINDER_MILESTONES.filter((m) => m >= u.daysRemaining);
          const rung = reached[reached.length - 1];
          return rung === undefined ? [] : [`${u.fundId}|${u.nextDue}|${rung}`];
        });
        const fresh = pendingRungs.current.filter((k) => !shownRungs.current.has(k));
        if (fresh.length === 0) return;
        const shown = await AsyncStorage.getItem(POPUP_KEY);
        if (shown === nepalTodayAD()) return; // "don't show again today"
        const timer = setTimeout(() => setOpen(true), 400);
        return () => clearTimeout(timer);
      } catch {
        // Schedule unreadable — stay quiet rather than nagging with a
        // popup that only ever shows "All caught up".
      }
    })();
    // Runs once per app session; store is restored before this mounts in practice.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store]);

  const handleClose = useCallback(async () => {
    try {
      for (const k of pendingRungs.current) shownRungs.current.add(k);
      // Drop keys from past cycles (fund+due-date pairs no longer due).
      const current = new Set(
        items.map((u) => `${u.fundId}|${u.nextDue}`)
      );
      const kept = [...shownRungs.current].filter((k) =>
        current.has(k.split("|").slice(0, 2).join("|"))
      );
      await AsyncStorage.setItem(SHOWN_KEY, JSON.stringify(kept));
      if (dontShowAgain) {
        await AsyncStorage.setItem(POPUP_KEY, nepalTodayAD());
      }
    } catch {
      // Best-effort.
    }
    setOpen(false);
  }, [dontShowAgain]);

  if (!open) return null;

  const { today, tomorrow, thisWeek, later } = groupInstallments(items);
  const hasItems = items.length > 0;
  const totalAmount = items.reduce((sum, u) => sum + u.amount, 0);
  const dueSoon = today.length + tomorrow.length;

  return (
    <Modal
      visible={open}
      onClose={handleClose}
      position="center"
      title="Upcoming SIP Installments"
      description={`Based on your registered schedules - ${items.length} fund${items.length !== 1 ? "s" : ""} tracked`}
    >
      <View style={{ flexDirection: "row", gap: spacing.sm, marginBottom: spacing.md }}>
        <StatPill label="Due Soon" value={dueSoon} color="rose" />
        <StatPill label="This Week" value={thisWeek.length} color="amber" />
        <StatPill label="Total" value={totalAmount} color="success" currency />
      </View>

      {hasItems ? (
        <View style={{ gap: spacing.md }}>
          {today.length > 0 && (
            <View style={{ gap: spacing.xs }}>
              <SectionHeader
                title="DUE TODAY"
                icon={<AlertTriangle size={14} color={colors.destructive} />}
                color={colors.destructive}
                count={today.length}
              />
              {today.map((u) => (
                <InstallmentCard key={u.fundId} u={u} />
              ))}
            </View>
          )}
          {tomorrow.length > 0 && (
            <View style={{ gap: spacing.xs }}>
              <SectionHeader
                title="DUE TOMORROW"
                icon={<CalendarClock size={14} color={colors.amber} />}
                color={colors.amber}
                count={tomorrow.length}
              />
              {tomorrow.map((u) => (
                <InstallmentCard key={u.fundId} u={u} />
              ))}
            </View>
          )}
          {thisWeek.length > 0 && (
            <View style={{ gap: spacing.xs }}>
              <SectionHeader
                title="THIS WEEK"
                icon={<TrendingUp size={14} color={colors.success} />}
                color={colors.success}
                count={thisWeek.length}
              />
              {thisWeek.map((u) => (
                <InstallmentCard key={u.fundId} u={u} />
              ))}
            </View>
          )}
          {later.length > 0 && (
            <View style={{ gap: spacing.xs }}>
              <SectionHeader
                title="LATER"
                icon={<CalendarClock size={14} color={colors.info} />}
                color={colors.info}
                count={later.length}
              />
              {later.map((u) => (
                <InstallmentCard key={u.fundId} u={u} />
              ))}
            </View>
          )}
        </View>
      ) : (
        <View style={{ alignItems: "center", gap: spacing.sm, paddingVertical: spacing.xl }}>
          <Sparkles size={28} color={colors.primary} />
          <Text variant="label">All caught up</Text>
          <Text variant="caption" color={colors.mutedForeground} style={{ textAlign: "center" }}>
            No upcoming installments. Add a fund in Settings to start tracking your SIP journey.
          </Text>
        </View>
      )}

      {/* Don't show again today */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          gap: spacing.md,
          marginTop: spacing.lg,
          padding: spacing.md,
          borderRadius: radius.lg,
          backgroundColor: colors.muted,
          borderWidth: 1,
          borderColor: colors.border,
        }}
      >
        <View style={{ flex: 1, gap: 2 }}>
          <Text variant="caption" color={colors.foreground} style={{ fontWeight: "700" }}>
            Don't show again today
          </Text>
          <Text variant="caption" color={colors.mutedForeground} style={{ fontSize: fontSize.xs }}>
            Reappears tomorrow with a fresh schedule
          </Text>
        </View>
        <Switch value={dontShowAgain} onValueChange={setDontShowAgain} />
      </View>

      <Button fullWidth onPress={handleClose} style={{ marginTop: spacing.md }}>
        Close
      </Button>
    </Modal>
  );
}
