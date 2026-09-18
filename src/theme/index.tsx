// ============================================================
// SahakariSIP — Theme
// ============================================================
// "Iris" design language — a modern fintech identity:
//
//   Light → "Porcelain":  cool porcelain canvas, white cards,
//                          indigo ink, electric indigo + teal accents
//   Dark  → "Ink":        near-black ink canvas, ink cards,
//                          lavender-white ink, soft violet + teal accents
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
  background: "#F4F4F8", // cool porcelain
  foreground: "#16162A", // deep indigo ink
  card: "#FFFFFF",
  cardForeground: "#16162A",
  primary: "#5A54F9", // electric indigo
  primaryForeground: "#FFFFFF",
  secondary: "#0FB5A6", // teal
  secondaryForeground: "#FFFFFF",
  muted: "#E9E8F2",
  mutedForeground: "#5D5D78",
  accent: "#0FB5A6",
  accentForeground: "#FFFFFF",
  destructive: "#F04452",
  destructiveForeground: "#FFFFFF",
  border: "#E3E3EE",
  input: "#FFFFFF",
  ring: "#5A54F9",

  chartPrimary: "#5A54F9",
  chartPositive: "#12B981",
  chartNegative: "#F04452",
  chartInvested: "#A3A8C2",
  chartFeeDrag: "#F97362",
  chartGrid: "#E7E7F0",
  chartText: "#5D5D78",

  success: "#12B981",
  warning: "#F59E0B",
  info: "#3E8BFF",
  blue: "#3E8BFF",
  purple: "#8B5CF6",
  amber: "#F59E0B",
  rose: "#F04452",
  emerald: "#12B981",
  overlay: "rgba(22, 22, 42, 0.5)",
  skeleton: "#E9E8F2",
};

export const darkColors: ThemeColors = {
  background: "#101019", // near-black ink
  foreground: "#EDEDF7", // lavender white
  card: "#191926", // ink cards
  cardForeground: "#EDEDF7",
  primary: "#8E86FF", // soft violet
  primaryForeground: "#101019",
  secondary: "#2DD4BF", // bright teal
  secondaryForeground: "#101019",
  muted: "#22223A",
  mutedForeground: "#9FA2BC",
  accent: "#2DD4BF",
  accentForeground: "#101019",
  destructive: "#FF5C68",
  destructiveForeground: "#101019",
  border: "#272741",
  input: "#191926",
  ring: "#8E86FF",

  chartPrimary: "#8E86FF",
  chartPositive: "#2DD4BF",
  chartNegative: "#FF5C68",
  chartInvested: "#3C3C5C",
  chartFeeDrag: "#FF7A6B",
  chartGrid: "#272741",
  chartText: "#EDEDF7",

  success: "#2DD4BF",
  warning: "#FBBF24",
  info: "#5CA1FF",
  blue: "#5CA1FF",
  purple: "#A78BFA",
  amber: "#FBBF24",
  rose: "#FF5C68",
  emerald: "#2DD4BF",
  overlay: "rgba(0, 0, 0, 0.65)",
  skeleton: "#22223A",
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

// Sharper, tighter geometry than the previous rounded look.
export const radius = {
  sm: 6,
  md: 10,
  lg: 14,
  xl: 18,
  xxl: 20,
  pill: 999,
} as const;

// Type scale — matches the web app's proportions (body 14 / captions 12–13 /
// titles 24) with a slight bump for phone readability.
export const fontSize = {
  xs: 12,
  sm: 13,
  base: 14,
  md: 15,
  lg: 17,
  xl: 19,
  xxl: 24,
  xxxl: 30,
  display: 34,
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
