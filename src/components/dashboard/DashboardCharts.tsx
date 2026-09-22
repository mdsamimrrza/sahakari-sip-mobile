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
import { ArrowUpRight, ArrowDownRight, Info, Pencil } from "lucide-react-native";
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
  formatDate,
  formatDateShort,
  formatMonth,
  formatMonthShort,
  formatNav,
  formatPercentage,
} from "@/lib/format";
import { useTheme, radius, spacing, fontSize } from "@/theme";
import { Text, Card, EmptyState, Button } from "@/components/ui/primitives";
import { usePrivacy } from "@/lib/privacy/PrivacyContext";
import { SectionHeader } from "@/components/ui/layout";
import { Modal } from "@/components/ui/overlays";
import { BarChart, DonutChart, ChartLegend, LineChart } from "@/components/charts";

const SHADOW = {
  shadowColor: "#000",
  shadowOpacity: 0.07,
  shadowRadius: 8,
  shadowOffset: { width: 0, height: 2 },
  elevation: 2,
} as const;

/** Frosted reset pill shared by every chart card. */
function ResetPill({ label, onPress }: { label: string; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={{
        paddingHorizontal: spacing.sm + 2,
        paddingVertical: 5,
        borderRadius: radius.full,
        backgroundColor: `${colors.primary}14`,
      }}
    >
      <Text variant="caption" color={colors.primary} style={{ fontWeight: "800" }}>
        {label}
      </Text>
    </Pressable>
  );
}

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
  const { formatPrivate } = usePrivacy();
  const [range, setRange] = useState<TimeRange>("ALL");
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

  const filtered = useMemo(() => {
    if (data.length <= 1 || range === "ALL") return data;
    const lastDate = new Date(data[data.length - 1].date).getTime();
    const cutoff = RANGE_DAYS[range] * 24 * 60 * 60 * 1000;
    const kept = data.filter((d) => lastDate - new Date(d.date).getTime() <= cutoff);
    return kept.length >= 2 ? kept : data.slice(-2);
  }, [data, range]);

  const latestPoint = data.length > 0 ? data[data.length - 1] : null;
  const isSelected = selectedIndex !== null && selectedIndex < filtered.length;
  const activePoint = isSelected ? filtered[selectedIndex] : null;

  const currVal = activePoint ? activePoint.portfolioValue : (summary.currentValue ?? latestPoint?.portfolioValue ?? 0);
  const totalInv = activePoint ? activePoint.totalInvested : (summary.totalInvested ?? latestPoint?.totalInvested ?? 0);
  const gainVal = activePoint ? (currVal - totalInv) : (summary.gainLoss ?? (currVal ? currVal - totalInv : 0));
  const gainPct = activePoint
    ? (totalInv > 0 ? (gainVal / totalInv) * 100 : 0)
    : (summary.gainLossPct ?? (totalInv > 0 ? (gainVal / totalInv) * 100 : 0));
  const isPositive = gainVal >= 0;
  // Income green in profit, rust in loss — the portfolio line follows it.
  const gainColor = isPositive ? colors.emerald : colors.rose;

  if (data.length === 0) {
    return (
      <Card padded style={{ borderWidth: 0, ...SHADOW }}>
        <Text variant="subheading">Portfolio Growth</Text>
        <EmptyState title="Add entries to see your portfolio growth" />
      </Card>
    );
  }

  return (
    <Card style={{ borderWidth: 0, ...SHADOW }}>
      <View style={{ padding: spacing.xl, gap: spacing.md }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
        <Text variant="micro" color={colors.mutedForeground}>
          Portfolio Growth
        </Text>

        {activePoint ? (
          <ResetPill
            label={`${formatDateShort(activePoint.date)} (Reset)`}
            onPress={() => setSelectedIndex(null)}
          />
        ) : null}
      </View>

      <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.md, flexWrap: "wrap" }}>
        <Text
          variant="display"
          style={{
            fontSize: currVal >= 100000000 ? fontSize.lg : currVal >= 10000000 ? fontSize.xl : currVal >= 1000000 ? fontSize.xxl : fontSize.xxxl,
          }}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.6}
        >
          {formatPrivate(formatCurrencyWhole(currVal))}
        </Text>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 4,
            paddingHorizontal: spacing.sm + 2,
            paddingVertical: 5,
            borderRadius: radius.full,
            backgroundColor: `${gainColor}14`,
          }}
        >
          {isPositive ? (
            <ArrowUpRight size={13} color={gainColor} strokeWidth={2.6} />
          ) : (
            <ArrowDownRight size={13} color={gainColor} strokeWidth={2.6} />
          )}
          <Text variant="caption" color={gainColor} style={{ fontWeight: "800" }} tabular>
            {isPositive ? "+" : ""}
            {formatPrivate(formatCurrencyWhole(gainVal))} ({formatPercentage(gainPct)})
          </Text>
        </View>
      </View>

      {/* Time range tabs */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View
          style={{
            flexDirection: "row",
            backgroundColor: colors.muted,
            borderRadius: radius.lg,
            padding: 4,
            gap: 2,
          }}
        >
          {TIME_RANGES.map((r) => {
            const active = r === range;
            return (
              <Pressable
                key={r}
                onPress={() => {
                  setRange(r);
                  setSelectedIndex(null);
                }}
                style={{
                  paddingHorizontal: spacing.md,
                  paddingVertical: 7,
                  borderRadius: radius.md,
                  backgroundColor: active ? colors.card : "transparent",
                  shadowColor: active ? "#000" : "transparent",
                  shadowOpacity: active ? 0.08 : 0,
                  shadowRadius: 4,
                  shadowOffset: { width: 0, height: 2 },
                  elevation: active ? 2 : 0,
                }}
              >
                <Text
                  variant="caption"
                  color={active ? colors.foreground : colors.mutedForeground}
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
            name: "Portfolio Value (Updated NAV)",
            tooltipName: "Portfolio Value",
            color: "#2563EB",
            dots: true,
            values: filtered.map((d) => d.portfolioValue),
          },
          {
            key: "invested",
            name: "Total Invested",
            color: colors.mutedForeground, // quiet grey reference line
            dashed: true,
            dots: false,
            strokeWidth: 1.5,
            values: filtered.map((d) => d.totalInvested),
          },
        ]}
        height={240}
        minTop={4000}
        formatY={formatCompact}
        formatTooltipY={formatCurrencyWhole}
        formatX={formatDateShort}
        selectedIndex={selectedIndex}
        onSelectPoint={(idx) => setSelectedIndex(idx)}
        showLegend
      />
      </View>
    </Card>
  );
}

