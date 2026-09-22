// ============================================================
// SahakariSIP — Privacy Mode Context
// ============================================================
// Toggles masking of sensitive financial amounts (e.g. NPR ••••••)
// across the entire mobile application. Persisted via AsyncStorage.
// ============================================================

import React, { createContext, useContext, useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

const PRIVACY_KEY = "@sahakarisip_privacy_mode";

interface PrivacyContextType {
  isPrivate: boolean;
  togglePrivacy: () => void;
  formatPrivate: (valueText: string, customMask?: string) => string;
}

const PrivacyContext = createContext<PrivacyContextType>({
  isPrivate: false,
  togglePrivacy: () => {},
  formatPrivate: (v) => v,
});

export function PrivacyProvider({ children }: { children: React.ReactNode }) {
  const [isPrivate, setIsPrivate] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(PRIVACY_KEY)
      .then((val) => {
        if (val === "true") setIsPrivate(true);
      })
      .catch(() => {});
  }, []);

  const togglePrivacy = () => {
    setIsPrivate((prev) => {
      const next = !prev;
      AsyncStorage.setItem(PRIVACY_KEY, String(next)).catch(() => {});
      return next;
    });
  };

  const formatPrivate = (valueText: string, customMask = "••••••"): string => {
    if (!isPrivate) return valueText;
    if (valueText.startsWith("NPR ")) {
      return "NPR " + customMask;
    }
    if (valueText.startsWith("+NPR ")) {
      return "+NPR " + customMask;
    }
    if (valueText.startsWith("-NPR ")) {
      return "-NPR " + customMask;
    }
    return customMask;
  };

  return (
    <PrivacyContext.Provider value={{ isPrivate, togglePrivacy, formatPrivate }}>
      {children}
    </PrivacyContext.Provider>
  );
}

export function usePrivacy() {
  return useContext(PrivacyContext);
}
