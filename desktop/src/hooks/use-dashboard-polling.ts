import { useState, useEffect, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { DashboardResponse } from "@/lib/types";

interface UseDashboardPollingOptions {
  pat: string;
  intervalMs: number;
  enabled?: boolean;
}

interface UseDashboardPollingResult {
  data: DashboardResponse | null;
  error: string | null;
  isLoading: boolean;
  isRefreshing: boolean;
  refresh: () => void;
  lastFetchedAt: Date | null;
}

export function useDashboardPolling({
  pat,
  intervalMs,
  enabled = true,
}: UseDashboardPollingOptions): UseDashboardPollingResult {
  const [data, setData] = useState<DashboardResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastFetchedAt, setLastFetchedAt] = useState<Date | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isFirstFetch = useRef(true);

  const fetchData = useCallback(async () => {
    if (isFirstFetch.current) {
      setIsLoading(true);
    } else {
      setIsRefreshing(true);
    }

    try {
      const result = await invoke<DashboardResponse>("fetch_dashboard", { pat });
      setData(result);
      setError(null);
      setLastFetchedAt(new Date());
    } catch (err) {
      const message = typeof err === "string" ? err : String(err);
      setError(message);
      if (isFirstFetch.current) {
        setData(null);
      }
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
      isFirstFetch.current = false;
    }
  }, [pat]);

  const startPolling = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }
    intervalRef.current = setInterval(fetchData, intervalMs);
  }, [fetchData, intervalMs]);

  const stopPolling = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const refresh = useCallback(() => {
    fetchData();
    if (enabled) {
      startPolling();
    }
  }, [fetchData, startPolling, enabled]);

  // Initial fetch + start polling
  useEffect(() => {
    fetchData();
    if (enabled) {
      startPolling();
    }
    return stopPolling;
  }, [fetchData, startPolling, stopPolling, enabled]);

  // Pause polling when window is hidden, resume when visible
  useEffect(() => {
    if (!enabled) return;

    const handleVisibilityChange = () => {
      if (document.hidden) {
        stopPolling();
      } else {
        fetchData();
        startPolling();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [enabled, fetchData, startPolling, stopPolling]);

  return { data, error, isLoading, isRefreshing, refresh, lastFetchedAt };
}
