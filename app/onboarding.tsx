// ============================================================
// SahakariSIP — Onboarding wizard
// ============================================================
// 6-step first-time fund setup, ported from the web app's
// components/onboarding/onboarding-wizard.tsx:
//   1. Choose Fund   2. Fee Rate   3. Monthly SIP
//   4. Start Date    5. Current NAV   6. SIP Schedule
// ============================================================

import React, { useState, useEffect } from "react";
import { View, ScrollView, KeyboardAvoidingView } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  ChevronRight,
  ChevronLeft,
  CheckCircle,
  Building2,
  Percent,
  Coins,
  CalendarDays,
  TrendingUp,
  CalendarRange,
} from "lucide-react-native";
import { useAuth } from "@/lib/auth/AuthContext";
import { FUND_PRESETS, MIN_SIP_AMOUNT } from "@/lib/constants";
import { todayKey } from "@/lib/format";
import { useTheme, spacing, radius, fontSize } from "@/theme";
import { Text, Button, Input, Card } from "@/components/ui/primitives";
import { Select, useToast } from "@/components/ui/overlays";
import { DateField } from "@/components/ui/DateField";
import { AppLogo } from "@/components/layout/AppLogo";
import { SIPScheduleFields, EMPTY_SCHEDULE, type SIPScheduleValue, scheduleToFormFields } from "@/components/settings/sip-schedule-fields";
import { getFundMeta } from "@/lib/fund-meta";

const STEPS = [
  { title: "Choose Fund", description: "Which fund are you tracking?", icon: Building2, tintKey: "purple" as const },
  { title: "Fee Rate", description: "Annual fee percentage", icon: Percent, tintKey: "amber" as const },
  { title: "Monthly SIP", description: "Your planned monthly investment", icon: Coins, tintKey: "emerald" as const },
  { title: "Start Date", description: "When did you start?", icon: CalendarDays, tintKey: "info" as const },
  { title: "Current NAV", description: "Current market NAV of the fund", icon: TrendingUp, tintKey: "success" as const },
  { title: "SIP Schedule", description: "Your registered due date and frequency", icon: CalendarRange, tintKey: "primary" as const },
];

