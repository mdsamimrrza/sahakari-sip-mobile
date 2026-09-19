// ============================================================
// SahakariSIP — Shared Utilities
// ============================================================

/** Minimal classnames joiner (the web app uses clsx + tailwind-merge). */
export function cn(
  ...classes: Array<string | false | null | undefined>
): string {
  return classes.filter(Boolean).join(" ");
}

/** Clamp a number between min and max. */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/** Round to a fixed number of decimals without float noise. */
export function round(value: number, decimals = 2): number {
  const f = Math.pow(10, decimals);
  return Math.round(value * f) / f;
}

// expo-crypto is a native module — resolve it lazily so plain-Node scripts
// (e.g. _verify/verify.test.ts) can still import this module.
let cryptoUuid: (() => string) | null | undefined;
function platformUuid(): string | null {
  if (cryptoUuid === undefined) {
    try {
      cryptoUuid = require("expo-crypto").randomUUID ?? null;
    } catch {
      cryptoUuid = null;
    }
  }
  return cryptoUuid ? cryptoUuid() : null;
}

/** UUID v4 from the platform CSPRNG (used for ids and password salts). */
export function uuid(): string {
  const native = platformUuid();
  if (native) return native;
  // Non-native fallback (Node scripts). Never used for secrets in the app.
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/** Safe number coercion — mirrors the web app's `Number(x)` usage. */
export function num(value: unknown, fallback = 0): number {
  const n = Number(value);
  return isNaN(n) || !isFinite(n) ? fallback : n;
}

/** Codes/nicknames sometimes stored as fund names → full display names. */
const FUND_NAME_ALIASES: Record<string, string> = {
  NMBSBFE: "NMB Saral Bachat Fund-E",
  NIBLSF: "NIBL Sahabhagita Fund",
};

/** Always show the full fund name — resolve stored codes to real names. */
export function formatFundShortName(name: string): string {
  if (!name) return "";
  return FUND_NAME_ALIASES[name.trim().toUpperCase()] ?? name;
}

/** Capitalize the first letter (avatar initials). */
export function initialOf(value?: string | null): string {
  if (!value) return "S";
  const trimmed = value.trim();
  return trimmed ? trimmed[0].toUpperCase() : "S";
}
