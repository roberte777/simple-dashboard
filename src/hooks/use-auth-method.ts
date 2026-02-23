"use client";

import { useState, useCallback, useEffect } from "react";
import type { AuthMethod } from "@/lib/types";

const STORAGE_KEY = "gh-dash-auth-method";

interface UseAuthMethodResult {
  authMethod: AuthMethod;
  setAuthMethod: (method: AuthMethod) => void;
  patAvailable: boolean;
  patError: string | null;
}

export function useAuthMethod(): UseAuthMethodResult {
  const [authMethod, setAuthMethodState] = useState<AuthMethod>("oauth");
  const [patError, setPatError] = useState<string | null>(null);

  const patAvailable = Boolean(process.env.NEXT_PUBLIC_PAT);

  // Initialize from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY) as AuthMethod | null;
    if (stored === "pat") {
      if (patAvailable) {
        setAuthMethodState("pat");
      } else {
        // PAT was previously selected but env var is no longer set
        localStorage.setItem(STORAGE_KEY, "oauth");
        setPatError(
          "PAT is no longer configured. Falling back to OAuth."
        );
      }
    }
  }, [patAvailable]);

  const setAuthMethod = useCallback(
    (method: AuthMethod) => {
      if (method === "pat" && !patAvailable) {
        setPatError(
          "NEXT_PUBLIC_PAT environment variable is not set. Cannot use PAT mode."
        );
        return;
      }
      setPatError(null);
      setAuthMethodState(method);
      localStorage.setItem(STORAGE_KEY, method);
    },
    [patAvailable]
  );

  return { authMethod, setAuthMethod, patAvailable, patError };
}
