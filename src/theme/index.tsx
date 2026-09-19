// ============================================================
// SahakariSIP — Theme
// ============================================================
//
//   Light → "Parchment": warm parchment paper (#EDEAE0), paper-raised
//                      cards (#F7F5EC), deep teal ink-accent (#147A64),
//                      brass (#A8791F) for highlights, rust (#A5442B)
//                      for destructive notes, ink text (#17241F)
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
  // Warm parchment paper — see the palette table in the design notes.
  background: "#EDEAE0",
  foreground: "#17241F", // primary ink (near-black green)
  card: "#F7F5EC", // paper-raised card surface
  cardForeground: "#17241F",
  primary: "#147A64", // deep teal — active states, progress, chart line
  primaryForeground: "#FFFFFF",
  secondary: "#A8791F", // brass — highlights, badge percentages
  secondaryForeground: "#FFFFFF",
  muted: "#E5E2D6", // elevated parchment (tinted chips, icon wells)
  mutedForeground: "#4B5C55", // soft ink
  accent: "#A8791F", // brass accent
  accentForeground: "#FFFFFF",
  destructive: "#A5442B", // rust — alerts, destructive actions
  destructiveForeground: "#FFFFFF",
  border: "#CFCABA", // rule lines and dividers
  input: "#F7F5EC", // paper-raised input background
  ring: "#147A64",

  chartPrimary: "#147A64",
  chartPositive: "#047857", // deep emerald — income
  chartNegative: "#A5442B", // rust — outflow
  chartInvested: "#8B978F", // faint ink
  chartFeeDrag: "#A8791F", // brass
  chartGrid: "#CFCABA",
  chartText: "#4B5C55",

  success: "#147A64", // teal (same as primary, per palette)
  warning: "#A8791F", // brass (same as accent)
  info: "#2A6F86", // deep aqua/slate
  blue: "#2A6F86",
  purple: "#7C3AED", // not in the palette — kept for existing chips
  amber: "#A8791F", // brass
  rose: "#A5442B", // rust
  emerald: "#047857", // income green
  overlay: "rgba(23, 36, 31, 0.5)",
  skeleton: "#E5E2D6",
};

export const darkColors: ThemeColors = {
  // Deep slate night — indigo primary, emerald income, amber brass-shift.
  background: "#0B0F19",
  foreground: "#F8FAFC", // near-white primary text
  card: "#151D2A", // dark card surface
  cardForeground: "#F8FAFC",
  primary: "#818CF8", // indigo — active states, progress, chart line
  primaryForeground: "#0B0F19", // dark ink on light indigo
  secondary: "#8B5CF6", // violet accent
  secondaryForeground: "#FFFFFF",
  muted: "#1E293B", // elevated dark surface (chips, icon wells)
  mutedForeground: "#94A3B8", // muted slate
  accent: "#8B5CF6", // violet
  accentForeground: "#FFFFFF",
  destructive: "#EF4444", // red — alerts, destructive actions
  destructiveForeground: "#FFFFFF",
  border: "#273549", // rule lines and dividers
  input: "#151D2A",
  ring: "#818CF8",

  chartPrimary: "#818CF8",
  chartPositive: "#10B981", // bright emerald — income
  chartNegative: "#EF4444",
  chartInvested: "#64748B", // faint slate
  chartFeeDrag: "#F59E0B", // amber (brass-shifted)
  chartGrid: "#273549",
  chartText: "#94A3B8",

  success: "#10B981",
  warning: "#F59E0B",
  info: "#0EA5E9", // sky blue
  blue: "#0EA5E9",
  purple: "#8B5CF6", // violet
  amber: "#F59E0B",
  rose: "#EF4444",
  emerald: "#10B981",
  overlay: "rgba(0, 0, 0, 0.75)",
  skeleton: "#1E293B",
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
