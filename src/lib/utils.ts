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

/** UUID v4 generator that works without the `crypto` polyfill. */
export function uuid(): string {
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

/** Shorten long fund names for compact pills (mirrors web SummaryCards). */
export function formatFundShortName(name: string): string {
  if (!name) return "";
  const lowerName = name.toLowerCase();
  if (lowerName.includes("nibl sahabhagita") || lowerName.includes("nibl saha"))
    return "NIBLSF";
  if (lowerName.includes("nmb saral")) return "NMB Saral";
  const words = name.split(" ");
  if (words.length >= 2 && name.length > 12) {
    return `${words[0]} ${words[1]}`;
  }
  return name;
}

/** Capitalize the first letter (avatar initials). */
export function initialOf(value?: string | null): string {
  if (!value) return "S";
  const trimmed = value.trim();
  return trimmed ? trimmed[0].toUpperCase() : "S";
}
