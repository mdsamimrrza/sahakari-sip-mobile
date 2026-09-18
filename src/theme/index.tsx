// ============================================================
// SahakariSIP — Theme
// ============================================================
// "Bold Ink" design language — neo-brutalist fintech:
//
//   Light → "Paper":   warm bone canvas, white cards, near-black ink,
//                       THICK ink borders + hard ink offset shadows,
//                       electric indigo + teal accents
//   Dark  → "Carbon":  carbon canvas, carbon cards, chalk-white ink,
//                       gray borders + dark offset shadows,
//                       vivid violet + teal accents
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
  /** Hard offset-shadow color (Bold Ink design — solid, no blur). */
  cardShadow: string;
}

export const lightColors: ThemeColors = {
  background: "#F4F1E8", // warm bone paper
  foreground: "#141414", // near-black ink
  card: "#FFFFFF",
  cardForeground: "#141414",
  primary: "#5A54F9", // electric indigo
  primaryForeground: "#FFFFFF",
  secondary: "#0FB5A6", // vivid teal
  secondaryForeground: "#FFFFFF",
  muted: "#E9E6DC",
  mutedForeground: "#565656",
  accent: "#0FB5A6",
  accentForeground: "#FFFFFF",
  destructive: "#F04452",
  destructiveForeground: "#FFFFFF",
  border: "#141414", // THICK ink borders everywhere — the Bold Ink signature
  input: "#FFFFFF",
  ring: "#141414",

  chartPrimary: "#5A54F9",
  chartPositive: "#12B981",
  chartNegative: "#F04452",
  chartInvested: "#9B978C",
  chartFeeDrag: "#F97362",
  chartGrid: "#DAD6C8",
  chartText: "#565656",

  success: "#12B981",
  warning: "#F59E0B",
  info: "#3E8BFF",
  blue: "#3E8BFF",
  purple: "#8B5CF6",
  amber: "#F59E0B",
  rose: "#F04452",
  emerald: "#12B981",
  overlay: "rgba(20, 20, 20, 0.5)",
  skeleton: "#E9E6DC",
  cardShadow: "#141414", // hard ink offset shadow
};

export const darkColors: ThemeColors = {
  background: "#131318", // carbon
  foreground: "#F2F2F7", // chalk white
  card: "#1C1C24", // carbon cards
  cardForeground: "#F2F2F7",
  primary: "#7C74FF", // vivid violet
  primaryForeground: "#131318",
  secondary: "#22D3C5", // bright teal
  secondaryForeground: "#131318",
  muted: "#262632",
  mutedForeground: "#A3A3B2",
  accent: "#22D3C5",
  accentForeground: "#131318",
  destructive: "#FF5C68",
  destructiveForeground: "#131318",
  border: "#3D3D4A", // visible chalk-gray borders in dark
  input: "#1C1C24",
  ring: "#F2F2F7",

  chartPrimary: "#7C74FF",
  chartPositive: "#22D3C5",
  chartNegative: "#FF5C68",
  chartInvested: "#3C3C4C",
  chartFeeDrag: "#FF7A6B",
  chartGrid: "#262632",
  chartText: "#F2F2F7",

  success: "#22D3C5",
  warning: "#FBBF24",
  info: "#5CA1FF",
  blue: "#5CA1FF",
  purple: "#A78BFA",
  amber: "#FBBF24",
  rose: "#FF5C68",
  emerald: "#22D3C5",
  overlay: "rgba(0, 0, 0, 0.65)",
  skeleton: "#262632",
  cardShadow: "#08080C", // darker-than-canvas offset shadow
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

// Chunky, tighter geometry — medium radii that let the hard shadows read.
export const radius = {
  sm: 4,
  md: 8,
  lg: 10,
  xl: 12,
  xxl: 14,
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