// ------------------------------------------------------------
// NAV history
// ------------------------------------------------------------

export function NavHistoryCard({
  data,
  onEditNav,
}: {
  data: ChartDataPoint[];
  /** Opens the NAV editor — the single home for NAV actions. */
  onEditNav?: () => void;
}) {
  const { colors } = useTheme();
  const [range, setRange] = useState<TimeRange>("ALL");
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

  const filtered = useMemo(() => {
    if (data.length <= 1 || range === "ALL") return data;
    const lastDate = new Date(data[data.length - 1].date).getTime();
    const cutoff = RANGE_DAYS[range] * 24 * 60 * 60 * 1000;
    const kept = data.filter((d) => lastDate - new Date(d.date).getTime() <= cutoff);
    return kept.length >= 2 ? kept : data.slice(-2);
  }, [data, range]);

  const latestNav = data.length > 0 ? data[data.length - 1].value : null;

  return (
    <Card style={{ borderWidth: 0, ...SHADOW }}>
      <View style={{ padding: spacing.xl, gap: spacing.md }}>
        {/* Header — title + green NAV chip + Update NAV action */}
        <View style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: spacing.sm }}>
          <Text variant="subheading" style={{ fontWeight: "900" }}>
            NAV History
          </Text>
          {latestNav ? (
            <View
              style={{
                paddingHorizontal: spacing.sm + 2,
                paddingVertical: 4,
                borderRadius: radius.md,
                backgroundColor: `${colors.emerald}1A`,
              }}
            >
              <Text
                variant="caption"
                color={colors.emerald}
                style={{ fontWeight: "800" }}
                tabular
              >
                NPR {formatNav(latestNav)}
              </Text>
            </View>
          ) : null}
          {onEditNav ? (
            <Pressable
              onPress={onEditNav}
              accessibilityRole="button"
              accessibilityLabel="Update NAV"
              style={({ pressed }) => ({
                marginLeft: "auto",
                flexDirection: "row",
                alignItems: "center",
                gap: 5,
                paddingHorizontal: spacing.sm + 2,
                paddingVertical: 6,
                borderRadius: radius.full,
                backgroundColor: colors.primary,
                opacity: pressed ? 0.8 : 1,
              })}
            >
              <Pencil size={12} color={colors.primaryForeground} />
              <Text
                variant="caption"
                color={colors.primaryForeground}
                style={{ fontWeight: "800" }}
              >
                Update NAV
              </Text>
            </Pressable>
          ) : null}
        </View>

        {/* Range tabs — brass-tinted pill bar, active range in dark ink */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View
            style={{
              flexDirection: "row",
              backgroundColor: "#F0E3C8", // brass tint
              borderRadius: radius.full,
              padding: 4,
              gap: 2,
            }}
          >
            {TIME_RANGES.map((r) => {
              const active = r === range;
              return (
                <Pressable
                  key={r}
                  onPress={() => {
                    setRange(r);
                    setSelectedIndex(null);
                  }}
                  style={{
                    paddingHorizontal: spacing.md,
                    paddingVertical: 7,
                    borderRadius: radius.full,
                    backgroundColor: active ? colors.foreground : "transparent",
                  }}
                >
                  <Text
                    variant="caption"
                    color={active ? colors.card : colors.warning}
                    style={{ fontWeight: "800" }}
                  >
                    {r}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </ScrollView>

        {data.length === 0 ? (
          <EmptyState title="No NAV history yet" description="Add entries or update the NAV." />
        ) : (
          <LineChart
            labels={filtered.map((d) => d.date)}
            series={[
              {
                key: "nav",
                name: "NAV",
                color: "#10B981",
                dots: true,
                values: filtered.map((d) => d.value),
              },
            ]}
            height={200}
            formatY={(v) => v.toFixed(1)}
            formatTooltipY={(v) => `NPR ${formatNav(v)}`}
            formatX={formatDateShort}
            // Tooltip shows the full date: month, day, and year.
            formatTooltipX={(d) => formatDate(d)}
            selectedIndex={selectedIndex}
            onSelectPoint={(idx) => setSelectedIndex(idx)}
          />
        )}
      </View>
    </Card>
  );
}

// ------------------------------------------------------------
// Monthly contributions
// ------------------------------------------------------------

// ------------------------------------------------------------
// Monthly contributions
// ------------------------------------------------------------

export function MonthlyContributionsCard({
  data,
}: {
  data: MonthlyContribution[];
}) {
  const { colors } = useTheme();
  const { formatPrivate } = usePrivacy();
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

  const sorted = useMemo(
    () => [...data].sort((a, b) => a.month.localeCompare(b.month)),
    [data]
  );

  const total = sorted.reduce((s, d) => s + d.amount, 0);
  const activeItem = selectedIndex !== null && sorted[selectedIndex] ? sorted[selectedIndex] : null;

  return (
    <Card style={{ borderWidth: 0, ...SHADOW }}>
      <View style={{ padding: spacing.xl, gap: spacing.md }}>
      <SectionHeader
        title="Monthly Contributions"
        subtitle={
          activeItem
            ? `Selected: ${formatMonth(activeItem.month)} · ${formatPrivate(formatCurrencyWhole(activeItem.amount))}`
            : `${sorted.length} month${sorted.length === 1 ? "" : "s"} · ${formatPrivate(formatCurrencyWhole(total))} deposited`
        }
        right={
          activeItem ? (
            <ResetPill label="Reset" onPress={() => setSelectedIndex(null)} />
          ) : undefined
        }
      />

      {sorted.length === 0 ? (
        <EmptyState title="No contributions recorded yet" />
      ) : (
        <BarChart
          labels={sorted.map((d) => d.month)}
          series={[
            {
              key: "contrib",
              name: "Contribution",
              color: colors.primary,
              values: sorted.map((d) => d.amount),
            },
          ]}
          height={200}
          formatY={formatCompact}
          formatTooltipY={formatCurrencyWhole}
          formatX={(m) => formatMonthShort(m)}
        />
      )}
      </View>
    </Card>
  );
}

// ------------------------------------------------------------
// Invested vs gain
// ------------------------------------------------------------

export function InvestedVsGainCard({
  totalInvested,
  currentValue,
  compact,
}: {
  totalInvested: number;
  currentValue: number | null;
  /** Smaller donut for the two-column dashboard row. */
  compact?: boolean;
}) {
  const { colors } = useTheme();
  const { formatPrivate } = usePrivacy();
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

  const value = currentValue ?? totalInvested;
  const gain = value - totalInvested;
  const gainPositive = gain >= 0;
  const gainPct = value > 0 ? (gain / value) * 100 : 0;
  // Vivid reference colors (deliberately brighter than the parchment palette,
  // matching the banking-style donut design the user signed off on).
  const investedColor = "#2563EB";
  const gainColor = gainPositive ? "#10B981" : colors.rose;

  const slices = [
    {
      name: "Invested Capital",
      value: Math.max(0, Math.min(totalInvested, value)),
      color: investedColor,
    },
    {
      name: gainPositive ? "Unrealised Gain" : "Unrealised Loss",
      value: Math.abs(gain),
      color: gainColor,
    },
  ];

  const activeSlice = selectedIndex !== null && slices[selectedIndex] ? slices[selectedIndex] : null;

  return (
    <Card style={{ borderWidth: 0, ...SHADOW }}>
      <View style={{ padding: spacing.xl, gap: spacing.md }}>
      <SectionHeader
        title="Invested vs Gain"
        subtitle={
          activeSlice
            ? `${activeSlice.name}: ${formatPrivate(formatCurrencyWhole(activeSlice.value))} (${((activeSlice.value / (value || 1)) * 100).toFixed(1)}%)`
            : "How your portfolio value splits between capital and return"
        }
        right={
          activeSlice ? (
            <ResetPill label="Reset" onPress={() => setSelectedIndex(null)} />
          ) : undefined
        }
      />

      <View style={{ flexDirection: "row", alignItems: "center", gap: compact ? spacing.md : spacing.lg }}>
        <DonutChart
          slices={slices}
          size={compact ? 120 : 150}
          thickness={compact ? 20 : 24}
          centerValue={`${gain >= 0 ? "+" : ""}${gainPct.toFixed(2)}%`}
          centerLabel={gainPositive ? "PROFIT" : "LOSS"}
          centerColor={gainColor}
          selectedIndex={selectedIndex}
          onSelectSlice={(idx) => setSelectedIndex(idx)}
        />
        <ChartLegend
          items={slices}
          formatValue={(v) => formatPrivate(formatCurrencyWhole(v))}
          selectedIndex={selectedIndex}
          onSelectSlice={(idx) => setSelectedIndex(idx)}
        />
      </View>
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
  const { formatPrivate } = usePrivacy();

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
              backgroundColor: colors.muted,
            }}
          >
            <View
              style={{
                width: 30,
                height: 30,
                borderRadius: 10,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: `${r.color}1F`,
              }}
            >
              <View
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: 5,
                  backgroundColor: r.color,
                }}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text variant="label">{r.label}</Text>
              <Text variant="caption" color={colors.mutedForeground}>
                {r.detail}
              </Text>
            </View>
            <Text variant="mono" color={r.color} tabular adjustsFontSizeToFit minimumFontScale={0.7} numberOfLines={1}>
              {formatPrivate(formatCurrencyWhole(r.amount))}
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
            backgroundColor: `${colors.rose}0F`,
          }}
        >
          <Text variant="label">Total Fee Drag</Text>
          <Text variant="mono" color={colors.rose} tabular style={{ fontWeight: "800" }} adjustsFontSizeToFit minimumFontScale={0.7} numberOfLines={1}>
            {formatPrivate(formatCurrencyWhole(totalDrag))}
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
  const { formatPrivate } = usePrivacy();
  const [detailsOpen, setDetailsOpen] = useState(false);
  const latest = data.length > 0 ? data[data.length - 1].cumulativeDrag : 0;

  return (
    <Card style={{ borderWidth: 0, ...SHADOW }}>
      <View style={{ padding: spacing.xl, gap: spacing.md }}>
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
            borderRadius: radius.full,
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
            <Text variant="label" color={colors.rose} tabular adjustsFontSizeToFit minimumFontScale={0.7} numberOfLines={1}>
              {formatPrivate(formatCurrencyWhole(latest))}
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
      </View>
    </Card>
  );
}
