// ============================================================
// SahakariSIP — Theme
// ============================================================
// "Editorial Ledger" design language — a printed-ledger fintech:
//
//   Light → "Paper":  warm paper canvas, white cards, green-black ink,
//                      hairline rules, sharp corners, serif display type,
//                      ledger green + copper accents, NO shadows at all
//   Dark  → "Night":  green-black canvas, raised ink cards, chalk text,
//                      sage + copper accents, same hairline geometry
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
  background: "#F6F4EE", // warm paper
  foreground: "#16211B", // green-black ink
  card: "#FFFFFF",
  cardForeground: "#16211B",
  primary: "#1E6B48", // ledger green
  primaryForeground: "#FFFFFF",
  secondary: "#B4530A", // burnt copper
  secondaryForeground: "#FFFFFF",
  muted: "#ECE9E0",
  mutedForeground: "#5C6660",
  accent: "#B4530A",
  accentForeground: "#FFFFFF",
  destructive: "#B3261E",
  destructiveForeground: "#FFFFFF",
  border: "#D8D3C6", // hairline rule
  input: "#FFFFFF",
  ring: "#1E6B48",

  chartPrimary: "#1E6B48",
  chartPositive: "#2E7D5B",
  chartNegative: "#B3261E",
  chartInvested: "#A8A296",
  chartFeeDrag: "#C2620A",
  chartGrid: "#E4E0D4",
  chartText: "#5C6660",

  success: "#2E7D5B",
  warning: "#B4530A",
  info: "#1D4ED8",
  blue: "#1D4ED8",
  purple: "#6D28D9",
  amber: "#B4530A",
  rose: "#B3261E",
  emerald: "#2E7D5B",
  overlay: "rgba(22, 33, 27, 0.45)",
  skeleton: "#ECE9E0",
};

export const darkColors: ThemeColors = {
  background: "#101512", // green-black night
  foreground: "#EDEBE3", // chalk
  card: "#18201B", // raised ink card
  cardForeground: "#EDEBE3",
  primary: "#6FBF8F", // sage
  primaryForeground: "#101512",
  secondary: "#D99A4E", // copper light
  secondaryForeground: "#101512",
  muted: "#202A23",
  mutedForeground: "#9AA69D",
  accent: "#D99A4E",
  accentForeground: "#101512",
  destructive: "#E07A6F",
  destructiveForeground: "#101512",
  border: "#2C362E", // hairline rule
  input: "#18201B",
  ring: "#6FBF8F",

  chartPrimary: "#6FBF8F",
  chartPositive: "#6FBF8F",
  chartNegative: "#E07A6F",
  chartInvested: "#3A453C",
  chartFeeDrag: "#D99A4E",
  chartGrid: "#202A23",
  chartText: "#EDEBE3",

  success: "#6FBF8F",
  warning: "#D99A4E",
  info: "#7FA8E8",
  blue: "#7FA8E8",
  purple: "#A78BFA",
  amber: "#D99A4E",
  rose: "#E07A6F",
  emerald: "#6FBF8F",
  overlay: "rgba(0, 0, 0, 0.6)",
  skeleton: "#202A23",
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

// Sharp, printed geometry — tight radii, no pills, no shadows.
export const radius = {
  sm: 2,
  md: 4,
  lg: 6,
  xl: 8,
  xxl: 10,
} as const;

// Display faces are serif (the ledger's headline voice); body stays sans.
export const fontFamily = {
  display: "serif",
} as const;

// Type scale — editorial proportions: large serif headlines, small
// letter-spaced caps for labels, tabular numerals for every figure.
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
