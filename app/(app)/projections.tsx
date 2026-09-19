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
import type { ReturnScenario, StepUpRate } from "@/lib/types";
import { useTheme, spacing, radius, fontSize } from "@/theme";
import { Screen, SectionHeader } from "@/components/ui/layout";
import { AppHeader } from "@/components/layout/AppHeader";
import { Text, Card, Badge, Skeleton, Input, Button, EmptyState } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/overlays";
import { DropdownMenu, type DropdownAnchor } from "@/components/ui/overlays";
import { Check, ChevronDown } from "lucide-react-native";
import { LineChart } from "@/components/charts";

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
    <Screen header={<AppHeader />}>
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
            subtitle="Bar shows corpus · white tick shows put in"
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
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: spacing.sm,
                  }}
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
                </View>
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
                    Put in{" "}
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
        </>
      )}
    </Screen>
  );
}
