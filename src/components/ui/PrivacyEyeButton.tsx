// ============================================================
// SahakariSIP — PrivacyEyeButton (shared, global)
// ============================================================
// One eye toggle used on Dashboard, History and Tax & Settlement.
// All instances read the same PrivacyContext, so a single tap hides
// (or shows) amounts on every page at once. Choice persists.
// Variants:
//   • "default" — muted circle for light headers (Tax)
//   • "hero"    — white circle for green hero bands (History)
// ============================================================

import { Pressable } from "react-native";
import { Eye, EyeOff } from "lucide-react-native";
import { usePrivacy } from "@/lib/privacy/PrivacyContext";
import { useTheme } from "@/theme";

export function PrivacyEyeButton({
  variant = "default",
}: {
  variant?: "default" | "hero";
}) {
  const { colors } = useTheme();
  const { isPrivate, togglePrivacy } = usePrivacy();

  const hero = variant === "hero";
  // Hero variant sits on the colored green band: no circle, just a white
  // glyph — same look as the dashboard header eye (HeaderIconButton).
  const size = hero ? 38 : 34;
  const backgroundColor = hero ? "transparent" : colors.muted;
  const iconColor = isPrivate
    ? colors.rose
    : hero
      ? "#FFFFFF"
      : colors.foreground;

  return (
    <Pressable
      onPress={togglePrivacy}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={isPrivate ? "Show amounts" : "Hide amounts"}
      style={({ pressed }) => ({
        height: size,
        width: size,
        borderRadius: size / 2,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor,
        opacity: pressed ? 0.75 : 1,
      })}
    >
      {isPrivate ? (
        <EyeOff size={size * 0.52} color={iconColor} strokeWidth={2.2} />
      ) : (
        <Eye size={size * 0.52} color={iconColor} strokeWidth={2.2} />
      )}
    </Pressable>
  );
}
