// ============================================================
// SahakariSIP — SIP Growth Projections
// ============================================================
// Port of the web app's (app)/projections/page.tsx:
//   • fund scope, return scenario (8/10/12%), annual step-up (0/5/10/15%)
//   • seeded starting corpus taken from the live portfolio
//   • 20-year growth chart with actual history + projected curve
//   • milestone table at 5 / 10 / 15 / 20 years
// ============================================================

import React, { useMemo, useState } from "react";
import { View } from "react-native";
import { useDashboard } from "@/hooks/useData";
import {
  calculateProjectionChartData,
  calculateProjectionTable,
} from "@/lib/calculations/projections";
import {
  RETURN_SCENARIOS,
  STEP_UP_OPTIONS,
} from "@/lib/constants";
import { formatCompact, formatCurrencyWhole, formatDateShort } from "@/lib/format";
import type { ReturnScenario, StepUpRate } from "@/lib/types";
import { useTheme, spacing, radius } from "@/theme";
import { Screen, PageHeader, DataTable, SectionHeader } from "@/components/ui/layout";
import { AppHeader } from "@/components/layout/AppHeader";
import { Text, Card, Skeleton } from "@/components/ui/primitives";
import { Select } from "@/components/ui/overlays";
import { LineChart } from "@/components/charts";
import { FundScopeSelector } from "@/components/dashboard/FundScopeSelector";

export default function ProjectionsScreen() {
  const { colors } = useTheme();
  const [fundId, setFundId] = useState("all");
  const [returnPct, setReturnPct] = useState<ReturnScenario>(10);
  const [stepUpPct, setStepUpPct] = useState<StepUpRate>(0);

  const { data, loading } = useDashboard(fundId);

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
    annualReturnPct: returnPct,
    stepUpPct,
    yearsToProject: 20,
    realPrincipalSoFar,
  };

  const tableRows = useMemo(() => calculateProjectionTable(params), [params]);

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

  const tableColumns = [
    { key: "year", label: "Year", width: 0.6 },
    { key: "sip", label: "Monthly SIP", align: "right" as const },
    { key: "invested", label: "Invested", align: "right" as const },
    { key: "corpus", label: "Corpus", align: "right" as const },
    { key: "gain", label: "Gain", align: "right" as const },
  ];

  const tableData = tableRows.map((r) => ({
    key: String(r.year),
    cells: {
      year: { text: `${r.year}Y`, bold: true },
      sip: { text: formatCurrencyWhole(r.monthlySip) },
      invested: { text: formatCurrencyWhole(r.totalInvested) },
      corpus: { text: formatCurrencyWhole(r.corpusValue), bold: true },
      gain: {
        text: formatCurrencyWhole(r.totalGain, true),
        color: r.totalGain >= 0 ? colors.success : colors.rose,
      },
    },
  }));

  return (
    <Screen header={<AppHeader />}>
      <PageHeader
        title="SIP Growth Projections"
        subtitle="Simulate future corpus compounding based on your current portfolio and step-up preferences."
      />

      <FundScopeSelector
        funds={funds}
        selectedFundId={fundId}
        onChange={setFundId}
      />

      {/* Assumptions */}
      <Card padded style={{ gap: spacing.lg }}>
        <SectionHeader
          title="Projection Assumptions"
          subtitle="Adjust return rates and annual step-up percentages to see your future trajectory."
        />

        <Select
          label="Annualized Return Scenario"
          value={String(returnPct)}
          onValueChange={(v) => setReturnPct(Number(v) as ReturnScenario)}
          options={RETURN_SCENARIOS.map((r) => ({
            value: String(r),
            label: `${r}% CAGR`,
            hint: "Compound Annual Growth Rate",
          }))}
        />

        <Select
          label="Annual SIP Step-Up"
          value={String(stepUpPct)}
          onValueChange={(v) => setStepUpPct(Number(v) as StepUpRate)}
          options={STEP_UP_OPTIONS.map((s) => ({
            value: String(s),
            label: s === 0 ? "Flat (0% increase)" : `+${s}% every year`,
          }))}
        />

        <View style={{ gap: 6 }}>
          <Text
            variant="caption"
            color={colors.mutedForeground}
            style={{ fontWeight: "600" }}
          >
            Seeded Starting Corpus
          </Text>
          <View
            style={{
              backgroundColor: colors.muted,
              borderRadius: radius.lg,
              paddingHorizontal: spacing.md,
              paddingVertical: spacing.md,
            }}
          >
            {loading && !data ? (
              <Skeleton height={18} width={140} />
            ) : (
              <Text variant="label" color={colors.primary} tabular>
                {formatCurrencyWhole(currentCorpus)}
              </Text>
            )}
          </View>
          <Text variant="caption" color={colors.mutedForeground}>
            Monthly SIP seeded at {formatCurrencyWhole(monthlySip)} · invested so
            far {formatCurrencyWhole(realPrincipalSoFar)}
          </Text>
        </View>
      </Card>

      {/* Growth chart */}
      <Card padded style={{ gap: spacing.md }}>
        <SectionHeader
          title="Projected Growth"
          subtitle="Actual history up to today, then 20 years of compounding"
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
                values: projectedValues,
              },
            ]}
            height={250}
            formatY={formatCompact}
            formatTooltipY={formatCurrencyWhole}
            formatX={formatDateShort}
            showLegend
          />
        )}
      </Card>

      {/* Milestones */}
      <Card padded style={{ gap: spacing.md }}>
        <SectionHeader
          title="Milestone Projections"
          subtitle="Corpus value at 5, 10, 15 and 20 years"
        />
        <DataTable columns={tableColumns} rows={tableData} />
        <Text variant="caption" color={colors.mutedForeground}>
          Projections assume monthly compounding at {returnPct}% p.a. with a{" "}
          {stepUpPct}% annual step-up, seeded from your current corpus. They are
          illustrative and not a guarantee of future returns.
        </Text>
      </Card>
    </Screen>
  );
}
