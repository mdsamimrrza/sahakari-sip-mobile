// ============================================================
// SahakariSIP — Registered SIP Schedule Fields (mobile)
// ============================================================
// Ported from web app (src/components/settings/sip-schedule-fields.tsx).
// The user enters the AD dates exactly as printed on their registration.
// The BS-calendar recurrence the fund manager performs in its backend
// is replicated here in the schedule engine - the user is never asked
// about calendars. Frequency options come from fund metadata.
// ============================================================

import React from "react";
import { View, Pressable, TextInput } from "react-native";
import { CalendarRange, Info, ShieldCheck } from "lucide-react-native";
import { useTheme, spacing, radius, fontSize } from "@/theme";
import { Text, Input, Card, Badge, Button } from "@/components/ui/primitives";
import { Select } from "@/components/ui/overlays";
import { formatBSDate, type SIPFrequency } from "@/lib/calendar/bs";
import { getFundMeta } from "@/lib/fund-meta";

export const FREQUENCY_LABELS: Record<SIPFrequency, string> = {
  MONTHLY: "Monthly",
  QUARTERLY: "Quarterly",
  SEMI_ANNUALLY: "Semi-annual",
  ANNUALLY: "Annual",
};

export interface SIPScheduleValue {
  frequency: SIPFrequency | null;
  /** Registered first due date, AD "YYYY-MM-DD" (as on the form). */
  anchorDate: string | null;
  verified: boolean;
}

export const EMPTY_SCHEDULE: SIPScheduleValue = {
  frequency: null,
  anchorDate: null,
  verified: false,
};

/**
 * Flat fields for the schedule. Recurrence is always BS - the
 * bank/fund-manager rule confirmed 2026-09-24 - so calendar_system is
 * fixed, never user-entered.
 */
export function scheduleToFormFields(value: SIPScheduleValue): Record<string, string> {
  return {
    frequency: value.frequency ?? "",
    calendar_system: value.frequency && value.anchorDate ? "BS" : "",
    anchor_date: value.anchorDate ?? "",
    schedule_verified: String(value.verified),
  };
}

interface Props {
  fundName: string;
  value: SIPScheduleValue;
  onChange: (next: SIPScheduleValue) => void;
  /**
   * When true, the start date mirrors the registration date and the field
   * renders as a locked preview; the first edit unlocks it (onEditStartDate).
   */
  startDateLocked?: boolean;
  onEditStartDate?: () => void;
}

