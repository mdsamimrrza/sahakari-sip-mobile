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
import { View, Pressable, ScrollView, useWindowDimensions } from "react-native";
import {
  Wallet,
  TrendingUp,
  Coins,
  Flame,
  ArrowUpRight,
  ArrowDownRight,
  ChevronDown,
  Check,
  Eye,
  EyeOff,
} from "lucide-react-native";
import { useRouter } from "expo-router";
import type { DashboardSummary, FundConfig } from "@/lib/types";
import {
  formatCurrencyWhole,
  formatPercentage,
  formatUnits,
  formatStreak,
} from "@/lib/format";
import { formatFundShortName } from "@/lib/utils";
import { useTheme, radius, spacing, fontSize } from "@/theme";
import { Text, Card, Button, Skeleton } from "@/components/ui/primitives";
import { Modal } from "@/components/ui/overlays";
import { FundScopeSelector } from "./FundScopeSelector";
import { usePrivacy } from "@/lib/privacy/PrivacyContext";

function getHeroFontSize(text: string): number {
  const len = text.length;
  if (len <= 12) return 32;
  if (len <= 16) return 26;
  if (len <= 20) return 22;
  return 18;
}

export function SummaryCards({
  summary,
  funds,
  selectedFundId,
  onFundChange,
  activeFund,
  loading,
}: {
  summary: DashboardSummary;
  funds: FundConfig[];
  selectedFundId: string;
  onFundChange: (id: string) => void;
  activeFund?: FundConfig;
  loading?: boolean;
}) {
  const { colors, isDark } = useTheme();
  const { formatPrivate, isPrivate, togglePrivacy } = usePrivacy();
  const router = useRouter();
  const { width: screenWidth } = useWindowDimensions();
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [fundMenuOpen, setFundMenuOpen] = useState(false);

  // Eye button size scales slightly with screen width
  const eyeBtnSize = screenWidth < 360 ? 28 : 32;

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

  const rawValueDisplay =
    summary.currentValue !== null
      ? formatCurrencyWhole(summary.currentValue)
      : formatCurrencyWhole(summary.totalInvested);
  const currentValueDisplay = formatPrivate(rawValueDisplay);

  const effectiveDeployed = Math.max(
    0,
    summary.totalInvested - summary.unallottedCash
  );
  const avgUnitCost =
    summary.totalUnits > 0 ? summary.totalInvested / summary.totalUnits : 0;

  return (
    <View style={{ gap: spacing.md }}>
      {/* HERO: Portfolio Value — wrapper lets the fund dropdown overlay
          the card without being clipped by its overflow:"hidden" */}
      <View>
      <View
        style={{
          backgroundColor: isDark ? "#1E293B" : colors.primary,
          marginHorizontal: -spacing.lg,
          marginTop: -spacing.xs,
          paddingHorizontal: spacing.xl,
          paddingTop: spacing.md,
          paddingBottom: spacing.lg,
          borderBottomLeftRadius: 24,
          borderBottomRightRadius: 24,
          overflow: "hidden",
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
        <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
          <View
            style={{
              width: 32,
              height: 32,
              borderRadius: 11,
              backgroundColor: "#FFFFFF2E",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Wallet size={16} color="#FFFFFF" />
          </View>
          <Text variant="micro" color="#FFFFFF" style={{ opacity: 0.85, flex: 1 }}>
            PORTFOLIO VALUE
          </Text>
        </View>

        {/* Amount row: value + fixed-width eye button so layout never shifts */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            marginTop: spacing.xs,
          }}
        >
          <Text
            style={{
              fontSize: getHeroFontSize(currentValueDisplay),
              fontWeight: "900",
              color: "#FFFFFF",
              fontVariant: ["tabular-nums"],
              flex: 1,
            }}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.55}
          >
            {currentValueDisplay}
          </Text>
          {/* Fixed-width container: button is always here, icon just swaps */}
          <View
            style={{
              width: eyeBtnSize + 8,
              height: eyeBtnSize + 8,
              alignItems: "center",
              justifyContent: "center",
              marginLeft: spacing.sm,
            }}
          >
            <Pressable
              onPress={togglePrivacy}
              accessibilityRole="button"
              accessibilityLabel={isPrivate ? "Show amounts" : "Hide amounts"}
              style={({ pressed }) => ({
                width: eyeBtnSize,
                height: eyeBtnSize,
                borderRadius: eyeBtnSize / 2,
                backgroundColor: "#FFFFFF26",
                alignItems: "center",
                justifyContent: "center",
                opacity: pressed ? 0.6 : 1,
              })}
            >
              {isPrivate ? (
                <EyeOff size={eyeBtnSize * 0.55} color="#FFFFFF" strokeWidth={2.2} />
              ) : (
                <Eye size={eyeBtnSize * 0.55} color="#FFFFFF" strokeWidth={2.2} />
              )}
            </Pressable>
          </View>
        </View>
        <Text style={{ fontSize: fontSize.sm, color: "#FFFFFF", opacity: 0.85, marginTop: 2 }}>
          Invested {formatPrivate(formatCurrencyWhole(summary.totalInvested))}
        </Text>

        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            gap: spacing.sm,
            marginTop: spacing.sm,
            flexWrap: "wrap",
          }}
        >
          {summary.gainLoss !== null ? (
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 4,
                paddingHorizontal: spacing.md,
                paddingVertical: 5,
                borderRadius: radius.full,
                backgroundColor: "#FFFFFF2E",
              }}
            >
              {isPositive ? (
                <ArrowUpRight size={13} color="#FFFFFF" strokeWidth={2.6} />
              ) : (
                <ArrowDownRight size={13} color="#FFFFFF" strokeWidth={2.6} />
              )}
              <Text
                variant="caption"
                color="#FFFFFF"
                style={{ fontWeight: "800" }}
                tabular
              >
                {isPositive ? "+" : ""}
                {formatPrivate(formatCurrencyWhole(summary.gainLoss, true))} (
                {formatPercentage(summary.gainLossPct ?? 0)})
              </Text>
            </View>
          ) : null}
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 4,
              paddingHorizontal: spacing.md,
              paddingVertical: 5,
              borderRadius: radius.full,
              backgroundColor: "#FFFFFF2E",
            }}
          >
            <Flame size={13} color="#FFFFFF" strokeWidth={2.4} />
            <Text variant="caption" color="#FFFFFF" style={{ fontWeight: "800" }}>
              {formatStreak(summary.sipStreak)}
            </Text>
          </View>
        </View>

      </View>

      {/* Fund dropdown chip — overlaid on the card's top-right corner */}
      <View
        style={{
          position: "absolute",
          top: spacing.md + 2,
          right: spacing.lg,
          zIndex: 41,
        }}
      >
        {fundMenuOpen ? (
          <Pressable
            onPress={() => setFundMenuOpen(false)}
            style={{
              position: "absolute",
              top: -2000,
              left: -2000,
              right: -2000,
              bottom: -2000,
              zIndex: 40,
            }}
          />
        ) : null}
        <Pressable
          onPress={() => setFundMenuOpen((v) => !v)}
          accessibilityRole="button"
          accessibilityLabel="Choose fund"
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 4,
            paddingHorizontal: spacing.md,
            paddingVertical: 5,
            borderRadius: radius.full,
            backgroundColor: "#FFFFFF",
            zIndex: 41,
          }}
        >
          <Text
            style={{ fontSize: fontSize.xs, fontWeight: "800", color: isDark ? "#1E293B" : colors.primary }}
            numberOfLines={1}
          >
            {selectedFundId === "all"
              ? `${funds.length} ${funds.length === 1 ? "fund" : "funds"}`
              : formatFundShortName(activeFund?.fund_name ?? "")}
          </Text>
          <ChevronDown size={13} color={isDark ? "#1E293B" : colors.primary} strokeWidth={2.6} />
        </Pressable>
        {fundMenuOpen ? (
          <View
            style={{
              position: "absolute",
              top: 36,
              right: 0,
              zIndex: 42,
              minWidth: 210,
              backgroundColor: colors.card,
              borderRadius: radius.lg,
              borderWidth: 1,
              borderColor: colors.border,
              paddingVertical: spacing.xs,
              shadowColor: "#000",
              shadowOpacity: 0.15,
              shadowRadius: 12,
              shadowOffset: { width: 0, height: 4 },
              elevation: 8,
            }}
          >
            {[
              { id: "all", label: "All Funds" },
              ...funds.map((f) => ({
                id: f.id,
                label: formatFundShortName(f.fund_name),
              })),
            ].map((opt) => {
              const active = opt.id === selectedFundId;
              return (
                <Pressable
                  key={opt.id}
                  onPress={() => {
                    setFundMenuOpen(false);
                    onFundChange(opt.id);
                  }}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: spacing.sm,
                    paddingHorizontal: spacing.md,
                    paddingVertical: 10,
                    borderRadius: radius.md,
                    backgroundColor: active ? colors.muted : "transparent",
                  }}
                >
                  <Text
                    variant="caption"
                    color={active ? colors.foreground : colors.mutedForeground}
                    style={{ fontWeight: active ? "800" : "500" }}
                    numberOfLines={1}
                  >
                    {opt.label}
                  </Text>
                  {active ? (
                    <Check size={14} color={colors.success} strokeWidth={3} />
                  ) : null}
                </Pressable>
              );
            })}
          </View>
        ) : null}
      </View>
      </View>

      {/* ---------- KPI strip ---------- */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: spacing.sm, paddingVertical: 2 }}
      >
        <KpiChip
          tint={gainColor}
          icon={
            isPositive ? (
              <ArrowUpRight size={15} color={gainColor} />
            ) : (
              <ArrowDownRight size={15} color={gainColor} />
            )
          }
          label="Net Gain"
          value={
            summary.gainLoss !== null
              ? formatPrivate(formatCurrencyWhole(summary.gainLoss, true))
              : formatPrivate("NPR 0")
          }
        />
        <KpiChip
          tint={colors.amber}
          icon={<TrendingUp size={15} color={colors.amber} />}
          label="XIRR Return"
          value={summary.xirr !== null ? formatPercentage(summary.xirr * 100) : "—"}
        />
        <KpiChip
          tint={colors.info}
          icon={<Wallet size={15} color={colors.info} />}
          label="Total Units"
          value={formatUnits(summary.totalUnits)}
        />
        <KpiChip
          tint={colors.purple}
          icon={<Coins size={15} color={colors.purple} />}
          label="Rollover Cash"
          value={formatPrivate(formatCurrencyWhole(summary.unallottedCash))}
        />
      </ScrollView>

      {/* ---------- Personal Summary banner ---------- */}
      <Pressable onPress={() => setSummaryOpen(true)}>
        <Card
          style={{
            borderWidth: 0,
            padding: spacing.lg,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            gap: spacing.md,
            shadowColor: "#000",
            shadowOpacity: 0.07,
            shadowRadius: 8,
            shadowOffset: { width: 0, height: 2 },
            elevation: 2,
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
                  ? formatPrivate(formatCurrencyWhole(summary.gainLoss, true))
                  : formatPrivate("NPR 0")}
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
                borderRadius: radius.md,
                backgroundColor: colors.muted,
              }}
            >
              <Text variant="caption" color={colors.primary} style={{ fontWeight: "800" }}>
                {formatStreak(summary.sipStreak)} STREAK
              </Text>
            </View>
          </View>

          {/* Hero */}
          <View
            style={{
              backgroundColor: colors.primary,
              borderRadius: radius.xl,
              padding: spacing.lg,
              gap: spacing.md,
            }}
          >
            <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
              <View>
                <Text variant="micro" color="rgba(255,255,255,0.72)">
                  Total Portfolio Value
                </Text>
                <Text variant="title" color="#FFFFFF" style={{ fontSize: fontSize.xxl }}>
                  {currentValueDisplay}
                </Text>
              </View>
              <View style={{ alignItems: "flex-end" }}>
                <Text variant="micro" color="rgba(255,255,255,0.72)">
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
              <Text variant="caption" color="rgba(255,255,255,0.72)">
                Invested: {formatCurrencyWhole(summary.totalInvested)}
              </Text>
              <Text variant="caption" color="rgba(255,255,255,0.72)">
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
                // Selected fund's NAV, else the freshest NAV across funds —
                // never a bare "—" when we know the last updated NAV.
                value:
                  activeFund?.latest_nav
                    ? `NPR ${Number(activeFund.latest_nav).toFixed(2)}`
                    : summary.latestNav
                      ? `NPR ${Number(summary.latestNav).toFixed(2)}`
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
              color={colors.primary}
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

function KpiChip({
  tint,
  icon,
  label,
  value,
}: {
  tint: string;
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  const { colors } = useTheme();
  return (
    <View
      style={{
        minWidth: 132,
        gap: spacing.sm,
        padding: spacing.md,
        borderRadius: radius.xl,
        backgroundColor: colors.card,
        borderWidth: 1,
        borderColor: colors.border,
        shadowColor: "#000",
        shadowOpacity: 0.06,
        shadowRadius: 6,
        shadowOffset: { width: 0, height: 2 },
        elevation: 2,
      }}
    >
      <View
        style={{
          width: 28,
          height: 28,
          borderRadius: 9,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: `${tint}1F`,
        }}
      >
        {icon}
      </View>
      <View style={{ gap: 1 }}>
        <Text
          variant="caption"
          color={colors.mutedForeground}
          style={{ fontWeight: "600", fontSize: 10, letterSpacing: 0.5, textTransform: "uppercase" }}
          numberOfLines={1}
        >
          {label}
        </Text>
        <Text variant="label" tabular style={{ fontWeight: "800", fontSize: fontSize.md }} numberOfLines={1}>
          {value}
        </Text>
      </View>
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
