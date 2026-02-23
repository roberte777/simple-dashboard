"use client";

import { useState, useEffect, useCallback, useRef } from "react";

interface UsePollingOptions {
  url: string;
  intervalMs: number;
}

interface UsePollingResult<T> {
  data: T | null;
  error: string | null;
  isLoading: boolean;
  isRefreshing: boolean;
  refresh: () => void;
  lastFetchedAt: Date | null;
}

export function usePolling<T>({
  url,
  intervalMs,
}: UsePollingOptions): UsePollingResult<T> {
  const [data, setData] = useState<T | null>(null);
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
      const res = await fetch(url);
      const json = await res.json();

      if (!res.ok) {
        setError(json.error ?? "An error occurred");
        // Keep stale data visible on subsequent errors
        if (isFirstFetch.current) {
          setData(null);
        }
      } else {
        setData(json as T);
        setError(null);
      }
      setLastFetchedAt(new Date());
    } catch {
      setError("Network error. Please check your connection.");
      if (isFirstFetch.current) {
        setData(null);
      }
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
      isFirstFetch.current = false;
    }
  }, [url]);

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
    // Reset the interval so the next auto-poll is a full interval away
    startPolling();
  }, [fetchData, startPolling]);

  // Reset to fresh loading state when URL changes (e.g. auth method switch)
  useEffect(() => {
    isFirstFetch.current = true;
    setData(null);
    setError(null);
    setIsLoading(true);
  }, [url]);

  // Initial fetch + start polling
  useEffect(() => {
    fetchData();
    startPolling();
    return stopPolling;
  }, [fetchData, startPolling, stopPolling]);

  // Pause polling when tab is hidden, resume when visible
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) {
        stopPolling();
      } else {
        // Immediately fetch when tab becomes visible again
        fetchData();
        startPolling();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [fetchData, startPolling, stopPolling]);

  return { data, error, isLoading, isRefreshing, refresh, lastFetchedAt };
}
