// ============================================================
// SahakariSIP — Data hooks
// ============================================================
// Thin wrappers around the active DataStore. Each hook reloads whenever
// the screen regains focus, which is the mobile equivalent of the web
// app's `router.refresh()` after every mutation.
// ============================================================

import { useCallback, useEffect, useRef, useState } from "react";
import { useFocusEffect } from "expo-router";
import { useAuth } from "../lib/auth/AuthContext";
import type { DashboardData, FundConfig, Entry } from "../lib/types";

export function useDashboard(fundId: string = "all") {
  const { store } = useAuth();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Stale-while-revalidate: keep last data visible on refocus instead of
  // flashing the skeleton on every tab switch.
  const dataRef = useRef<DashboardData | null>(null);
  useEffect(() => {
    dataRef.current = data;
  }, [data]);

  const reload = useCallback(async () => {
    if (!store) {
      setLoading(false);
      return;
    }
    let res: Awaited<ReturnType<typeof store.getDashboardData>>;
    try {
      res = await store.getDashboardData(fundId);
    } catch (e) {
      res = {
        success: false,
        error: e instanceof Error ? `${e.name}: ${e.message}` : String(e),
      };
    }
    if (res.success && res.data) {
      setData(res.data);
      setError(null);
    } else {
      setError(res.error ?? "Failed to load dashboard");
    }
    setLoading(false);
  }, [store, fundId]);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      if (!dataRef.current) setLoading(true);
      (async () => {
        if (!store) return;
        let res: Awaited<ReturnType<typeof store.getDashboardData>>;
        try {
          res = await store.getDashboardData(fundId);
        } catch (e) {
          res = {
            success: false,
            error: e instanceof Error ? `${e.name}: ${e.message}` : String(e),
          };
        }
        if (!active) return;
        if (res.success && res.data) {
          setData(res.data);
          setError(null);
        } else {
          setError(res.error ?? "Failed to load dashboard");
        }
        setLoading(false);
      })();
      return () => {
        active = false;
      };
    }, [store, fundId])
  );

  return { data, loading, error, reload };
}

export function useFunds() {
  const { store } = useAuth();
  const [funds, setFunds] = useState<FundConfig[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    if (!store) {
      setLoading(false);
      return;
    }
    const res = await store.getFundConfigs();
    if (res.success && res.data) setFunds(res.data);
    setLoading(false);
  }, [store]);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      (async () => {
        if (!store) return;
        const res = await store.getFundConfigs();
        if (active && res.success && res.data) setFunds(res.data);
        if (active) setLoading(false);
      })();
      return () => {
        active = false;
      };
    }, [store])
  );

  return { funds, loading, reload };
}

export function useEntries(fundId: string = "all") {
  const { store } = useAuth();
  const [entries, setEntries] = useState<Entry[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    if (!store) {
      setLoading(false);
      return;
    }
    const res = await store.getEntries({
      fundId: fundId !== "all" ? fundId : undefined,
      pageSize: 500, // full history, same as the web app's history page
    });
    if (res.success && res.data) {
      setEntries(res.data.entries);
      setTotal(res.data.total);
    }
    setLoading(false);
  }, [store, fundId]);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      (async () => {
        if (!store) return;
        const res = await store.getEntries({
          fundId: fundId !== "all" ? fundId : undefined,
          pageSize: 500,
        });
        if (!active) return;
        if (res.success && res.data) {
          setEntries(res.data.entries);
          setTotal(res.data.total);
        }
        setLoading(false);
      })();
      return () => {
        active = false;
      };
    }, [store, fundId])
  );

  return { entries, total, loading, reload };
}
