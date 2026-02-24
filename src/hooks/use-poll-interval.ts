"use client";

import { useCallback } from "react";
import { useUser } from "@clerk/nextjs";

export const POLL_INTERVAL_OPTIONS = [
  { value: 30_000, label: "30s" },
  { value: 60_000, label: "1m" },
  { value: 120_000, label: "2m" },
  { value: 300_000, label: "5m" },
] as const;

const DEFAULT_POLL_INTERVAL = 60_000;

export function usePollInterval() {
  const { user } = useUser();

  const stored = (user?.unsafeMetadata as { pollIntervalMs?: number } | undefined)
    ?.pollIntervalMs;
  const pollInterval =
    typeof stored === "number" &&
    POLL_INTERVAL_OPTIONS.some((o) => o.value === stored)
      ? stored
      : DEFAULT_POLL_INTERVAL;

  const setPollInterval = useCallback(
    async (ms: number) => {
      if (!user) return;
      await user.update({
        unsafeMetadata: { ...user.unsafeMetadata, pollIntervalMs: ms },
      });
    },
    [user]
  );

  return { pollInterval, setPollInterval } as const;
}
