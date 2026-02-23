"use client";

import { useState, useCallback, useEffect } from "react";

export type ViewMode = "unified" | "split";

const STORAGE_KEY = "gh-dash-view-mode";

export function useViewMode() {
  const [viewMode, setViewModeState] = useState<ViewMode>("unified");

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY) as ViewMode | null;
    if (stored === "split" || stored === "unified") {
      setViewModeState(stored);
    }
  }, []);

  const setViewMode = useCallback((mode: ViewMode) => {
    setViewModeState(mode);
    localStorage.setItem(STORAGE_KEY, mode);
  }, []);

  const toggleViewMode = useCallback(() => {
    setViewModeState((prev) => {
      const next = prev === "unified" ? "split" : "unified";
      localStorage.setItem(STORAGE_KEY, next);
      return next;
    });
  }, []);

  return { viewMode, setViewMode, toggleViewMode };
}