export default function OnboardingScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { store } = useAuth();
  const { toast } = useToast();

  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [fundName, setFundName] = useState("");
  const [customFundName, setCustomFundName] = useState("");
  const [feeRate, setFeeRate] = useState("");
  const [monthlySip, setMonthlySip] = useState("");
  const [startDate, setStartDate] = useState(todayKey());
  const [latestNav, setLatestNav] = useState("10.00");
  const [schedule, setSchedule] = useState<SIPScheduleValue>(EMPTY_SCHEDULE);
  // The SIP start date mirrors the registration date until customized.
  const [anchorEdited, setAnchorEdited] = useState(false);

  useEffect(() => {
    if (!anchorEdited) {
      setSchedule((s) =>
        s.anchorDate === startDate ? s : { ...s, anchorDate: startDate, verified: false }
      );
    }
  }, [startDate, anchorEdited]);

  const isCustomFund = fundName === "other";
  const actualFundName = isCustomFund ? customFundName : fundName;

  function handleFundSelect(value: string) {
    setFundName(value);
    if (value !== "other") {
      const preset = FUND_PRESETS.find((f) => f.name === value);
      if (preset) setFeeRate(preset.feeRate.toString());
    } else {
      setFeeRate("");
    }
  }

  function canProceed(): boolean {
    switch (step) {
      case 0:
        return isCustomFund ? customFundName.trim().length > 0 : fundName.length > 0;
      case 1:
        return parseFloat(feeRate) > 0;
      case 2: {
        const min = getFundMeta(actualFundName)?.minimumSipAmount ?? MIN_SIP_AMOUNT;
        return parseFloat(monthlySip) >= (min || 1);
      }
      case 3:
        return startDate.length > 0;
      case 4:
        return parseFloat(latestNav) > 0;
      case 5:
        // Skippable: an unconfirmed schedule simply gets no reminders.
        // The component only allows checking "confirmed" when complete.
        return true;
      default:
        return false;
    }
  }

  async function handleSubmit() {
    if (!store) return;
    setLoading(true);

    const scheduleFields = scheduleToFormFields(schedule);

    const result = await store.createFundConfig({
      fund_name: actualFundName,
      fee_rate_pct: parseFloat(feeRate),
      start_date: startDate,
      monthly_sip: parseFloat(monthlySip),
      latest_nav: parseFloat(latestNav),
      frequency: (scheduleFields.frequency as "MONTHLY" | "QUARTERLY" | "SEMI_ANNUALLY" | "ANNUALLY" | null) || undefined,
      calendar_system: (scheduleFields.calendar_system as "AD" | "BS" | null) || undefined,
      anchor_date: scheduleFields.anchor_date || undefined,
      schedule_verified: scheduleFields.schedule_verified === "true",
    });

    setLoading(false);

    if (result.success) {
      // Fire the NAV feed sync now that the first fund exists — a fresh
      // account gets the real market NAV immediately instead of waiting
      // for the next app restart (throttled to daily inside the store).
      void store.syncNavFeed?.();
      toast({
        title: "Welcome to SahakariSIP! 🎉",
        description: "Your fund is set up. Start adding your SIP entries.",
        variant: "success",
      });
      router.replace("/(app)/dashboard");
    } else {
      toast({
        title: "Setup failed",
        description: result.error,
        variant: "destructive",
      });
    }
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.background }}
      behavior="padding"
    >
      <ScrollView
        contentContainerStyle={{
          flexGrow: 1,
          justifyContent: "center",
          padding: spacing.lg,
          paddingTop: insets.top + spacing.xl,
          paddingBottom: insets.bottom + spacing.xxxl,
          gap: spacing.xl,
        }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={{ alignItems: "center" }}>
          <AppLogo size={30} />
        </View>

        {/* Progress — bar + step count */}
        <View style={{ gap: spacing.sm }}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <Text variant="caption" color={colors.mutedForeground} style={{ fontWeight: "800" }}>
              STEP {step + 1} OF {STEPS.length}
            </Text>
            <Text variant="caption" color={colors.primary} style={{ fontWeight: "800" }}>
              {Math.round(((step + 1) / STEPS.length) * 100)}%
            </Text>
          </View>
          <View
            style={{
              height: 8,
              borderRadius: 4,
              backgroundColor: colors.muted,
              overflow: "hidden",
            }}
          >
            <View
              style={{
                width: `${((step + 1) / STEPS.length) * 100}%`,
                height: 8,
                borderRadius: 4,
                backgroundColor: colors.primary,
              }}
            />
          </View>
        </View>

        <Card
          padded
          style={{
            borderWidth: 0,
            shadowColor: "#000",
            shadowOpacity: 0.07,
            shadowRadius: 8,
            shadowOffset: { width: 0, height: 2 },
            elevation: 2,
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}>
            <View
              style={{
                width: 46,
                height: 46,
                borderRadius: 15,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: `${colors[STEPS[step].tintKey]}1F`,
              }}
            >
              {React.createElement(STEPS[step].icon, {
                size: 22,
                color: colors[STEPS[step].tintKey],
              })}
            </View>
            <View style={{ flex: 1 }}>
              <Text variant="heading">{STEPS[step].title}</Text>
              <Text
                variant="caption"
                color={colors.mutedForeground}
                style={{ marginTop: 2 }}
              >
                {STEPS[step].description}
              </Text>
            </View>
          </View>

          <View style={{ gap: spacing.lg, marginTop: spacing.lg }}>
            {step === 0 && (
              <>
                <Select
                  label="Fund"
                  value={fundName}
                  onValueChange={handleFundSelect}
                  placeholder="Select a fund…"
                  options={[
                    ...FUND_PRESETS.map((f) => ({
                      value: f.name,
                      label: f.name,
                      hint: `${f.feeRate}% annual fee`,
                    })),
                    { value: "other", label: "Other — enter manually" },
                  ]}
                />
                {isCustomFund && (
                  <Input
                    label="Fund Name"
                    value={customFundName}
                    onChangeText={setCustomFundName}
                    placeholder="Enter fund name"
                  />
                )}
              </>
            )}

            {step === 1 && (
              <View style={{ gap: 4 }}>
                <Input
                  label="Annual Fee (%)"
                  value={feeRate}
                  onChangeText={setFeeRate}
                  keyboardType="decimal-pad"
                  placeholder="e.g. 1.80"
                />
                {fundName && !isCustomFund && (
                  <Text variant="caption" color={colors.mutedForeground}>
                    Pre-filled from {fundName} — you can edit this if needed
                  </Text>
                )}
              </View>
            )}

            {step === 2 && (
              <Input
                label={`Monthly SIP Amount (NPR) — minimum ${MIN_SIP_AMOUNT.toLocaleString("en-IN")}`}
                value={monthlySip}
                onChangeText={setMonthlySip}
                keyboardType="number-pad"
                placeholder="e.g. 5000"
              />
            )}

            {step === 3 && (
              <DateField
                label="SIP Start Date"
                value={startDate}
                onChange={setStartDate}
              />
            )}

            {step === 4 && (
              <View style={{ gap: 4 }}>
                <Input
                  label="Current NAV (NPR)"
                  value={latestNav}
                  onChangeText={setLatestNav}
                  keyboardType="decimal-pad"
                  placeholder="e.g. 10.50"
                />
                <Text variant="caption" color={colors.mutedForeground}>
                  Current market NAV for tracking portfolio valuation and returns.
                </Text>
              </View>
            )}

            {step === 5 && (
              <SIPScheduleFields
                fundName={actualFundName}
                value={schedule}
                onChange={setSchedule}
                startDateLocked={!anchorEdited}
                onEditStartDate={() => setAnchorEdited(true)}
              />
            )}
          </View>

          {/* Footer nav */}
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              marginTop: spacing.xl,
              gap: spacing.sm,
            }}
          >
            <Button
              variant="ghost"
              onPress={() => setStep((s) => Math.max(0, s - 1))}
              disabled={step === 0}
            >
              <ChevronLeft size={16} color={colors.foreground} />
              <Text variant="label">Back</Text>
            </Button>

            {step < STEPS.length - 1 ? (
              <Button
                onPress={() => setStep((s) => s + 1)}
                disabled={!canProceed()}
              >
                <Text variant="label" color={colors.primaryForeground}>
                  Next
                </Text>
                <ChevronRight size={16} color={colors.primaryForeground} />
              </Button>
            ) : (
              <Button
                onPress={handleSubmit}
                loading={loading}
                disabled={!canProceed()}
              >
                <CheckCircle size={16} color={colors.primaryForeground} />
                <Text variant="label" color={colors.primaryForeground}>
                  Start tracking
                </Text>
              </Button>
            )}
          </View>
        </Card>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
