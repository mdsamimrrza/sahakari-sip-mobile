// ============================================================
// SahakariSIP — SIP Growth Projections
// ============================================================
// Port of the web app's (app)/projections/page.tsx:
//   • fund scope, return scenario (8/10/12%), annual step-up (0/5/10/15%)
//   • seeded starting corpus taken from the live portfolio
//   • 20-year growth chart with actual history + projected curve
//   • milestone cards at 5 / 10 / 15 / 20 years
// Math (params, chart data, table) is identical — only the layout is new.
// ============================================================

import React, { useMemo, useRef, useState } from "react";
import { Pressable, View } from "react-native";
import { useRouter } from "expo-router";
import { useDashboard } from "@/hooks/useData";
import {
  calculateProjectionChartData,
  calculateProjectionTable,
} from "@/lib/calculations/projections";
import {
  RETURN_SCENARIOS,
  STEP_UP_OPTIONS,
} from "@/lib/constants";
import { formatCompact, formatCurrencyWhole, parseDateSafe } from "@/lib/format";
import { formatFundShortName } from "@/lib/utils";
import { format } from "date-fns";
import type { ProjectionRow, ReturnScenario, StepUpRate } from "@/lib/types";
import { useTheme, spacing, radius, fontSize } from "@/theme";
import { Screen, SectionHeader } from "@/components/ui/layout";
import { AppHeader } from "@/components/layout/AppHeader";
import { Text, Card, Badge, Skeleton, Input, Button, EmptyState } from "@/components/ui/primitives";
import { Modal, useToast } from "@/components/ui/overlays";
import { DropdownMenu, type DropdownAnchor } from "@/components/ui/overlays";
import {
  Check,
  ChevronDown,
  Wallet,
  TrendingUp,
  Percent,
  ShieldCheck,
  CalendarClock,
  X,
} from "lucide-react-native";
import { LineChart } from "@/components/charts";
import { CGT_NP_REDEMPTION } from "@/lib/tax";

const SHADOW = {
  shadowColor: "#000",
  shadowOpacity: 0.07,
  shadowRadius: 8,
  shadowOffset: { width: 0, height: 2 },
  elevation: 2,
} as const;

const MILESTONE_YEARS = [5, 10, 15, 20];

/** Growth-curve axis: full years ("2026"), month + full year otherwise. */
function formatGrowthLabel(dateStr: string): string {
  if (!dateStr) return "";
  const d = parseDateSafe(dateStr);
  return d.getMonth() === 0 ? format(d, "yyyy") : format(d, "MMM yyyy");
}

/** Colorful selectable tiles for return / step-up picks. */
function TileGroup<T extends number | string>({
  options,
  value,
  onChange,
  tint,
}: {
  options: Array<{ value: T; label: string; hint: string }>;
  value: T;
  onChange: (value: T) => void;
  tint: string;
}) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: "row", gap: spacing.sm }}>
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <Pressable
            key={String(opt.value)}
            onPress={() => onChange(opt.value)}
            style={{ flex: 1 }}
          >
            {({ pressed }) => (
              <View
                style={{
                  alignItems: "center",
                  gap: 1,
                  paddingVertical: spacing.md,
                  borderRadius: radius.lg,
                  backgroundColor: active ? tint : colors.muted,
                  opacity: pressed ? 0.75 : 1,
                  shadowColor: active ? tint : "transparent",
                  shadowOpacity: active ? 0.35 : 0,
                  shadowRadius: 8,
                  shadowOffset: { width: 0, height: 3 },
                  elevation: active ? 3 : 0,
                }}
              >
                <Text
                  style={{ fontSize: fontSize.lg, fontWeight: "900" }}
                  color={active ? "#FFFFFF" : colors.mutedForeground}
                >
                  {opt.label}
                </Text>
                <Text
                  style={{ fontSize: 10, fontWeight: "700" }}
                  color={active ? "#FFFFFF" : colors.mutedForeground}
                >
                  {opt.hint}
                </Text>
              </View>
            )}
          </Pressable>
        );
      })}
    </View>
  );
}

