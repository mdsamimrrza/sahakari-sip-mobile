// ============================================================
// SahakariSIP — Store factory
// ============================================================

import { CloudStore } from "./cloud";
import { LocalStore } from "./local";
import type { DataMode, DataStore } from "./store";

export function createStore(mode: DataMode, userId: string): DataStore {
  return mode === "cloud" ? new CloudStore() : new LocalStore(userId);
}

export * from "./store";
export * from "./analytics";
