// ============================================================
// SahakariSIP — Dashboard summary cards
// ============================================================
// Port of the web app's components/dashboard/summary-cards.tsx:
//   Card 1 · Portfolio Value (+ fund scope + Add SIP)
//   Card 2 · Invested & Net Gain/Loss
//   Card 3 · Unallotted Cash & Current NAV
//   Card 4 · XIRR Return & SIP Streak / Total Units
// plus the tappable "Personal Summary" banner that opens a full
// capital-reconciliation + CGT breakdown sheet.
// ============================================================

import React, { useState } from "react";
import { View, Pressable } from "react-native";
import {
  Wallet,
  TrendingUp,
  BarChart3,
  Coins,
  Flame,
  Plus,
  ArrowUpRight,
  ArrowDownRight,
} from "lucide-react-native";
import { useRouter } from "expo-router";
import type { DashboardSummary, FundConfig } from "@/lib/types";
import {
  formatCurrencyWhole,
  formatPercentage,
  formatUnits,
  formatStreak,
  formatNav,
} from "@/lib/format";
import { useTheme, radius, spacing, fontSize } from "@/theme";
import { Text, Card, Button, Skeleton } from "@/components/ui/primitives";
import { Modal } from "@/components/ui/overlays";
import { FundScopeSelector } from "./FundScopeSelector";

