import { useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";

export const POLL_INTERVAL_OPTIONS = [
  { value: 30_000, label: "30s" },
  { value: 60_000, label: "1m" },
  { value: 120_000, label: "2m" },
  { value: 300_000, label: "5m" },
] as const;

export function usePollInterval(initialInterval: number = 60_000) {
  const [pollInterval, setPollIntervalState] = useState(initialInterval);

  const setPollInterval = useCallback(async (ms: number) => {
    setPollIntervalState(ms);
    try {
      await invoke("save_poll_interval", { intervalMs: ms });
    } catch (err) {
      console.error("Failed to save poll interval:", err);
    }
  }, []);

  return { pollInterval, setPollInterval } as const;
}