export default function ProjectionsScreen() {
  const { colors, isDark } = useTheme();
  const { toast } = useToast();
  const router = useRouter();
  const [fundId, setFundId] = useState("all");
  // Hero "N fund(s)" pill doubles as a fund dropdown trigger.
  const fundPillRef = useRef<any>(null);
  const [pillAnchor, setPillAnchor] = useState<DropdownAnchor | null>(null);
  const [fundMenuOpen, setFundMenuOpen] = useState(false);
  const [returnPct, setReturnPct] = useState<number>(10);
  const [stepUpPct, setStepUpPct] = useState<number>(0);
  // Custom-value editor: which group is being typed into + its draft.
  const [customTarget, setCustomTarget] = useState<null | "growth" | "step">(null);
  const [customDraft, setCustomDraft] = useState("");

  const { data, loading, reload } = useDashboard(fundId);

  const funds = data?.funds ?? [];

  // Seed the projection with today's real portfolio value
  const currentCorpus = useMemo(() => {
    if (!data) return 0;
    const s = data.summary;
    return s.totalUnits > 0 && s.latestNav
      ? s.totalUnits * s.latestNav
      : s.totalInvested || 0;
  }, [data]);

  const realPrincipalSoFar = data?.summary.totalInvested ?? 0;

  // Active monthly SIP amount from the fund config (summed for "All Funds")
  const monthlySip = useMemo(() => {
    if (!data) return 5000;
    if (fundId !== "all") {
      const fund = data.funds.find((f) => f.id === fundId);
      return fund ? Number(fund.monthly_sip) : 5000;
    }
    if (data.funds.length > 0) {
      return data.funds.reduce((sum, f) => sum + Number(f.monthly_sip), 0);
    }
    return 5000;
  }, [data, fundId]);

  const params = {
    currentCorpus,
    monthlySip,
    annualReturnPct: returnPct as ReturnScenario,
    stepUpPct: stepUpPct as StepUpRate,
    yearsToProject: 20,
    realPrincipalSoFar,
  };

  const isCustomReturn = !(RETURN_SCENARIOS as readonly number[]).includes(returnPct);
  const isCustomStep = !(STEP_UP_OPTIONS as readonly number[]).includes(stepUpPct);

  function toggleCustomEditor(target: "growth" | "step") {
    // 1st tap opens, 2nd tap closes.
    if (customTarget === target) {
      setCustomTarget(null);
      setCustomDraft("");
      return;
    }
    setCustomDraft(
      target === "growth"
        ? isCustomReturn && returnPct > 0
          ? String(returnPct)
          : ""
        : isCustomStep
          ? String(stepUpPct)
          : ""
    );
    setCustomTarget(target);
  }

  function applyCustom() {
    const v = parseFloat(customDraft.replace(",", "."));
    if (customTarget === "growth") {
      if (!isFinite(v) || v <= 0 || v > 30) {
        toast({
          title: "Enter a growth rate",
          description: "Type a number between 0 and 30, e.g. 11.5.",
          variant: "destructive",
        });
        return;
      }
      setReturnPct(Math.round(v * 10) / 10);
      setCustomTarget(null);
    } else if (customTarget === "step") {
      if (!isFinite(v) || v < 0 || v > 50) {
        toast({
          title: "Enter a step-up rate",
          description: "Type a number between 0 and 50, e.g. 12.",
          variant: "destructive",
        });
        return;
      }
      setStepUpPct(Math.round(v * 10) / 10);
      setCustomTarget(null);
    }
  }

  const tableRows = useMemo(() => calculateProjectionTable(params), [params]);
  // Tapped milestone (5Y/10Y/15Y/20Y) shown in the breakdown sheet.
  const [milestoneDetail, setMilestoneDetail] = useState<ProjectionRow | null>(null);
  const milestones = useMemo(
    () => tableRows.filter((r) => MILESTONE_YEARS.includes(r.year)),
    [tableRows]
  );
  const finalCorpus = tableRows.length > 0 ? tableRows[tableRows.length - 1].corpusValue : 0;
  const finalGain = tableRows.length > 0 ? tableRows[tableRows.length - 1].totalGain : 0;
  const isEmpty = !loading && funds.length === 0;

  // Same math, fixed 8/10/12 scenarios for the compare card.
  const compareRows = useMemo(
    () =>
      ([8, 10, 12] as const).map((r) => {
        const rows = calculateProjectionTable({ ...params, annualReturnPct: r });
        const last = rows[rows.length - 1];
        return { rate: r, corpus: last.corpusValue, gain: last.totalGain };
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [currentCorpus, monthlySip, stepUpPct, realPrincipalSoFar]
  );

  const chartPoints = useMemo(
    () =>
      calculateProjectionChartData(
        (data?.portfolioChart ?? []).map((p) => ({
          date: p.date,
          value: p.portfolioValue,
        })),
        params
      ),
    [data, params]
  );

  // The chart keeps actual + projected on one axis; the projected series only
  // starts once the actual series ends.
  const chartLabels = chartPoints.map((p) => p.date);
  const actualValues = chartPoints.map((p) =>
    p.type === "actual" ? p.value : null
  );
  const projectedValues = chartPoints.map((p) =>
    p.type === "projected" ? p.value : null
  );

  // Model curve across history: what a flat SIP (your current monthly
  // amount) compounded at the chosen return would have built from the
  // earliest fund start. Always positive, so tapping a past date compares
  // your actual corpus against the steady-rate model. The bridge below
  // still pins the crossover point to the real corpus.
  if (data && data.funds.length > 0) {
    const earliest = data.funds
      .map((f) => f.start_date)
      .reduce((a, b) => (a < b ? a : b));
    const r = returnPct / 100 / 12;
    const monthsFrom = (d: string) => {
      const a = parseDateSafe(earliest);
      const b = parseDateSafe(d);
      if (isNaN(a.getTime()) || isNaN(b.getTime())) return 0;
      return Math.max(
        0,
        (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth())
      );
    };
    const fvFactor = (m: number) => (r === 0 ? m : ((1 + r) ** m - 1) / r);
    for (let i = 0; i < chartPoints.length; i++) {
      const p = chartPoints[i];
      if (p.type !== "actual") break;
      projectedValues[i] = Math.round(monthlySip * fvFactor(monthsFrom(p.date)));
    }
  }
  // Bridge the gap so the projected line connects to the last actual point
  const lastActualIdx: number = actualValues.reduce<number>(
    (acc, v, i) => (v !== null ? i : acc),
    -1
  );
  if (lastActualIdx >= 0 && lastActualIdx + 1 < projectedValues.length) {
    projectedValues[lastActualIdx] = actualValues[lastActualIdx];
  }

  const cold = loading && !data;

  return (
    <Screen refreshing={loading} onRefresh={reload} header={<AppHeader />}>
      {/* ---------- Hero: the 20-year number ---------- */}
      <View
        style={{
          backgroundColor: isDark ? "#1E293B" : colors.primary,
          marginHorizontal: -spacing.lg,
          marginTop: -spacing.xs,
          paddingHorizontal: spacing.xl,
          paddingTop: spacing.lg,
          paddingBottom: spacing.xl,
          borderBottomLeftRadius: 24,
          borderBottomRightRadius: 24,
          overflow: "hidden",
          shadowColor: "#000",
          shadowOpacity: 0.14,
          shadowRadius: 10,
          shadowOffset: { width: 0, height: 4 },
          elevation: 3,
        }}
      >
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            top: -46,
            right: -30,
            width: 130,
            height: 130,
            borderRadius: 65,
            backgroundColor: "#FFFFFF",
            opacity: 0.12,
          }}
        />
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            bottom: -60,
            right: 60,
            width: 150,
            height: 150,
            borderRadius: 75,
            backgroundColor: colors.secondary,
            opacity: 0.28,
          }}
        />
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: spacing.sm,
          }}
        >
          <Text variant="title" color="#FFFFFF" numberOfLines={1} style={{ flex: 1 }}>
            Growth Projections
          </Text>
          <Pressable
            ref={fundPillRef}
            onPress={() => {
              fundPillRef.current?.measureInWindow(
                (x: number, y: number, width: number, height: number) => {
                  setPillAnchor({ x, y, width, height });
                  setFundMenuOpen(true);
                }
              );
            }}
            accessibilityRole="button"
            accessibilityLabel="Choose fund scope"
            style={({ pressed }) => ({
              flexDirection: "row",
              alignItems: "center",
              gap: 4,
              paddingHorizontal: spacing.md,
              paddingVertical: 5,
              borderRadius: radius.full,
              backgroundColor: "#FFFFFF",
              opacity: pressed ? 0.8 : 1,
            })}
          >
            <Text
              style={{ fontSize: fontSize.xs, fontWeight: "800", color: isDark ? "#1E293B" : colors.primary }}
              numberOfLines={1}
            >
              {fundId === "all"
                ? `${funds.length} ${funds.length === 1 ? "fund" : "funds"}`
                : formatFundShortName(
                    funds.find((f) => f.id === fundId)?.fund_name ?? "Fund"
                  )}
            </Text>
            <ChevronDown
              size={12}
              color={isDark ? "#1E293B" : colors.primary}
              strokeWidth={3}
            />
          </Pressable>
        </View>
        {cold ? (
          <View style={{ marginTop: spacing.sm }}>
            <Skeleton height={34} width="60%" />
          </View>
        ) : (
          <>
            <Text
              style={{
                fontSize: fontSize.xxxl,
                fontWeight: "900",
                color: "#FFFFFF",
                fontVariant: ["tabular-nums"],
                marginTop: spacing.sm,
              }}
              numberOfLines={1}
            >
              {formatCurrencyWhole(finalCorpus)}
            </Text>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: spacing.sm,
                marginTop: 6,
                flexWrap: "wrap",
              }}
            >
              <Text style={{ fontSize: fontSize.sm, color: "#FFFFFF", opacity: 0.85, flexShrink: 1 }}>
                of which {finalGain >= 0 ? "+" : ""}{formatCurrencyWhole(finalGain)} profit
              </Text>
              <View style={{ flexDirection: "row", gap: spacing.xs }}>
                <View
                  style={{
                    paddingHorizontal: spacing.sm,
                    paddingVertical: 4,
                    borderRadius: radius.full,
                    backgroundColor: "#FFFFFF2E",
                  }}
                >
                  <Text style={{ fontSize: fontSize.xs, fontWeight: "800", color: "#FFFFFF" }}>
                    {returnPct}%
                  </Text>
                </View>
                <View
                  style={{
                    paddingHorizontal: spacing.sm,
                    paddingVertical: 4,
                    borderRadius: radius.full,
                    backgroundColor: "#FFFFFF2E",
                  }}
                >
                  <Text style={{ fontSize: fontSize.xs, fontWeight: "800", color: "#FFFFFF" }}>
                    {stepUpPct === 0 ? "Flat" : `+${stepUpPct}%`}
                  </Text>
                </View>
              </View>
            </View>
          </>
        )}
      </View>

      {/* Hero pill fund menu — same options as the dropdown field below */}
      {pillAnchor ? (
        <DropdownMenu
          visible={fundMenuOpen}
          onClose={() => setFundMenuOpen(false)}
          anchor={pillAnchor}
          width={Math.max(pillAnchor.width, 230)}
        >
          <View style={{ padding: spacing.xs }}>
            {funds.map((f) => {
              const active = f.id === fundId;
              return (
                <Pressable
                  key={f.id}
                  onPress={() => {
                    setFundId(f.id);
                    setFundMenuOpen(false);
                  }}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: spacing.sm,
                    paddingVertical: spacing.md,
                    paddingHorizontal: spacing.md,
                    borderRadius: radius.lg,
                    backgroundColor: active ? `${colors.primary}14` : "transparent",
                  }}
                >
                  <Text
                    variant="caption"
                    color={active ? colors.primary : colors.foreground}
                    style={{ flex: 1, fontWeight: active ? "800" : "600" }}
                  >
                    {formatFundShortName(f.fund_name)}
                  </Text>
                  {active ? <Check size={15} color={colors.primary} /> : null}
                </Pressable>
              );
            })}
          </View>
        </DropdownMenu>
      ) : null}

      {isEmpty ? (
        <Card padded style={{ borderWidth: 0, ...SHADOW }}>
          <EmptyState
            title="No fund to project yet"
            description="Set up your first fund and the 20-year projection will appear here."
            action={
              <Button size="sm" onPress={() => router.push("/onboarding")}>
                Set up your fund
              </Button>
            }
          />
        </Card>
      ) : (
        <>

      {/* ---------- Assumptions: pick a tile ---------- */}
      <Card style={{ borderWidth: 0, ...SHADOW }}>
        <View style={{ padding: spacing.xl, gap: spacing.md }}>
          <SectionHeader
            title="Assumptions"
            right={
              <Badge bg={`${colors.info}14`} color={colors.info}>
                Seed {formatCurrencyWhole(currentCorpus)}
              </Badge>
            }
          />
          <View style={{ gap: 6 }}>
            <Text variant="caption" color={colors.mutedForeground} style={{ fontWeight: "700" }}>
              YEARLY GROWTH · {formatCurrencyWhole(monthlySip)}/mo SIP
            </Text>
            <TileGroup<ReturnScenario>
              tint={colors.emerald}
              options={RETURN_SCENARIOS.map((r) => ({
                value: r as ReturnScenario,
                label: `${r}%`,
                hint: "per year",
              }))}
              value={returnPct as ReturnScenario}
              onChange={(v) => {
                setReturnPct(v);
                setCustomTarget(null);
              }}
            />
            <Pressable onPress={() => toggleCustomEditor("growth")} hitSlop={6}>
              {({ pressed }) => (
                <Text
                  variant="caption"
                  color={isCustomReturn ? colors.primary : colors.mutedForeground}
                  style={{ fontWeight: "800", opacity: pressed ? 0.6 : 1 }}
                >
                  {isCustomReturn ? `Custom: ${returnPct}% · change` : "Custom value…"}
                </Text>
              )}
            </Pressable>
            {customTarget === "growth" && (
              <View style={{ flexDirection: "row", gap: spacing.sm, alignItems: "center" }}>
                <Input
                  containerStyle={{ flex: 1 }}
                  value={customDraft}
                  onChangeText={setCustomDraft}
                  keyboardType="decimal-pad"
                  placeholder="e.g. 11.5"
                  accessibilityLabel="Custom yearly growth percent"
                />
                <Button size="sm" onPress={applyCustom}>
                  Set
                </Button>
                <Button size="sm" variant="outline" onPress={() => setCustomTarget(null)}>
                  Cancel
                </Button>
              </View>
            )}
          </View>
          <View style={{ gap: 6 }}>
            <Text variant="caption" color={colors.mutedForeground} style={{ fontWeight: "700" }}>
              YEARLY SIP STEP-UP
            </Text>
            <TileGroup<StepUpRate>
              tint={colors.amber}
              options={STEP_UP_OPTIONS.map((s) => ({
                value: s as StepUpRate,
                label: s === 0 ? "Flat" : `+${s}%`,
                hint: s === 0 ? "same SIP" : "every year",
              }))}
              value={stepUpPct as StepUpRate}
              onChange={(v) => {
                setStepUpPct(v);
                setCustomTarget(null);
              }}
            />
            <Pressable onPress={() => toggleCustomEditor("step")} hitSlop={6}>
              {({ pressed }) => (
                <Text
                  variant="caption"
                  color={isCustomStep ? colors.primary : colors.mutedForeground}
                  style={{ fontWeight: "800", opacity: pressed ? 0.6 : 1 }}
                >
                  {isCustomStep ? `Custom: ${stepUpPct}% · change` : "Custom value…"}
                </Text>
              )}
            </Pressable>
            {customTarget === "step" && (
              <View style={{ flexDirection: "row", gap: spacing.sm, alignItems: "center" }}>
                <Input
                  containerStyle={{ flex: 1 }}
                  value={customDraft}
                  onChangeText={setCustomDraft}
                  keyboardType="decimal-pad"
                  placeholder="e.g. 12"
                  accessibilityLabel="Custom yearly step-up percent"
                />
                <Button size="sm" onPress={applyCustom}>
                  Set
                </Button>
                <Button size="sm" variant="outline" onPress={() => setCustomTarget(null)}>
                  Cancel
                </Button>
              </View>
            )}
          </View>
        </View>
      </Card>

      {/* ---------- Compare growth rates: tap to apply ---------- */}
      <Card style={{ borderWidth: 0, ...SHADOW }}>
        <View style={{ padding: spacing.xl, gap: spacing.sm }}>
          <SectionHeader
            title="Compare rates"
            subtitle="20-year corpus at each growth rate · tap to apply"
          />
          {compareRows.map((row) => {
            const active = !isCustomReturn && returnPct === row.rate;
            return (
              <Pressable
                key={row.rate}
                onPress={() => {
                  setReturnPct(row.rate);
                  setCustomTarget(null);
                }}
                accessibilityRole="button"
                accessibilityLabel={`Apply ${row.rate} percent growth`}
              >
                {({ pressed }) => (
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: spacing.md,
                      padding: spacing.md,
                      borderRadius: radius.lg,
                      backgroundColor: active ? `${colors.emerald}12` : colors.muted,
                      opacity: pressed ? 0.7 : 1,
                    }}
                  >
                    <View
                      style={{
                        minWidth: 46,
                        paddingHorizontal: spacing.sm,
                        paddingVertical: 5,
                        borderRadius: 10,
                        alignItems: "center",
                        backgroundColor: active ? colors.emerald : `${colors.emerald}1F`,
                      }}
                    >
                      <Text
                        style={{ fontSize: fontSize.sm, fontWeight: "900" }}
                        color={active ? "#FFFFFF" : colors.emerald}
                      >
                        {row.rate}%
                      </Text>
                    </View>
                    <Text
                      style={{ flex: 1, fontSize: fontSize.md, fontWeight: "800", fontVariant: ["tabular-nums"] }}
                      numberOfLines={1}
                    >
                      {formatCurrencyWhole(row.corpus)}
                    </Text>
                    <Text
                      style={{ fontSize: fontSize.sm, fontWeight: "800", fontVariant: ["tabular-nums"] }}
                      color={row.gain >= 0 ? colors.success : colors.rose}
                    >
                      {formatCurrencyWhole(row.gain, true)}
                    </Text>
                  </View>
                )}
              </Pressable>
            );
          })}
        </View>
      </Card>

      {/* ---------- Growth chart ---------- */}
      <Card style={{ borderWidth: 0, ...SHADOW }}>
        <View style={{ padding: spacing.xl, gap: spacing.md }}>
          <SectionHeader
            title="Growth curve"
            subtitle="Your history, then 20 years of compounding"
          />
          {chartLabels.length === 0 ? (
            <Skeleton height={220} />
          ) : (
            <LineChart
              labels={chartLabels}
              series={[
                {
                  key: "actual",
                  name: "Actual",
                  color: colors.blue,
                  values: actualValues,
                },
                {
                  key: "projected",
                  name: "Projected",
                  color: colors.secondary,
                  dashed: true,
                  area: true,
                  values: projectedValues,
                },
              ]}
              height={250}
              formatY={formatCompact}
              formatTooltipY={formatCurrencyWhole}
              formatX={formatGrowthLabel}
              // Tooltip shows the full date: month, day, and year.
              formatTooltipX={(d) => {
                const dt = parseDateSafe(d);
                return isNaN(dt.getTime()) ? d : format(dt, "MMM d, yyyy");
              }}
              // Show both series rows on tap: the actual value when the
              // tapped date has history, the projection otherwise.
              tooltipShowAllSeries
              // Difference row: actual minus model - negative means your
              // real corpus is behind the steady-rate curve.
              returnLabel="Actual vs model:"
              showLegend
            />
          )}
        </View>
      </Card>

      {/* ---------- Milestones ---------- */}
      <Card style={{ borderWidth: 0, ...SHADOW }}>
        <View style={{ padding: spacing.xl, gap: spacing.sm }}>
          <SectionHeader
            title="Milestones"
            subtitle="Tap a row for the full breakdown · bar shows corpus"
          />
          {cold ? (
            <>
              <Skeleton height={64} />
              <Skeleton height={64} />
            </>
          ) : (
            milestones.map((r, idx) => {
              const isLast = idx === milestones.length - 1;
              return (
              <View key={r.year} style={{ gap: spacing.sm }}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Show ${r.year}-year projection breakdown`}
                  onPress={() => setMilestoneDetail(r)}
                  style={({ pressed }) => ({
                    flexDirection: "row",
                    alignItems: "center",
                    gap: spacing.sm,
                    opacity: pressed ? 0.6 : 1,
                    borderRadius: radius.sm,
                  })}
                >
                  <View
                    style={{
                      minWidth: 40,
                      paddingHorizontal: spacing.sm,
                      paddingVertical: 4,
                      borderRadius: 10,
                      alignItems: "center",
                      backgroundColor: isLast ? `${colors.secondary}26` : `${colors.emerald}1F`,
                    }}
                  >
                    <Text
                      style={{ fontSize: fontSize.sm, fontWeight: "900" }}
                      color={isLast ? colors.secondary : colors.emerald}
                    >
                      {r.year}Y
                    </Text>
                  </View>
                    <Text
                      style={{ flex: 1, fontSize: fontSize.md, fontWeight: "800", fontVariant: ["tabular-nums"] }}
                      color={colors.emerald}
                      numberOfLines={1}
                    >
                      {formatCurrencyWhole(r.corpusValue)}
                    </Text>
                  <Text
                    style={{ fontSize: fontSize.sm, fontWeight: "800", fontVariant: ["tabular-nums"] }}
                    color={r.totalGain >= 0 ? colors.success : colors.rose}
                  >
                    {formatCurrencyWhole(r.totalGain, true)}
                  </Text>
                </Pressable>
                  <View
                    style={{
                      height: 8,
                      borderRadius: 4,
                      backgroundColor: `${colors.emerald}14`,
                      overflow: "hidden",
                    }}
                  >
                    <View
                      style={{
                        width: `${Math.round((finalCorpus > 0 ? Math.max(0.03, Math.min(1, r.corpusValue / finalCorpus)) : 0) * 100)}%`,
                        height: 8,
                        borderRadius: 4,
                        backgroundColor: isLast ? colors.secondary : colors.emerald,
                      }}
                    />
                    <View
                      pointerEvents="none"
                      style={{
                        position: "absolute",
                        top: 0,
                        bottom: 0,
                        left: `${Math.round((finalCorpus > 0 ? Math.max(0, Math.min(1, r.totalInvested / finalCorpus)) : 0) * 100)}%`,
                        width: 2,
                        backgroundColor: "#FFFFFF",
                        opacity: 0.9,
                      }}
                    />
                  </View>
                  <Text variant="caption" color={colors.mutedForeground}>
                    Investment{" "}
                    <Text
                      variant="caption"
                      color={colors.info}
                      style={{ fontWeight: "800", fontVariant: ["tabular-nums"] }}
                    >
                      {formatCurrencyWhole(r.totalInvested)}
                    </Text>
                  </Text>
              </View>
              );
            }))}
          <Text variant="caption" color={colors.mutedForeground} style={{ fontSize: fontSize.xs }}>
            Monthly compounding at {returnPct}% with a {stepUpPct}% step-up, from
            your current corpus. An illustration, not a promise.
          </Text>
        </View>
      </Card>

      {/* ---------- Milestone breakdown (tap a milestone row) ---------- */}
      <Modal
        visible={milestoneDetail !== null}
        onClose={() => setMilestoneDetail(null)}
        position="bottom"
      >
        {milestoneDetail && (() => {
          // Tax split: growth from the last 12 months counts as short-term
          // (5%); everything older is long-term (3.75%). The table only
          // holds 5/10/15/20Y rows, so replay the same compounding loop
          // for 12 fewer months to get the year-ago gain.
          const monthsTotal = milestoneDetail.year * 12;
          const monthlyRate = params.annualReturnPct / 100 / 12;
          let agoCorpus = params.currentCorpus;
          let agoInvested = 0;
          let agoSip = params.monthlySip;
          for (let m = 1; m <= monthsTotal - 12; m++) {
            if (params.stepUpPct > 0 && m > 1 && (m - 1) % 12 === 0) {
              agoSip *= 1 + params.stepUpPct / 100;
            }
            agoCorpus = agoCorpus * (1 + monthlyRate) + agoSip;
            agoInvested += agoSip;
          }
          const agoGain = Math.round(
            agoCorpus - agoInvested - params.realPrincipalSoFar
          );
          const shortGain = Math.max(0, milestoneDetail.totalGain - agoGain);
          const longGain = Math.max(0, milestoneDetail.totalGain - shortGain);
          const cgtLong = Math.round(
            longGain * (CGT_NP_REDEMPTION.longTermRatePct / 100)
          );
          const cgtShort = Math.round(
            shortGain * (CGT_NP_REDEMPTION.shortTermRatePct / 100)
          );
          const cgt = cgtLong + cgtShort;
          const investedShare =
            milestoneDetail.corpusValue > 0
              ? Math.min(1, milestoneDetail.totalInvested / milestoneDetail.corpusValue)
              : 0;
          const gainPct =
            milestoneDetail.totalInvested > 0
              ? Math.round((milestoneDetail.totalGain / milestoneDetail.totalInvested) * 100)
              : 0;
          const gainPositive = milestoneDetail.totalGain >= 0;
          return (
          <View style={{ gap: spacing.lg, paddingTop: spacing.sm }}>
            {/* Sheet handle + header */}
            <View style={{ gap: spacing.md }}>
              <View
                style={{
                  alignSelf: "center",
                  width: 44,
                  height: 4,
                  borderRadius: 2,
                  backgroundColor: colors.border,
                }}
              />
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: spacing.md,
                }}
              >
                <View style={{ flex: 1 }}>
                  <Text variant="heading">Milestone breakdown</Text>
                  <Text variant="caption" color={colors.mutedForeground}>
                    Synced with your live portfolio
                  </Text>
                </View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Close breakdown"
                  onPress={() => setMilestoneDetail(null)}
                  style={({ pressed }) => ({
                    width: 32,
                    height: 32,
                    borderRadius: 16,
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: colors.muted,
                    opacity: pressed ? 0.6 : 1,
                  })}
                >
                  <X size={16} color={colors.mutedForeground} />
                </Pressable>
              </View>

              {/* Year switcher */}
              <View
                style={{
                  flexDirection: "row",
                  gap: 3,
                  padding: 3,
                  borderRadius: radius.full,
                  backgroundColor: colors.muted,
                }}
              >
                {milestones.map((m) => {
                  const active = m.year === milestoneDetail.year;
                  return (
                    <Pressable
                      key={m.year}
                      accessibilityRole="button"
                      accessibilityLabel={`Show ${m.year}-year breakdown`}
                      onPress={() => setMilestoneDetail(m)}
                      style={{
                        flex: 1,
                        paddingVertical: 8,
                        borderRadius: radius.full,
                        alignItems: "center",
                        backgroundColor: active ? colors.card : "transparent",
                        borderWidth: 1,
                        borderColor: active ? colors.border : "transparent",
                      }}
                    >
                      <Text
                        style={{ fontSize: fontSize.sm, fontWeight: "800", fontVariant: ["tabular-nums"] }}
                        color={active ? (m.year === 20 ? colors.secondary : colors.emerald) : colors.mutedForeground}
                      >
                        {m.year}Y
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            {/* Hero panel — solid gold banknote, dark ink text */}
            <View
              style={{
                borderRadius: radius.xl,
                backgroundColor: "#EAB308",
                paddingVertical: spacing.xl,
                paddingHorizontal: spacing.xl,
                overflow: "hidden",
              }}
            >
              {/* Coin décor */}
              <View pointerEvents="none" style={{ position: "absolute", left: -30, bottom: -44, width: 110, height: 110, borderRadius: 55, backgroundColor: "rgba(15,23,42,0.08)" }} />
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm }}>
                <Text style={{ fontSize: fontSize.xs, fontWeight: "900", letterSpacing: 1.4, color: "rgba(15,23,42,0.72)" }}>
                  PROJECTED CORPUS
                </Text>
                <View style={{ paddingHorizontal: spacing.md, paddingVertical: 4, borderRadius: radius.full, backgroundColor: "#0F172A" }}>
                  <Text style={{ fontSize: fontSize.xs, fontWeight: "900", fontVariant: ["tabular-nums"], color: "#EAB308" }}>
                    {milestoneDetail.year} YEARS
                  </Text>
                </View>
              </View>
              <Text
                style={{
                  fontSize: 42,
                  fontWeight: "900",
                  fontVariant: ["tabular-nums"],
                  letterSpacing: -1,
                  marginTop: spacing.xs,
                  color: "#0F172A",
                }}
                numberOfLines={1}
                adjustsFontSizeToFit
              >
                {formatCurrencyWhole(milestoneDetail.corpusValue)}
              </Text>
              <View
                style={{
                  alignSelf: "flex-start",
                  marginTop: spacing.sm,
                  paddingHorizontal: spacing.md,
                  paddingVertical: 6,
                  borderRadius: radius.full,
                  backgroundColor: "#0F172A",
                }}
              >
                <Text
                  style={{ fontSize: fontSize.sm, fontWeight: "900", fontVariant: ["tabular-nums"], color: "#FFFFFF" }}
                >
                  {formatCurrencyWhole(milestoneDetail.totalGain, true)} profit
                  {milestoneDetail.totalInvested > 0 ? ` (${Math.abs(gainPct)}%)` : ""}
                </Text>
              </View>
            </View>

            {/* Composition bar: investment vs growth */}
            <View style={{ gap: spacing.sm }}>
              <View
                style={{
                  height: 10,
                  borderRadius: 5,
                  overflow: "hidden",
                  flexDirection: "row",
                  backgroundColor: colors.muted,
                }}
              >
                <View
                  style={{
                    width: `${Math.round(investedShare * 100)}%`,
                    backgroundColor: colors.info,
                  }}
                />
                <View style={{ flex: 1, backgroundColor: colors.emerald }} />
              </View>
              <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.info }} />
                  <Text variant="caption" color={colors.mutedForeground}>
                    Investment{" "}
                    <Text style={{ fontWeight: "800", fontVariant: ["tabular-nums"] }} color={colors.info}>
                      {formatCurrencyWhole(milestoneDetail.totalInvested)}
                    </Text>
                    {milestoneDetail.corpusValue > 0
                      ? ` (${Math.round(investedShare * 100)}%)`
                      : ""}
                  </Text>
                </View>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.emerald }} />
                  <Text variant="caption" color={colors.mutedForeground}>
                    Profit{" "}
                    <Text style={{ fontWeight: "800", fontVariant: ["tabular-nums"] }} color={colors.emerald}>
                      {formatCurrencyWhole(milestoneDetail.totalGain)}
                    </Text>
                    {milestoneDetail.corpusValue > 0
                      ? ` (${100 - Math.round(investedShare * 100)}%)`
                      : ""}
                  </Text>
                </View>
              </View>
            </View>

            {/* Waterfall: how the corpus is built */}
            <View
              style={{
                borderRadius: radius.xl,
                backgroundColor: colors.card,
                borderWidth: 1,
                borderColor: colors.border,
                overflow: "hidden",
                ...SHADOW,
              }}
            >
              {[
                {
                  icon: Wallet,
                  tint: colors.info,
                  sign: "",
                  label: "Investment",
                  sub: "Money you added",
                  value: formatCurrencyWhole(milestoneDetail.totalInvested),
                  pct: milestoneDetail.corpusValue > 0
                    ? `${Math.round(investedShare * 100)} of every 100 is your money`
                    : undefined,
                },
                {
                  icon: TrendingUp,
                  tint: colors.success,
                  sign: "+",
                  label: "Profit",
                  sub: milestoneDetail.totalInvested > 0
                    ? `+${Math.abs(gainPct)}% growth`
                    : undefined,
                  value: formatCurrencyWhole(milestoneDetail.totalGain),
                  pct: undefined as string | undefined,
                },
                {
                  icon: Percent,
                  tint: colors.amber,
                  sign: "\u2212",
                  label: `Long-term tax · ${CGT_NP_REDEMPTION.longTermRatePct}%`,
                  sub: "On older growth",
                  value: formatCurrencyWhole(cgtLong),
                  pct: undefined as string | undefined,
                },
                {
                  icon: Percent,
                  tint: colors.rose,
                  sign: "\u2212",
                  label: `Short-term tax · ${CGT_NP_REDEMPTION.shortTermRatePct}%`,
                  sub: "On last year's growth",
                  value: formatCurrencyWhole(cgtShort),
                  pct: undefined as string | undefined,
                },
              ].map((w, i) => (
                <View
                  key={w.label}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: spacing.md,
                    paddingVertical: spacing.md,
                    paddingHorizontal: spacing.md,
                    borderTopWidth: i === 0 ? 0 : 1,
                    borderTopColor: colors.border,
                  }}
                >
                  <View
                    style={{
                      width: 34,
                      height: 34,
                      borderRadius: 11,
                      alignItems: "center",
                      justifyContent: "center",
                      backgroundColor: `${w.tint}22`,
                    }}
                  >
                    <w.icon size={16} color={w.tint} strokeWidth={2.4} />
                  </View>
                  <View style={{ flex: 1, gap: 2 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                      {w.sign ? (
                        <View
                          style={{
                            width: 18,
                            height: 18,
                            borderRadius: 9,
                            alignItems: "center",
                            justifyContent: "center",
                            backgroundColor: w.tint,
                          }}
                        >
                          <Text style={{ fontSize: 12, fontWeight: "900", color: "#FFFFFF", lineHeight: 14 }}>
                            {w.sign}
                          </Text>
                        </View>
                      ) : null}
                      <Text variant="label" color={colors.foreground} style={{ fontWeight: "800" }}>
                        {w.label}
                      </Text>
                    </View>
                    {w.sub ? (
                      <Text
                        variant="caption"
                        color={colors.mutedForeground}
                        style={{ fontSize: 10, letterSpacing: 0.8, textTransform: "uppercase", fontWeight: "700" }}
                      >
                        {w.sub}
                      </Text>
                    ) : null}
                  </View>
                  <View style={{ alignItems: "flex-end", gap: 2 }}>
                    <Text
                      style={{ fontSize: fontSize.md, fontWeight: "900", fontVariant: ["tabular-nums"] }}
                      color={colors.foreground}
                    >
                      {w.value}
                    </Text>
                    {w.pct ? (
                      <View style={{ paddingHorizontal: 7, paddingVertical: 2, borderRadius: radius.full, backgroundColor: colors.muted }}>
                        <Text
                          style={{ fontSize: 10, fontWeight: "800", fontVariant: ["tabular-nums"] }}
                          color={colors.mutedForeground}
                        >
                          {w.pct}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                </View>
              ))}
              {/* Net after tax — the answer */}
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: spacing.md,
                  paddingVertical: spacing.md,
                  paddingHorizontal: spacing.md,
                  borderTopWidth: 1,
                  borderTopColor: colors.border,
                  backgroundColor: `${colors.secondary}14`,
                }}
              >
                <View
                  style={{
                    width: 34,
                    height: 34,
                    borderRadius: 11,
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: colors.secondary,
                  }}
                >
                  <ShieldCheck size={16} color="#FFFFFF" strokeWidth={2.4} />
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                    <View
                      style={{
                        width: 18,
                        height: 18,
                        borderRadius: 9,
                        alignItems: "center",
                        justifyContent: "center",
                        backgroundColor: colors.secondary,
                      }}
                    >
                      <Text style={{ fontSize: 12, fontWeight: "900", color: "#FFFFFF", lineHeight: 14 }}>
                        =
                      </Text>
                    </View>
                    <Text variant="label" color={colors.foreground} style={{ fontWeight: "900" }}>
                      Net after tax
                    </Text>
                  </View>
                  {milestoneDetail.corpusValue > 0 ? (
                    <Text variant="caption" color={colors.mutedForeground} style={{ fontSize: fontSize.xs }}>
                      After all tax · you keep {Math.round(((milestoneDetail.corpusValue - cgt) / milestoneDetail.corpusValue) * 1000) / 10} of every 100
                    </Text>
                  ) : null}
                </View>
                <Text
                  style={{ fontSize: fontSize.xl, fontWeight: "900", fontVariant: ["tabular-nums"] }}
                  color={colors.secondary}
                >
                  {formatCurrencyWhole(milestoneDetail.corpusValue - cgt)}
                </Text>
              </View>
            </View>

            {/* SIP by then */}
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                gap: spacing.md,
                paddingVertical: spacing.md,
                paddingHorizontal: spacing.md,
                borderRadius: radius.md,
                backgroundColor: colors.muted,
              }}
            >
              <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
                <CalendarClock size={16} color={colors.mutedForeground} />
                <Text variant="caption" color={colors.mutedForeground}>
                  Monthly SIP by then
                </Text>
              </View>
              <Text
                style={{ fontSize: fontSize.md, fontWeight: "800", fontVariant: ["tabular-nums"] }}
                color={colors.foreground}
              >
                {formatCurrencyWhole(milestoneDetail.monthlySip)}
              </Text>
            </View>

            <Text variant="caption" color={colors.mutedForeground} style={{ fontSize: fontSize.xs }}>
              Grown at {returnPct}% with a {stepUpPct}% step-up.
              Tax split: {CGT_NP_REDEMPTION.longTermRatePct}% long-term,{" "}
              {CGT_NP_REDEMPTION.shortTermRatePct}% short-term.
              An illustration, not a promise.
            </Text>
          </View>
          );
        })()}
      </Modal>
        </>
      )}
    </Screen>
  );
}