export function SummaryCards({
  summary,
  funds,
  selectedFundId,
  onFundChange,
  activeFund,
  loading,
  onAddEntry,
}: {
  summary: DashboardSummary;
  funds: FundConfig[];
  selectedFundId: string;
  onFundChange: (id: string) => void;
  activeFund?: FundConfig;
  loading?: boolean;
  onAddEntry?: () => void;
}) {
  const { colors } = useTheme();
  const router = useRouter();
  const [summaryOpen, setSummaryOpen] = useState(false);

  if (loading) {
    return (
      <View style={{ gap: spacing.md }}>
        <Skeleton height={128} />
        <View style={{ flexDirection: "row", gap: spacing.md }}>
          <Skeleton height={104} style={{ flex: 1 }} />
          <Skeleton height={104} style={{ flex: 1 }} />
        </View>
        <Skeleton height={104} />
      </View>
    );
  }

  const isPositive = (summary.gainLoss ?? 0) >= 0;
  const gainColor = isPositive ? colors.success : colors.rose;

  const currentValueDisplay =
    summary.currentValue !== null
      ? formatCurrencyWhole(summary.currentValue)
      : formatCurrencyWhole(summary.totalInvested);

  const effectiveDeployed = Math.max(
    0,
    summary.totalInvested - summary.unallottedCash
  );
  const avgUnitCost =
    summary.totalUnits > 0 ? summary.totalInvested / summary.totalUnits : 0;

  return (
    <View style={{ gap: spacing.md }}>
      {/* Fund scope */}
      <FundScopeSelector
        funds={funds}
        selectedFundId={selectedFundId}
        onChange={onFundChange}
      />

      {/* ---------- CARD 1: Portfolio Value ---------- */}
      <Card
        style={{
          padding: spacing.lg,
          borderColor: `${colors.blue}33`,
          gap: spacing.md,
        }}
      >
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            gap: spacing.sm,
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <View
              style={{
                width: 32,
                height: 32,
                borderRadius: radius.md,
                backgroundColor: colors.blue,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Wallet size={16} color="#FFFFFF" />
            </View>
            <Text variant="micro" color={colors.mutedForeground}>
              Portfolio Value
            </Text>
          </View>

          {onAddEntry ? (
            <Pressable
              onPress={onAddEntry}
              style={{
                width: 34,
                height: 34,
                borderRadius: radius.pill,
                backgroundColor: colors.blue,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Plus size={19} color="#FFFFFF" strokeWidth={2.6} />
            </Pressable>
          ) : null}
        </View>

        <View style={{ gap: 6 }}>
          <Text variant="display" style={{ fontSize: 30 }}>
            {currentValueDisplay}
          </Text>

          {summary.gainLoss !== null && (
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 4,
                alignSelf: "flex-start",
                paddingHorizontal: spacing.sm + 2,
                paddingVertical: 3,
                borderRadius: radius.pill,
                backgroundColor: `${gainColor}1A`,
                borderWidth: 1,
                borderColor: `${gainColor}33`,
              }}
            >
              {isPositive ? (
                <ArrowUpRight size={13} color={gainColor} strokeWidth={2.6} />
              ) : (
                <ArrowDownRight size={13} color={gainColor} strokeWidth={2.6} />
              )}
              <Text
                variant="caption"
                color={gainColor}
                style={{ fontWeight: "800" }}
                tabular
              >
                {isPositive ? "+" : ""}
                {formatCurrencyWhole(summary.gainLoss, true)} (
                {formatPercentage(summary.gainLossPct ?? 0)})
              </Text>
            </View>
          )}
        </View>
      </Card>

      {/* ---------- CARD 2: Invested & Return ---------- */}
      <Card style={{ padding: spacing.lg, gap: spacing.md }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <View
            style={{
              width: 34,
              height: 34,
              borderRadius: radius.md,
              backgroundColor: `${colors.purple}1A`,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Coins size={17} color={colors.purple} />
          </View>
          <Text variant="micro" color={colors.mutedForeground}>
            Invested &amp; Return
          </Text>
        </View>

        <View
          style={{
            flexDirection: "row",
            alignItems: "flex-end",
            justifyContent: "space-between",
            gap: spacing.md,
          }}
        >
          <View>
            <Text variant="caption" color={colors.mutedForeground}>
              Invested
            </Text>
            <Text variant="subheading" tabular>
              {formatCurrencyWhole(summary.totalInvested)}
            </Text>
          </View>
          <View style={{ alignItems: "flex-end" }}>
            <Text variant="caption" color={colors.mutedForeground}>
              Net Gain / Loss
            </Text>
            <Text
              variant="subheading"
              color={summary.gainLoss !== null ? gainColor : colors.foreground}
              tabular
            >
              {summary.gainLoss !== null
                ? formatCurrencyWhole(summary.gainLoss, true)
                : "NPR 0"}
            </Text>
          </View>
        </View>
      </Card>

      {/* ---------- CARD 3: Cash & NAV ---------- */}
      <Card style={{ padding: spacing.lg, gap: spacing.md }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <View
            style={{
              width: 34,
              height: 34,
              borderRadius: radius.md,
              backgroundColor: `${colors.success}1A`,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <BarChart3 size={17} color={colors.success} />
          </View>
          <Text variant="micro" color={colors.mutedForeground}>
            Cash &amp; NAV
          </Text>
        </View>

        <View
          style={{
            flexDirection: "row",
            alignItems: "flex-end",
            justifyContent: "space-between",
            gap: spacing.md,
          }}
        >
          <View>
            <Text variant="caption" color={colors.mutedForeground}>
              Unallotted Cash
            </Text>
            <Text variant="subheading" tabular>
              {formatCurrencyWhole(summary.unallottedCash)}
            </Text>
          </View>
          {summary.latestNav ? (
            <View style={{ alignItems: "flex-end" }}>
              <Text variant="caption" color={colors.mutedForeground}>
                NAV (Net Asset Value)
              </Text>
              <Text variant="subheading" color={colors.success} tabular>
                NPR {formatNav(summary.latestNav)}
              </Text>
            </View>
          ) : null}
        </View>
      </Card>

      {/* ---------- CARD 4: Performance ---------- */}
      <Card style={{ padding: spacing.lg, gap: spacing.md }}>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            gap: spacing.sm,
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <View
              style={{
                width: 34,
                height: 34,
                borderRadius: radius.md,
                backgroundColor: `${colors.amber}1A`,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <TrendingUp size={17} color={colors.amber} />
            </View>
            <Text variant="micro" color={colors.mutedForeground}>
              Performance
            </Text>
          </View>

          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 4,
              paddingHorizontal: spacing.sm + 2,
              paddingVertical: 3,
              borderRadius: radius.pill,
              backgroundColor: `${colors.amber}1A`,
            }}
          >
            <Flame size={12} color={colors.amber} />
            <Text variant="caption" color={colors.amber} style={{ fontWeight: "800" }}>
              {formatStreak(summary.sipStreak)}
            </Text>
          </View>
        </View>

        <View
          style={{
            flexDirection: "row",
            alignItems: "flex-end",
            justifyContent: "space-between",
            gap: spacing.md,
          }}
        >
          <View style={{ flex: 1 }}>
            <Text variant="caption" color={colors.mutedForeground}>
              XIRR Return (Extended Internal Rate of Return)
            </Text>
            <Text variant="subheading" tabular>
              {summary.xirr !== null ? formatPercentage(summary.xirr * 100) : "—"}
            </Text>
          </View>
          <View style={{ alignItems: "flex-end" }}>
            <Text variant="caption" color={colors.mutedForeground}>
              Total Units
            </Text>
            <Text variant="subheading" tabular>
              {formatUnits(summary.totalUnits)}
            </Text>
          </View>
        </View>
      </Card>

      {/* ---------- Personal Summary banner ---------- */}
      <Pressable onPress={() => setSummaryOpen(true)}>
        <Card
          style={{
            padding: spacing.lg,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            gap: spacing.md,
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.md, flex: 1 }}>
            <View
              style={{
                width: 44,
                height: 44,
                borderRadius: radius.lg,
                backgroundColor: gainColor,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {isPositive ? (
                <ArrowUpRight size={20} color="#FFFFFF" />
              ) : (
                <ArrowDownRight size={20} color="#FFFFFF" />
              )}
            </View>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Text variant="label">Personal Summary</Text>
                {summary.gainLossPct !== null && (
                  <Text
                    variant="caption"
                    color={gainColor}
                    style={{ fontWeight: "800" }}
                  >
                    {isPositive ? "+" : ""}
                    {formatPercentage(summary.gainLossPct)} return
                  </Text>
                )}
              </View>
              <Text variant="heading" color={gainColor} tabular style={{ fontSize: fontSize.xl }}>
                {summary.gainLoss !== null
                  ? formatCurrencyWhole(summary.gainLoss, true)
                  : "NPR 0"}
              </Text>
            </View>
          </View>
          <ArrowUpRight size={18} color={colors.mutedForeground} />
        </Card>
      </Pressable>

      {/* ---------- Full breakdown sheet ---------- */}
      <Modal
        visible={summaryOpen}
        onClose={() => setSummaryOpen(false)}
        title="Portfolio Summary"
        description="Comprehensive breakdown of your investments, capital allocation, and taxes."
        position="bottom"
      >
        <View style={{ gap: spacing.md }}>
          {/* Streak badge */}
          <View style={{ flexDirection: "row", justifyContent: "flex-end" }}>
            <View
              style={{
                paddingHorizontal: spacing.md,
                paddingVertical: 3,
                borderRadius: radius.pill,
                backgroundColor: `${colors.blue}1A`,
              }}
            >
              <Text variant="caption" color={colors.blue} style={{ fontWeight: "800" }}>
                {formatStreak(summary.sipStreak)} STREAK
              </Text>
            </View>
          </View>

          {/* Hero */}
          <View
            style={{
              backgroundColor: colors.blue,
              borderRadius: radius.xl,
              padding: spacing.lg,
              gap: spacing.md,
            }}
          >
            <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
              <View>
                <Text variant="micro" color="#D9D9FF">
                  Total Portfolio Value
                </Text>
                <Text variant="title" color="#FFFFFF" style={{ fontSize: fontSize.xxl }}>
                  {currentValueDisplay}
                </Text>
              </View>
              <View style={{ alignItems: "flex-end" }}>
                <Text variant="micro" color="#D9D9FF">
                  Gain / Loss
                </Text>
                <Text variant="label" color="#FFFFFF" tabular>
                  {summary.gainLoss !== null
                    ? formatCurrencyWhole(summary.gainLoss, true)
                    : "NPR 0"}
                </Text>
              </View>
            </View>
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                borderTopWidth: 1,
                borderTopColor: "rgba(255,255,255,0.25)",
                paddingTop: spacing.sm,
              }}
            >
              <Text variant="caption" color="#D9D9FF">
                Invested: {formatCurrencyWhole(summary.totalInvested)}
              </Text>
              <Text variant="caption" color="#D9D9FF">
                Return:{" "}
                {summary.gainLossPct !== null
                  ? formatPercentage(summary.gainLossPct)
                  : "0%"}
              </Text>
            </View>
          </View>

          {/* Core metrics */}
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
            {[
              {
                label: "Latest NAV",
                value: activeFund?.latest_nav
                  ? `NPR ${Number(activeFund.latest_nav).toFixed(2)}`
                  : "—",
              },
              { label: "Total Units", value: formatUnits(summary.totalUnits) },
              {
                label: "Avg Unit Cost",
                value: avgUnitCost > 0 ? `NPR ${avgUnitCost.toFixed(2)}` : "—",
              },
              { label: "SIP Streak", value: formatStreak(summary.sipStreak) },
            ].map((m) => (
              <View
                key={m.label}
                style={{
                  flexBasis: "48%",
                  flexGrow: 1,
                  backgroundColor: colors.muted,
                  borderRadius: radius.md,
                  padding: spacing.md,
                  gap: 2,
                }}
              >
                <Text variant="caption" color={colors.mutedForeground}>
                  {m.label}
                </Text>
                <Text variant="label" tabular>
                  {m.value}
                </Text>
              </View>
            ))}
          </View>

          {/* Capital reconciliation */}
          <View
            style={{
              backgroundColor: colors.muted,
              borderRadius: radius.xl,
              padding: spacing.lg,
              gap: 6,
            }}
          >
            <Text variant="label">Capital Reconciliation</Text>
            <ReconRow label="Total Cash Deposited" value={formatCurrencyWhole(summary.totalInvested)} />
            <ReconRow
              label="(−) Rollover Wallet Cash"
              value={`-${formatCurrencyWhole(summary.unallottedCash)}`}
              color={colors.blue}
            />
            <ReconRow
              label="Effective Deployed Capital"
              value={formatCurrencyWhole(effectiveDeployed)}
              color={colors.success}
              emphasis
            />
            <ReconRow
              label="Current Units Value (@ NAV)"
              value={formatCurrencyWhole(summary.currentValue ?? 0)}
            />
            <ReconRow
              label="Net Investment Return"
              value={`${
                summary.gainLoss !== null
                  ? formatCurrencyWhole(summary.gainLoss, true)
                  : "NPR 0"
              } (${formatPercentage(summary.gainLossPct ?? 0)})`}
              color={gainColor}
              emphasis
            />
          </View>

          {/* CGT */}
          <View
            style={{
              backgroundColor: colors.muted,
              borderRadius: radius.xl,
              padding: spacing.lg,
              gap: 6,
            }}
          >
            <Text variant="label">Capital Gains Tax (CGT)</Text>
            <ReconRow
              label="Long-Term (> 1 yr @ 7.5%)"
              value={formatCurrencyWhole(summary.estimatedCgtLongTerm ?? 0)}
            />
            <ReconRow
              label="Short-Term (< 1 yr @ 10.0%)"
              value={formatCurrencyWhole(summary.estimatedCgtShortTerm ?? 0)}
            />
          </View>

          <Button
            variant="outline"
            fullWidth
            onPress={() => {
              setSummaryOpen(false);
              router.push("/(app)/tax-breakdown");
            }}
          >
            <Text variant="label" color={colors.primary}>
              View Full Tax &amp; Settlement Ledger
            </Text>
            <ArrowUpRight size={15} color={colors.primary} />
          </Button>

          <Button fullWidth onPress={() => setSummaryOpen(false)}>
            Close Summary
          </Button>
        </View>
      </Modal>
    </View>
  );
}

function ReconRow({
  label,
  value,
  color,
  emphasis,
}: {
  label: string;
  value: string;
  color?: string;
  emphasis?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        gap: spacing.md,
        borderTopWidth: emphasis ? 1 : 0,
        borderTopColor: colors.border,
        paddingTop: emphasis ? 6 : 0,
      }}
    >
      <Text
        variant="caption"
        color={emphasis ? colors.foreground : colors.mutedForeground}
        style={{ fontWeight: emphasis ? "700" : "500", flex: 1 }}
      >
        {label}
      </Text>
      <Text
        variant="caption"
        color={color ?? colors.foreground}
        style={{ fontWeight: emphasis ? "800" : "600" }}
        tabular
      >
        {value}
      </Text>
    </View>
  );
}
