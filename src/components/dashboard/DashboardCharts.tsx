// ============================================================
// SahakariSIP — Dashboard chart cards
// ============================================================
// Mobile ports of the web app's five dashboard charts:
//   • portfolio-chart.tsx           → PortfolioGrowthCard (time ranges)
//   • nav-history-chart.tsx         → NavHistoryCard
//   • monthly-contributions-bar.tsx → MonthlyContributionsCard
//   • invested-vs-gain-pie.tsx      → InvestedVsGainCard
//   • fee-drag-area.tsx             → FeeDragCard
// ============================================================

import React, { useMemo, useState } from "react";
import { View, Pressable, ScrollView } from "react-native";
import { ArrowUpRight, ArrowDownRight, Info } from "lucide-react-native";
import type {
  ChartDataPoint,
  DashboardSummary,
  FeeDragPoint,
  MonthlyContribution,
  PortfolioChartPoint,
} from "@/lib/types";
import { FUND_PRESETS } from "@/lib/constants";
import {
  formatCompact,
  formatCurrencyWhole,
  formatDateShort,
  formatMonth,
  formatMonthShort,
  formatNav,
  formatPercentage,
} from "@/lib/format";
import { useTheme, radius, spacing, fontSize } from "@/theme";
import { Text, Card, EmptyState } from "@/components/ui/primitives";
import { Modal } from "@/components/ui/overlays";
import { BarChart, DonutChart, ChartLegend, LineChart } from "@/components/charts";

const TIME_RANGES = ["1M", "3M", "6M", "1Y", "3Y", "5Y", "ALL"] as const;
type TimeRange = (typeof TIME_RANGES)[number];

const RANGE_DAYS: Record<Exclude<TimeRange, "ALL">, number> = {
  "1M": 30,
  "3M": 90,
  "6M": 180,
  "1Y": 365,
  "3Y": 365 * 3,
  "5Y": 365 * 5,
};

// ------------------------------------------------------------
// Portfolio growth
// ------------------------------------------------------------

