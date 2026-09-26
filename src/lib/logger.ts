// ============================================================
// SahakariSIP — Diagnostics logger (release-build friendly)
// ============================================================
// console.* is stripped from production bundles by babel-preset-expo,
// so this logger keeps an in-memory ring buffer (persisted to
// AsyncStorage) that survives navigation and can be read from
// Settings → More → Diagnostics. Not for sensitive data.
// ============================================================

import AsyncStorage from "@react-native-async-storage/async-storage";

const KEY = "sahakarisip.v1.diagnostics";
const MAX_LINES = 150;

let buffer: string[] | null = null;

function safeStringify(value: unknown): string {
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, (_k, v) =>
      v instanceof Date ? v.toISOString() : v
    );
  } catch {
    return String(value);
  }
}

export function log(tag: string, detail?: unknown): void {
  const line = `${new Date().toISOString().slice(11, 23)} [${tag}]${
    detail === undefined ? "" : " " + safeStringify(detail)
  }`;
  (buffer ??= []).push(line);
  if (buffer.length > MAX_LINES) buffer.splice(0, buffer.length - MAX_LINES);
  void AsyncStorage.setItem(KEY, JSON.stringify(buffer)).catch(() => {});
}

export async function getLogs(): Promise<string[]> {
  if (!buffer) {
    try {
      buffer = JSON.parse((await AsyncStorage.getItem(KEY)) ?? "[]") as string[];
    } catch {
      buffer = [];
    }
  }
  return buffer ?? [];
}

export async function clearLogs(): Promise<void> {
  buffer = [];
  await AsyncStorage.setItem(KEY, "[]").catch(() => {});
}
