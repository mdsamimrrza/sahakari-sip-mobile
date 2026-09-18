// ============================================================
// SahakariSIP — Dashboard
// ============================================================
// Port of the web app's (app)/dashboard/page.tsx:
//   • 4 KPI summary cards + personal summary sheet
//   • Latest NAV inline editor (single-fund scope only)
//   • Portfolio growth chart with time ranges
//   • NAV history, monthly contributions, invested-vs-gain, fee drag
// Redirects to /onboarding when no funds are configured yet, exactly
// like the server component does.
// ============================================================

import React, { useState } from "react";
import { View } from "react-native";
import { Redirect } from "expo-router";
import { useDashboard } from "@/hooks/useData";
import { useTheme, spacing } from "@/theme";
import { Screen, PageHeader } from "@/components/ui/layout";
import { AppHeader } from "@/components/layout/AppHeader";
import { Text, Card } from "@/components/ui/primitives";
import { Skeleton } from "@/components/ui/primitives";
import { SummaryCards } from "@/components/dashboard/SummaryCards";
import { LatestNavEditor } from "@/components/dashboard/LatestNavEditor";
import {
  FeeDragCard,
  InvestedVsGainCard,
  MonthlyContributionsCard,
  NavHistoryCard,
  PortfolioGrowthCard,
} from "@/components/dashboard/DashboardCharts";
import { EntryFormModal } from "@/components/entries/EntryFormModal";
import type { FundConfig } from "@/lib/types";

export default function DashboardScreen() {
  const { colors } = useTheme();
  const [fundId, setFundId] = useState<string>("all");
  const [entryOpen, setEntryOpen] = useState(false);

  const { data, loading, error, reload } = useDashboard(fundId);

  if (!loading && data && data.funds.length === 0) {
    return <Redirect href="/onboarding" />;
  }

  const funds: FundConfig[] = data?.funds ?? [];
  const activeFund =
    funds.find((f) => f.id === fundId) || (fundId === "all" ? undefined : funds[0]);

  const feeRatePct =
    fundId !== "all" && activeFund
      ? Number(activeFund.fee_rate_pct || 0)
      : funds.length > 0
        ? funds.reduce((s, f) => s + Number(f.fee_rate_pct || 0), 0) / funds.length
        : 0;

  return (
    <>
      <Screen refreshing={loading} onRefresh={reload} header={<AppHeader />}>
        <PageHeader
          title="SIP Dashboard"
          subtitle="Track your mutual fund performance, returns, and fee impact."
        />

        {/* Latest NAV editor — only meaningful for a single fund */}
        {fundId !== "all" && activeFund ? (
          <LatestNavEditor
            fundId={activeFund.id}
            currentNav={
              activeFund.latest_nav ? Number(activeFund.latest_nav) : null
            }
            currentNavDate={activeFund.latest_nav_date}
            onUpdated={reload}
          />
        ) : null}

        {error && !data ? (
          <Card padded>
            <Text variant="label" color={colors.destructive}>
              Could not load your dashboard
            </Text>
            <Text variant="caption" color={colors.mutedForeground} style={{ marginTop: 4 }}>
              {error}
            </Text>
          </Card>
        ) : null}

        {loading && !data ? (
          <View style={{ gap: spacing.md }}>
            <Skeleton height={128} />
            <Skeleton height={240} />
            <Skeleton height={200} />
          </View>
        ) : null}

        {data ? (
          <>
            <SummaryCards
              summary={data.summary}
              funds={funds}
              selectedFundId={fundId}
              onFundChange={setFundId}
              activeFund={activeFund}
              loading={loading && !data}
              onAddEntry={() => setEntryOpen(true)}
            />

            <PortfolioGrowthCard
              data={data.portfolioChart}
              summary={data.summary}
            />

            <NavHistoryCard data={data.navHistory} />

            <MonthlyContributionsCard data={data.monthlyContributions} />

            <InvestedVsGainCard
              totalInvested={data.summary.totalInvested}
              currentValue={data.summary.currentValue}
            />

            <FeeDragCard
              data={data.feeDragChart}
              feeRatePct={feeRatePct}
              fundName={
                fundId !== "all" && activeFund ? activeFund.fund_name : undefined
              }
            />
          </>
        ) : null}
      </Screen>

      <EntryFormModal
        visible={entryOpen}
        onClose={() => setEntryOpen(false)}
        funds={funds}
        defaultFundId={activeFund?.id}
        onSaved={reload}
      />
    </>
  );
}
