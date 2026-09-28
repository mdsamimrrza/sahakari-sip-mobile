// ============================================================
// SahakariSIP — Google sign-in button
// ============================================================
// Port of the web app's GoogleButton (src/components/auth/): the
// four-colour Google "G" mark on an outline button. On mobile it runs
// Supabase OAuth through an OS browser session (PKCE) instead of
// NextAuth's server callback.
// ============================================================

import React from "react";
import { View } from "react-native";
import Svg, { Path } from "react-native-svg";
import { useTheme } from "../../theme";
import { Button, Text } from "../ui/primitives";

function GoogleMark({ size = 18 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        fill="#4285F4"
        d="M23.49 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.47a5.57 5.57 0 0 1-2.4 3.58v3h3.86c2.26-3.09 3.56-7.93 3.56-8.82z"
      />
      <Path
        fill="#34A853"
        d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.86-3c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96H1.29v3.09C3.26 21.3 7.31 24 12 24z"
      />
      <Path
        fill="#FBBC05"
        d="M5.27 14.29c-.25-.72-.38-1.49-.38-2.29s.14-1.57.38-2.29V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.98-3.09z"
      />
      <Path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.98 3.09C6.22 7.49 8.87 5.38 12 5.38z"
      />
    </Svg>
  );
}

export function GoogleButton({
  label,
  onPress,
  disabled,
  loading,
}: {
  label: string;
  onPress?: () => void;
  disabled?: boolean;
  loading?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <Button
      variant="outline"
      size="lg"
      onPress={onPress}
      disabled={disabled}
      loading={loading}
      fullWidth
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        {!loading ? <GoogleMark /> : null}
        <Text variant="label" color={colors.foreground}>
          {label}
        </Text>
      </View>
    </Button>
  );
}
