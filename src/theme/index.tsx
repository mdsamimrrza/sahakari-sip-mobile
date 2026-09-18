// ============================================================
// SahakariSIP — Theme
// ============================================================
// Direct translation of the web app's CSS custom properties
// (src/app/globals.css) into React Native tokens.
//
//   Light → "Royal Cream & Navy":  cream canvas, white cards, navy ink,
//                                   gold accents
//   Dark  → "Royal Navy & Gold":   navy canvas, navy cards, cream ink,
//                                   bright gold accents
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
  background: "#F7F3E9", // cream
  foreground: "#0D1B2A", // very dark navy
  card: "#FFFFFF",
  cardForeground: "#0D1B2A",
  primary: "#0D1B2A", // navy buttons
  primaryForeground: "#D4AF37", // gold text on navy
  secondary: "#D4AF37", // gold
  secondaryForeground: "#0D1B2A",
  muted: "#E0DCD1",
  mutedForeground: "#415A77",
  accent: "#D4AF37",
  accentForeground: "#0D1B2A",
  destructive: "#EF4444",
  destructiveForeground: "#FFFFFF",
  border: "#E0DCD1",
  input: "#FFFFFF",
  ring: "#0D1B2A",

  chartPrimary: "#0D1B2A",
  chartPositive: "#10B77F",
  chartNegative: "#E21D48",
  chartInvested: "#D4AF37",
  chartFeeDrag: "#E21D48",
  chartGrid: "#E0DCD1",
  chartText: "#415A77",

  success: "#10B77F",
  warning: "#F59E0B",
  info: "#3B82F6",
  blue: "#2563EB",
  purple: "#8B5CF6",
  amber: "#F59E0B",
  rose: "#E21D48",
  emerald: "#10B77F",
  overlay: "rgba(13, 27, 42, 0.45)",
  skeleton: "#E7E2D6",
};

export const darkColors: ThemeColors = {
  background: "#0D1B2A", // very dark navy
  foreground: "#F7F3E9", // cream
  card: "#1B263B", // dark navy cards
  cardForeground: "#F7F3E9",
  primary: "#EBC547", // bright gold so buttons pop
  primaryForeground: "#0D1B2A",
  secondary: "#415A77", // slate navy
  secondaryForeground: "#F7F3E9",
  muted: "#1B263B",
  mutedForeground: "#B8C4D6", // lighter for dark-mode readability
  accent: "#415A77",
  accentForeground: "#D4AF37",
  destructive: "#DC2626",
  destructiveForeground: "#FFFFFF",
  border: "#2C3E5C",
  input: "#1B263B",
  ring: "#D4AF37",

  chartPrimary: "#D4AF37",
  chartPositive: "#10B77F",
  chartNegative: "#F43F5E",
  chartInvested: "#415A77",
  chartFeeDrag: "#F43F5E",
  chartGrid: "#2C3E5C",
  chartText: "#F7F3E9",

  success: "#10B77F",
  warning: "#F59E0B",
  info: "#60A5FA",
  blue: "#3B82F6",
  purple: "#A78BFA",
  amber: "#FBBF24",
  rose: "#F43F5E",
  emerald: "#10B77F",
  overlay: "rgba(0, 0, 0, 0.6)",
  skeleton: "#243149",
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

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
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
