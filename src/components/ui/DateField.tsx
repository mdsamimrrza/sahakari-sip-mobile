// ============================================================
// SahakariSIP — Date field
// ============================================================
// Native date picker wrapper. Values are exchanged as "YYYY-MM-DD"
// local-date strings, matching how the web app stores `purchase_date`
// and `start_date` in Postgres DATE columns.
// ============================================================

import React, { useState } from "react";
import { View, Pressable, Platform } from "react-native";
import DateTimePicker, {
  type DateTimePickerChangeEvent,
} from "@react-native-community/datetimepicker";
import { Calendar } from "lucide-react-native";
import { useTheme, radius, spacing } from "../../theme";
import { Text } from "./primitives";
import { formatDate, parseDateSafe, toDateKey, todayKey } from "../../lib/format";

export function DateField({
  label,
  value,
  onChange,
  maxDate,
  minDate,
  error,
}: {
  label?: string;
  value: string; // "YYYY-MM-DD"
  onChange: (next: string) => void;
  maxDate?: string;
  minDate?: string;
  error?: string | null;
}) {
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);

  const current = value ? parseDateSafe(value) : new Date();
  const safeCurrent = isNaN(current.getTime()) ? new Date() : current;

  const handleValueChange = ({ nativeEvent }: DateTimePickerChangeEvent) => {
    // Extract the date from the timestamp
    const date = new Date(nativeEvent.timestamp);
    onChange(toDateKey(date));
    // Close picker on value change (works for both platforms)
    setOpen(false);
  };

  const handleDismiss = () => {
    setOpen(false);
  };

  const handleNeutralPress = () => {
    onChange(toDateKey(new Date()));
    setOpen(false);
  };

  return (
    <View>
      {label ? (
        <Text
          variant="caption"
          color={colors.mutedForeground}
          style={{ fontWeight: "600", marginBottom: 6 }}
        >
          {label}
        </Text>
      ) : null}

      <Pressable
        onPress={() => setOpen((v) => !v)}
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          backgroundColor: colors.input,
          borderWidth: 1,
          borderColor: error ? colors.destructive : colors.border,
          borderRadius: radius.lg,
          paddingHorizontal: spacing.md,
          minHeight: 44,
        }}
      >
        <Text variant="body">{value ? formatDate(value) : "Select a date"}</Text>
        <Calendar size={17} color={colors.mutedForeground} />
      </Pressable>

      {error ? (
        <Text variant="caption" color={colors.destructive} style={{ marginTop: 4 }}>
          {error}
        </Text>
      ) : null}

      {open && (
        <View style={{ marginTop: spacing.sm, gap: spacing.sm }}>
          <DateTimePicker
            value={safeCurrent}
            mode="date"
            // iOS: inline spinner. Android: inline material calendar — NOT
            // "default", whose native dialog window intermittently leaves
            // the RN Modal underneath touch-dead after it closes (Apply
            // needed multiple taps). Inline rendering = no second window.
            display={Platform.OS === "ios" ? "spinner" : "calendar"}
            onChange={handleValueChange}
            onDismiss={handleDismiss}
            onNeutralButtonPress={handleNeutralPress}
            maximumDate={maxDate ? parseDateSafe(maxDate) : new Date()}
            minimumDate={minDate ? parseDateSafe(minDate) : undefined}
            themeVariant={undefined}
          />
          <View style={{ flexDirection: "row", gap: spacing.sm }}>
            <Pressable
              onPress={() => {
                onChange(todayKey());
                setOpen(false);
              }}
              style={{
                paddingHorizontal: spacing.md,
                paddingVertical: 6,
                borderRadius: radius.md,
                backgroundColor: colors.muted,
                borderWidth: 1,
                borderColor: colors.border,
              }}
            >
              <Text variant="caption" style={{ fontWeight: "700" }}>
                Today
              </Text>
            </Pressable>
            {Platform.OS === "ios" ? (
              <Pressable
                onPress={() => setOpen(false)}
                style={{
                  paddingHorizontal: spacing.md,
                  paddingVertical: 6,
                  borderRadius: radius.md,
                  backgroundColor: colors.primary,
                  borderWidth: 1,
                  borderColor: colors.border,
                }}
              >
                <Text
                  variant="caption"
                  color={colors.primaryForeground}
                  style={{ fontWeight: "700" }}
                >
                  Done
                </Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      )}
    </View>
  );
}