export function SIPScheduleFields({
  fundName,
  value,
  onChange,
  startDateLocked = false,
  onEditStartDate,
}: Props) {
  const { colors } = useTheme();
  const meta = getFundMeta(fundName);

  if (!meta) {
    return (
      <Card
        style={{
          borderWidth: 1,
          borderColor: `${colors.warning}33`,
          backgroundColor: `${colors.warning}0A`,
          padding: spacing.md,
        }}
      >
        <View style={{ flexDirection: "row", gap: spacing.sm, alignItems: "flex-start" }}>
          <Info size={16} color={colors.warning} style={{ marginTop: 1 }} />
          <Text variant="caption" color={colors.mutedForeground} style={{ flex: 1, lineHeight: 18 }}>
            <Text style={{ fontWeight: "700", color: colors.warning }}>Unverified fund.</Text>{" "}
            SahakariSIP has no official configuration for "{fundName || "this fund"}", so
            an exact schedule cannot be confirmed here. Installments follow your SIP
            registration date monthly until the fund is verified. The app never invents
            any other date.
          </Text>
        </View>
      </Card>
    );
  }

  const set = (patch: Partial<SIPScheduleValue>) => onChange({ ...value, ...patch });
  const complete = Boolean(value.frequency && value.anchorDate);

  return (
    <View style={{ gap: spacing.md }}>
      {/* Interval + start date, side by side */}
      <View style={{ flexDirection: "row", gap: spacing.md }}>
        <View style={{ flex: 1, gap: 4 }}>
          <Text variant="caption" color={colors.mutedForeground} style={{ fontWeight: "700", fontSize: fontSize.xs }}>
            SIP Interval
          </Text>
          <Select
            value={value.frequency ?? ""}
            onValueChange={(v: string) => set({ frequency: v as SIPFrequency, verified: false })}
            placeholder="Select..."
            options={meta.supportedFrequencies.map((f) => ({
              value: f,
              label: FREQUENCY_LABELS[f],
            }))}
          />
        </View>
        <View style={{ flex: 1, gap: 4 }}>
          <Text variant="caption" color={colors.mutedForeground} style={{ fontWeight: "700", fontSize: fontSize.xs }}>
            SIP Start Date
          </Text>
          <View style={{ flexDirection: "row", gap: spacing.sm, alignItems: "center" }}>
            <Input
              containerStyle={{ flex: 1 }}
              value={value.anchorDate ?? ""}
              onChangeText={(v) => {
                onEditStartDate?.();
                set({ anchorDate: v || null, verified: false });
              }}
              placeholder="YYYY-MM-DD"
              keyboardType="numeric"
              editable={!startDateLocked}
            />
            {startDateLocked && (
              <Button size="sm" variant="ghost" onPress={() => onEditStartDate?.()}>
                Change
              </Button>
            )}
          </View>
          {startDateLocked && (
            <Text variant="caption" color={colors.mutedForeground} style={{ fontSize: fontSize.xs }}>
              Same as your registration date
            </Text>
          )}
        </View>
      </View>

      {/* The fund-side BS rule, surfaced as a quiet note */}
      {value.anchorDate && (
        <Card
          style={{
            borderWidth: 1,
            borderColor: `${colors.primary}33`,
            backgroundColor: `${colors.primary}08`,
            padding: spacing.md,
          }}
        >
          <View style={{ flexDirection: "row", gap: spacing.sm, alignItems: "flex-start" }}>
            <CalendarRange size={16} color={colors.primary} style={{ marginTop: 1 }} />
            <Text variant="caption" color={colors.mutedForeground} style={{ flex: 1, lineHeight: 18 }}>
              Every installment repeats{" "}
              <Text style={{ fontWeight: "700", color: colors.foreground }}>{formatBSDate(value.anchorDate)} BS</Text>
              . This is the same date rule the fund applies on its side.
            </Text>
          </View>
        </Card>
      )}

      {/* Confirm checkbox - becomes a highlighted card when checked */}
      <Pressable
        onPress={() => complete && set({ verified: !value.verified })}
        disabled={!complete}
        style={{
          flexDirection: "row",
          gap: spacing.md,
          padding: spacing.md,
          borderRadius: radius.lg,
          borderWidth: 1,
          borderColor: value.verified
            ? `${colors.primary}40`
            : complete
            ? colors.border
            : `${colors.border}60`,
          backgroundColor: value.verified
            ? `${colors.primary}08`
            : complete
            ? colors.card
            : `${colors.card}50`,
          opacity: complete ? 1 : 0.6,
        }}
      >
        <View
          style={{
            width: 24,
            height: 24,
            borderRadius: 6,
            borderWidth: 2,
            borderColor: value.verified ? colors.primary : colors.mutedForeground,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: value.verified ? colors.primary : "transparent",
          }}
        >
          {value.verified && <ShieldCheck size={14} color="#FFFFFF" />}
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.xs }}>
            <ShieldCheck
              size={14}
              color={value.verified ? colors.primary : colors.mutedForeground}
            />
            <Text variant="caption" color={colors.foreground} style={{ fontWeight: "700" }}>
              Confirm this matches my SIP registration
            </Text>
          </View>
          <Text variant="caption" color={colors.mutedForeground} style={{ fontSize: fontSize.xs }}>
            {complete
              ? "Reminders and due dates will follow these exact dates."
              : "Pick an interval and start date to confirm."}
          </Text>
        </View>
      </Pressable>
    </View>
  );
}