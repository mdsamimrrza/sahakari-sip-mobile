// ============================================================
// SahakariSIP - Upcoming Installments Popup (mobile)
// ============================================================
// Port of the web app's daily-installments-popup. Appears once per
// day on app open and groups upcoming installments into today /
// tomorrow / this week / later.
//
// The web version asks the server for upcoming installments; here the
// same list is computed locally from the store using the central
// schedule engine - identical due-date rule, and it works offline.
// ============================================================

import React, { useCallback, useEffect, useState } from "react";
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
  const [loading, setLoading] = useState(false);
  const [dontShowAgain, setDontShowAgain] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const shown = await AsyncStorage.getItem(POPUP_KEY);
        if (shown !== nepalTodayAD()) {
          const timer = setTimeout(() => setOpen(true), 400);
          return () => clearTimeout(timer);
        }
      } catch {
        const timer = setTimeout(() => setOpen(true), 400);
        return () => clearTimeout(timer);
      }
    })();
  }, []);

  useEffect(() => {
    if (open && store) {
      setLoading(true);
      loadUpcoming(store)
        .then(setItems)
        .catch(() => setItems([]))
        .finally(() => setLoading(false));
    }
  }, [open, store]);

  const handleClose = useCallback(async () => {
    if (dontShowAgain) {
      try {
        await AsyncStorage.setItem(POPUP_KEY, nepalTodayAD());
      } catch {
        // Best-effort.
      }
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

      {loading ? (
        <Text variant="caption" color={colors.mutedForeground} style={{ textAlign: "center", paddingVertical: spacing.xl }}>
          Loading schedule...
        </Text>
      ) : hasItems ? (
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
