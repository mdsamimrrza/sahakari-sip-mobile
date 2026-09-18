// ============================================================
// SahakariSIP — Latest NAV editor
// ============================================================
// Port of the web app's components/dashboard/latest-nav-input.tsx:
// a compact pill showing the latest NAV + its date, with an inline
// edit mode that calls `updateLatestNav`.
// ============================================================

import React, { useState } from "react";
import { View, Pressable } from "react-native";
import { Pencil, Check, X } from "lucide-react-native";
import { useAuth } from "@/lib/auth/AuthContext";
import { formatDate, formatNav, todayKey } from "@/lib/format";
import { useTheme, radius, spacing } from "@/theme";
import { Text, Input } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/overlays";

export function LatestNavEditor({
  fundId,
  currentNav,
  currentNavDate,
  onUpdated,
}: {
  fundId: string;
  currentNav: number | null;
  currentNavDate: string | null;
  onUpdated?: () => void;
}) {
  const { colors } = useTheme();
  const { store } = useAuth();
  const { toast } = useToast();

  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(currentNav?.toString() ?? "");
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!store) return;
    const nav = parseFloat(value);
    if (!nav || nav <= 0) {
      toast({
        title: "Invalid NAV",
        description: "Enter a NAV greater than 0.",
        variant: "destructive",
      });
      return;
    }

    setSaving(true);
    const res = await store.updateLatestNav({
      fund_id: fundId,
      latest_nav: nav,
      latest_nav_date: todayKey(),
    });
    setSaving(false);

    if (res.success) {
      toast({
        title: "NAV updated",
        description: "Dashboard values have been recalculated.",
        variant: "success",
      });
      setEditing(false);
      onUpdated?.();
    } else {
      toast({
        title: "Failed to update NAV",
        description: res.error,
        variant: "destructive",
      });
    }
  }

  if (editing) {
    return (
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: spacing.sm,
          backgroundColor: colors.card,
          borderRadius: radius.xl,
          borderWidth: 2,
          borderColor: colors.border,
          paddingHorizontal: spacing.md,
          paddingVertical: spacing.sm,
        }}
      >
        <Text variant="caption" color={colors.mutedForeground}>
          Latest NAV:
        </Text>
        <Input
          value={value}
          onChangeText={setValue}
          keyboardType="decimal-pad"
          containerStyle={{ width: 96 }}
          autoFocus
          style={{ paddingVertical: 6 }}
        />
        <Pressable onPress={handleSave} disabled={saving} hitSlop={8}>
          <Check size={18} color={colors.success} />
        </Pressable>
        <Pressable
          onPress={() => {
            setEditing(false);
            setValue(currentNav?.toString() ?? "");
          }}
          hitSlop={8}
        >
          <X size={18} color={colors.mutedForeground} />
        </Pressable>
      </View>
    );
  }

  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        gap: spacing.sm,
        backgroundColor: colors.card,
        borderRadius: radius.xl,
        borderWidth: 2,
        borderColor: colors.border,
        paddingHorizontal: spacing.md,
        paddingVertical: 8,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "baseline", gap: 6 }}>
        <Text variant="caption" color={colors.mutedForeground}>
          Latest NAV:
        </Text>
        {currentNav !== null ? (
          <>
            <Text variant="label" tabular>
              {formatNav(currentNav)}
            </Text>
            {currentNavDate ? (
              <Text variant="caption" color={colors.mutedForeground}>
                ({formatDate(currentNavDate)})
              </Text>
            ) : null}
          </>
        ) : (
          <Text variant="caption" color={colors.mutedForeground} style={{ fontStyle: "italic" }}>
            Not set
          </Text>
        )}
      </View>
      <Pressable onPress={() => setEditing(true)} hitSlop={8}>
        <Pencil size={15} color={colors.mutedForeground} />
      </Pressable>
    </View>
  );
}