export function PortfolioGrowthCard({
  data,
  summary,
}: {
  data: PortfolioChartPoint[];
  summary: DashboardSummary;
}) {
  const { colors } = useTheme();
  const [range, setRange] = useState<TimeRange>("ALL");

  const filtered = useMemo(() => {
    if (data.length <= 1 || range === "ALL") return data;
    const lastDate = new Date(data[data.length - 1].date).getTime();
    const cutoff = RANGE_DAYS[range] * 24 * 60 * 60 * 1000;
    const kept = data.filter((d) => lastDate - new Date(d.date).getTime() <= cutoff);
    return kept.length >= 2 ? kept : data.slice(-2);
  }, [data, range]);

  const latestPoint = data.length > 0 ? data[data.length - 1] : null;
  const currVal = summary.currentValue ?? latestPoint?.portfolioValue ?? 0;
  const totalInv = summary.totalInvested ?? latestPoint?.totalInvested ?? 0;
  const gainVal = summary.gainLoss ?? (currVal ? currVal - totalInv : 0);
  const gainPct =
    summary.gainLossPct ?? (totalInv > 0 ? (gainVal / totalInv) * 100 : 0);
  const isPositive = gainVal >= 0;
  const gainColor = isPositive ? colors.success : colors.rose;

  if (data.length === 0) {
    return (
      <Card padded>
        <Text variant="subheading">Portfolio Growth</Text>
        <EmptyState title="Add entries to see your portfolio growth" />
      </Card>
    );
  }

  const maxVal = Math.max(
    ...filtered.flatMap((d) => [d.portfolioValue, d.totalInvested]),
    0
  );

  return (
    <Card padded style={{ gap: spacing.md }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <Text variant="micro" color={colors.mutedForeground}>
          Portfolio Growth
        </Text>
        {summary.latestNav ? (
          <Text variant="caption" color={colors.mutedForeground}>
            NAV: NPR {formatNav(summary.latestNav)}
            {summary.latestNavDate ? ` (${formatDateShort(summary.latestNavDate)})` : ""}
          </Text>
        ) : null}
      </View>

      <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.md, flexWrap: "wrap" }}>
        <Text variant="display" style={{ fontSize: fontSize.xxxl }}>
          {formatCurrencyWhole(currVal)}
        </Text>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 4,
            paddingHorizontal: spacing.sm + 2,
            paddingVertical: 3,
            borderRadius: radius.md,
            backgroundColor: colors.muted,
            borderWidth: 1,
            borderColor: gainColor,
          }}
        >
          {isPositive ? (
            <ArrowUpRight size={13} color={gainColor} strokeWidth={2.6} />
          ) : (
            <ArrowDownRight size={13} color={gainColor} strokeWidth={2.6} />
          )}
          <Text variant="caption" color={gainColor} style={{ fontWeight: "800" }} tabular>
            {isPositive ? "+" : ""}
            {formatCurrencyWhole(gainVal)} ({formatPercentage(gainPct)})
          </Text>
        </View>
      </View>

      {/* Time range tabs */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View
          style={{
            flexDirection: "row",
            backgroundColor: colors.muted,
            borderRadius: radius.md,
            padding: 3,
            gap: 2,
          }}
        >
          {TIME_RANGES.map((r) => {
            const active = r === range;
            return (
              <Pressable
                key={r}
                onPress={() => setRange(r)}
                style={{
                  paddingHorizontal: spacing.md,
                  paddingVertical: 6,
                  borderRadius: radius.md,
                  backgroundColor: active ? colors.primary : "transparent",
                }}
              >
                <Text
                  variant="caption"
                  color={active ? colors.primaryForeground : colors.mutedForeground}
                  style={{ fontWeight: "800" }}
                >
                  {r}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </ScrollView>

      <LineChart
        labels={filtered.map((d) => d.date)}
        series={[
          {
            key: "portfolio",
            name: "Portfolio Value",
            color: colors.blue,
            values: filtered.map((d) => d.portfolioValue),
          },
          {
            key: "invested",
            name: "Total Invested",
            color: colors.mutedForeground,
            dashed: true,
            values: filtered.map((d) => d.totalInvested),
          },
        ]}
        height={240}
        minTop={4000}
        formatY={formatCompact}
        formatTooltipY={formatCurrencyWhole}
        formatX={formatDateShort}
        showLegend
      />
    </Card>
  );
}

// ------------------------------------------------------------
// NAV history
// ------------------------------------------------------------

export function NavHistoryCard({ data }: { data: ChartDataPoint[] }) {
  const { colors } = useTheme();

  return (
    <Card padded style={{ gap: spacing.md }}>
      <View>
        <Text variant="subheading">NAV History</Text>
        <Text variant="caption" color={colors.mutedForeground}>
          Net Asset Value per unit over time
        </Text>
      </View>

      {data.length === 0 ? (
        <EmptyState title="No NAV history yet" description="Add entries or update the NAV." />
      ) : (
        <LineChart
          labels={data.map((d) => d.date)}
          series={[
            {
              key: "nav",
              name: "NAV",
              color: colors.success,
              area: true,
              values: data.map((d) => d.value),
            },
          ]}
          height={200}
          formatY={(v) => v.toFixed(1)}
          formatTooltipY={(v) => `NPR ${formatNav(v)}`}
          formatX={formatDateShort}
        />
      )}
    </Card>
  );
}

// ------------------------------------------------------------
// Monthly contributions
// ------------------------------------------------------------

export function MonthlyContributionsCard({
  data,
}: {
  data: MonthlyContribution[];
}) {
  const { colors } = useTheme();
  const sorted = useMemo(
    () => [...data].sort((a, b) => a.month.localeCompare(b.month)),
    [data]
  );

  const total = sorted.reduce((s, d) => s + d.amount, 0);

  return (
    <Card padded style={{ gap: spacing.md }}>
      <View>
        <Text variant="subheading">Monthly Contributions</Text>
        <Text variant="caption" color={colors.mutedForeground}>
          {sorted.length} month{sorted.length === 1 ? "" : "s"} ·{" "}
          {formatCurrencyWhole(total)} deposited
        </Text>
      </View>

      {sorted.length === 0 ? (
        <EmptyState title="No contributions recorded yet" />
      ) : (
        <BarChart
          labels={sorted.map((d) => d.month)}
          series={[
            {
              key: "contrib",
              name: "Contribution",
              color: colors.blue,
              values: sorted.map((d) => d.amount),
            },
          ]}
          height={200}
          formatY={formatCompact}
          formatTooltipY={formatCurrencyWhole}
          formatX={(m) => formatMonthShort(m)}
        />
      )}
    </Card>
  );
}

// ------------------------------------------------------------
// Invested vs gain
// ------------------------------------------------------------

export function InvestedVsGainCard({
  totalInvested,
  currentValue,
}: {
  totalInvested: number;
  currentValue: number | null;
}) {
  const { colors } = useTheme();

  const value = currentValue ?? totalInvested;
  const gain = value - totalInvested;
  const gainPositive = gain >= 0;

  const slices = [
    {
      name: "Invested Capital",
      value: Math.max(0, Math.min(totalInvested, value)),
      color: colors.blue,
    },
    {
      name: gainPositive ? "Unrealised Gain" : "Unrealised Loss",
      value: Math.abs(gain),
      color: gainPositive ? colors.success : colors.rose,
    },
  ];

  return (
    <Card padded style={{ gap: spacing.md }}>
      <View>
        <Text variant="subheading">Invested vs Gain</Text>
        <Text variant="caption" color={colors.mutedForeground}>
          How your portfolio value splits between capital and return
        </Text>
      </View>

      <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.lg }}>
        <DonutChart
          slices={slices}
          size={150}
          thickness={24}
          centerValue={formatCompact(value)}
          centerLabel="Value"
        />
        <ChartLegend
          items={slices}
          formatValue={(v) => formatCurrencyWhole(v)}
        />
      </View>
    </Card>
  );
}

// ------------------------------------------------------------
// Fee drag
// ------------------------------------------------------------

function FeeDragBreakdownDialog({
  visible,
  onClose,
  feeRatePct,
  fundName,
  totalDrag,
}: {
  visible: boolean;
  onClose: () => void;
  feeRatePct: number;
  fundName?: string;
  totalDrag: number;
}) {
  const { colors } = useTheme();

  // Split logic from the web app: a matching preset uses its feeBreakdown;
  // otherwise the default 1.5/0.2/0.1-of-1.8 ratio is scaled to the rate.
  const split = useMemo(() => {
    const preset = fundName
      ? FUND_PRESETS.find(
          (p) => p.name.toLowerCase() === fundName.toLowerCase()
        )
      : undefined;
    if (preset?.feeBreakdown) {
      return { ...preset.feeBreakdown, total: preset.feeRate };
    }
    const scale = feeRatePct / 1.8;
    return {
      management: 1.5 * scale,
      depository: 0.2 * scale,
      supervision: 0.1 * scale,
      total: feeRatePct,
    };
  }, [fundName, feeRatePct]);

  const share = (part: number) =>
    split.total > 0 ? totalDrag * (part / split.total) : 0;

  const rows = [
    {
      label: "Management Fees",
      detail: `${split.management.toFixed(2)}% of AUM`,
      amount: share(split.management),
      color: colors.blue,
    },
    {
      label: "Depository Fees",
      detail: `${split.depository.toFixed(2)}% of AUM`,
      amount: share(split.depository),
      color: colors.purple,
    },
    {
      label: "Scheme Supervision",
      detail: `${split.supervision.toFixed(2)}% of AUM`,
      amount: share(split.supervision),
      color: colors.emerald,
    },
  ];

  return (
    <Modal
      visible={visible}
      onClose={onClose}
      title="Fee Drag Breakdown"
      description={`How the ${feeRatePct.toFixed(2)}% Annual Fee Rate is distributed across your portfolio's lifetime.`}
    >
      <View style={{ gap: spacing.sm }}>
        {rows.map((r) => (
          <View
            key={r.label}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: spacing.md,
              padding: spacing.md,
              borderRadius: radius.lg,
              borderWidth: 1,
              borderColor: colors.border,
              backgroundColor: colors.card,
            }}
          >
            <View style={{ flex: 1 }}>
              <Text variant="label">{r.label}</Text>
              <Text variant="caption" color={colors.mutedForeground}>
                {r.detail}
              </Text>
            </View>
            <Text variant="mono" color={r.color} tabular>
              {formatCurrencyWhole(r.amount)}
            </Text>
          </View>
        ))}

        {/* Total row */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            padding: spacing.md,
            borderRadius: radius.lg,
            backgroundColor: colors.muted,
            borderWidth: 1,
            borderColor: colors.rose,
          }}
        >
          <Text variant="label">Total Fee Drag</Text>
          <Text variant="mono" color={colors.rose} tabular style={{ fontWeight: "800" }}>
            {formatCurrencyWhole(totalDrag)}
          </Text>
        </View>

        <Text variant="caption" color={colors.mutedForeground} style={{ marginTop: spacing.xs }}>
          These fees are deducted continuously from your mutual fund's NAV. This
          table estimates exactly how much of your wealth has been absorbed by
          each specific fee category over the lifetime of your SIP.
        </Text>
      </View>
    </Modal>
  );
}

