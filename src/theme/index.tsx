// ============================================================
// SahakariSIP — Theme
// ============================================================
// "Terrace" design language — stepped Himalayan fields, where a SIP
// grows row by row:
//
//   Light → "Mist":   cool morning-mist canvas, near-white cards, pine
//                      ink, Nepal crimson + marigold as the only loud
//                      notes, Instrument Serif display over Hanken Grotesk
//   Dark  → "Night":  night-terrace canvas, raised pine cards, shoot-green
//                      + marigold accents, same quiet geometry
// ============================================================

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useColorScheme } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

export interface ThemeColors {
  background: string;
  foreground: string;
  card: string;
  cardForeground: string;
  primary: string;
  primaryForeground: string;
  secondary: string;
  secondaryForeground: string;
  muted: string;
  mutedForeground: string;
  accent: string;
  accentForeground: string;
  destructive: string;
  destructiveForeground: string;
  border: string;
  input: string;
  ring: string;

  // Chart tokens
  chartPrimary: string;
  chartPositive: string;
  chartNegative: string;
  chartInvested: string;
  chartFeeDrag: string;
  chartGrid: string;
  chartText: string;

  // Semantic extras used across the app
  success: string;
  warning: string;
  info: string;
  blue: string;
  purple: string;
  amber: string;
  rose: string;
  emerald: string;
  overlay: string;
  skeleton: string;
}

export const lightColors: ThemeColors = {
  background: "#F4F7F5", // crisp alpine mist with subtle emerald tint
  foreground: "#0F1A15", // deep pine ink
  card: "#FFFFFF",
  cardForeground: "#0F1A15",
  primary: "#059669", // rich energetic emerald green
  primaryForeground: "#FFFFFF",
  secondary: "#D97706", // warm golden amber
  secondaryForeground: "#FFFFFF",
  muted: "#E6ECE8",
  mutedForeground: "#4B5B53",
  accent: "#10B981", // vibrant mint accent
  accentForeground: "#FFFFFF",
  destructive: "#DC2626", // rich crimson
  destructiveForeground: "#FFFFFF",
  border: "#E2E9E4",
  input: "#FFFFFF",
  ring: "#059669",

  chartPrimary: "#059669",
  chartPositive: "#10B981",
  chartNegative: "#DC2626",
  chartInvested: "#64748B",
  chartFeeDrag: "#D97706",
  chartGrid: "#E2E9E4",
  chartText: "#4B5B53",

  success: "#10B981",
  warning: "#F59E0B",
  info: "#2563EB",
  blue: "#2563EB",
  purple: "#7C3AED",
  amber: "#D97706",
  rose: "#E11D48",
  emerald: "#059669",
  overlay: "rgba(15, 26, 21, 0.5)",
  skeleton: "#E2E9E4",
};

export const darkColors: ThemeColors = {
  background: "#070F0B", // deep midnight obsidian emerald
  foreground: "#F0FDF4",
  card: "#101E17", // rich elevated emerald panel
  cardForeground: "#F0FDF4",
  primary: "#10B981", // glowing neon emerald
  primaryForeground: "#042F1E",
  secondary: "#F59E0B", // bright warm gold
  secondaryForeground: "#180E02",
  muted: "#172A20",
  mutedForeground: "#8DA497",
  accent: "#34D399",
  accentForeground: "#042F1E",
  destructive: "#F87171",
  destructiveForeground: "#450A0A",
  border: "#1E3A2B",
  input: "#101E17",
  ring: "#10B981",

  chartPrimary: "#10B981",
  chartPositive: "#34D399",
  chartNegative: "#F87171",
  chartInvested: "#334155",
  chartFeeDrag: "#F59E0B",
  chartGrid: "#172A20",
  chartText: "#F0FDF4",

  success: "#34D399",
  warning: "#FBBF24",
  info: "#60A5FA",
  blue: "#60A5FA",
  purple: "#A78BFA",
  amber: "#F59E0B",
  rose: "#F87171",
  emerald: "#10B981",
  overlay: "rgba(0, 0, 0, 0.75)",
  skeleton: "#172A20",
};

// ---------- Spacing / radius / type scale ----------

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
} as const;

// Modern smooth geometry — rounded squircles & pills, subtle elevation shadows.
export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  full: 9999,
} as const;

// Display faces use Instrument Serif for elegant financial headlines; body uses crisp Hanken Grotesk.
export const fontFamily = {
  display: "InstrumentSerif-Regular",
  body: "HankenGrotesk",
} as const;

// Type scale — rich financial proportions with strong contrast.
export const fontSize = {
  xs: 12,
  sm: 13,
  base: 14,
  md: 15,
  lg: 17,
  xl: 20,
  xxl: 26,
  xxxl: 32,
  display: 38,
} as const;

export type ThemeMode = "light" | "dark" | "system";

const MODE_KEY = "sahakarisip.v1.theme_mode";

interface ThemeContextValue {
  colors: ThemeColors;
  isDark: boolean;
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
  toggle: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const systemScheme = useColorScheme();
  const [mode, setModeState] = useState<ThemeMode>("system");

  useEffect(() => {
    (async () => {
      try {
        const saved = await AsyncStorage.getItem(MODE_KEY);
        if (saved === "light" || saved === "dark" || saved === "system") {
          setModeState(saved);
        }
      } catch {
        // keep the default
      }
    })();
  }, []);

  const setMode = useCallback((next: ThemeMode) => {
    setModeState(next);
    AsyncStorage.setItem(MODE_KEY, next).catch(() => {});
  }, []);

  const isDark =
    mode === "system" ? systemScheme === "dark" : mode === "dark";

  const value = useMemo<ThemeContextValue>(
    () => ({
      colors: isDark ? darkColors : lightColors,
      isDark,
      mode,
      setMode,
      toggle: () => setMode(isDark ? "light" : "dark"),
    }),
    [isDark, mode, setMode]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used inside <ThemeProvider>");
  return ctx;
}
