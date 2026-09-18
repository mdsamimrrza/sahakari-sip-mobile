// ============================================================
// SahakariSIP — Onboarding wizard
// ============================================================
// 5-step first-time fund setup, ported from the web app's
// components/onboarding/onboarding-wizard.tsx:
//   1. Choose Fund   2. Fee Rate   3. Monthly SIP
//   4. Start Date    5. Current NAV
// ============================================================

import React, { useState } from "react";
import { View, ScrollView, KeyboardAvoidingView, Platform } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ChevronRight, ChevronLeft, CheckCircle } from "lucide-react-native";
import { useAuth } from "@/lib/auth/AuthContext";
import { FUND_PRESETS } from "@/lib/constants";
import { todayKey } from "@/lib/format";
import { useTheme, spacing, radius } from "@/theme";
import { Text, Button, Input, Card } from "@/components/ui/primitives";
import { Select, useToast } from "@/components/ui/overlays";
import { AppLogo } from "@/components/layout/AppLogo";

const STEPS = [
  { title: "Choose Fund", description: "Which fund are you tracking?" },
  { title: "Fee Rate", description: "Annual fee percentage" },
  { title: "Monthly SIP", description: "Your planned monthly investment" },
  { title: "Start Date", description: "When did you start?" },
  { title: "Current NAV", description: "Current market NAV of the fund" },
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
      case 2:
        return parseFloat(monthlySip) > 0;
      case 3:
        return startDate.length > 0;
      case 4:
        return parseFloat(latestNav) > 0;
      default:
        return false;
    }
  }

  async function handleSubmit() {
    if (!store) return;
    setLoading(true);

    const result = await store.createFundConfig({
      fund_name: actualFundName,
      fee_rate_pct: parseFloat(feeRate),
      start_date: startDate,
      monthly_sip: parseFloat(monthlySip),
      latest_nav: parseFloat(latestNav),
    });

    setLoading(false);

    if (result.success) {
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
      behavior={Platform.OS === "ios" ? "padding" : undefined}
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

        {/* Progress dots */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
          }}
        >
          {STEPS.map((_, i) => (
            <View
              key={i}
              style={{
                height: 8,
                width: i <= step ? 32 : 16,
                borderRadius: radius.md,
                backgroundColor: i <= step ? colors.primary : colors.muted,
              }}
            />
          ))}
        </View>

        <Card padded>
          <Text variant="heading">{STEPS[step].title}</Text>
          <Text
            variant="caption"
            color={colors.mutedForeground}
            style={{ marginTop: 2, marginBottom: spacing.lg }}
          >
            {STEPS[step].description}
          </Text>

          <View style={{ gap: spacing.lg }}>
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
                label="Monthly SIP Amount (NPR)"
                value={monthlySip}
                onChangeText={setMonthlySip}
                keyboardType="number-pad"
                placeholder="e.g. 5000"
              />
            )}

            {step === 3 && (
              <Input
                label="SIP Start Date (YYYY-MM-DD)"
                value={startDate}
                onChangeText={setStartDate}
                placeholder="2024-01-15"
                autoCapitalize="none"
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