export function FeeDragCard({
  data,
  feeRatePct,
  fundName,
}: {
  data: FeeDragPoint[];
  feeRatePct: number;
  fundName?: string;
}) {
  const { colors } = useTheme();
  const [detailsOpen, setDetailsOpen] = useState(false);
  const latest = data.length > 0 ? data[data.length - 1].cumulativeDrag : 0;

  return (
    <Card padded style={{ gap: spacing.md }}>
      <View style={{ flexDirection: "row", alignItems: "flex-start", gap: spacing.sm }}>
        <View style={{ flex: 1 }}>
          <Text variant="subheading">Cumulative Fee Drag</Text>
          <Text variant="caption" color={colors.mutedForeground}>
            Estimated — fees are already reflected in NAV, this shows their
            approximate cost
          </Text>
        </View>
        <Pressable
          onPress={() => setDetailsOpen(true)}
          style={({ pressed }) => ({
            flexDirection: "row",
            alignItems: "center",
            gap: 4,
            paddingHorizontal: spacing.sm + 2,
            paddingVertical: 5,
            borderRadius: radius.md,
            backgroundColor: colors.muted,
            opacity: pressed ? 0.7 : 1,
          })}
        >
          <Info size={12} color={colors.mutedForeground} />
          <Text variant="caption" color={colors.mutedForeground} style={{ fontWeight: "700" }}>
            Details
          </Text>
        </Pressable>
      </View>

      {data.length === 0 ? (
        <EmptyState title="Add entries to see estimated fee impact" />
      ) : (
        <>
          <View
            style={{
              flexDirection: "row",
              alignItems: "baseline",
              justifyContent: "space-between",
            }}
          >
            <Text variant="caption" color={colors.mutedForeground}>
              Cumulative drag to date
            </Text>
            <Text variant="label" color={colors.rose} tabular>
              {formatCurrencyWhole(latest)}
            </Text>
          </View>

          <LineChart
            labels={data.map((d) => d.date)}
            series={[
              {
                key: "feeDrag",
                name: "Cumulative Fee Drag",
                color: colors.rose,
                area: true,
                values: data.map((d) => d.cumulativeDrag),
              },
            ]}
            height={200}
            formatY={formatCompact}
            formatTooltipY={formatCurrencyWhole}
            formatX={formatDateShort}
          />
        </>
      )}

      <FeeDragBreakdownDialog
        visible={detailsOpen}
        onClose={() => setDetailsOpen(false)}
        feeRatePct={feeRatePct}
        fundName={fundName}
        totalDrag={latest}
      />
    </Card>
  );
}
