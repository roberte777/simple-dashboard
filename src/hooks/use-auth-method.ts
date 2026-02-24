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
  const [patAvailable, setPatAvailable] = useState(false);
  const [patError, setPatError] = useState<string | null>(null);

  // Fetch PAT availability from server
  useEffect(() => {
    fetch("/api/auth-method")
      .then((res) => res.json())
      .then((data: { patAvailable: boolean }) => {
        setPatAvailable(data.patAvailable);

        // Initialize from localStorage once we know PAT status
        const stored = localStorage.getItem(STORAGE_KEY) as AuthMethod | null;
        if (stored === "pat") {
          if (data.patAvailable) {
            setAuthMethodState("pat");
          } else {
            localStorage.setItem(STORAGE_KEY, "oauth");
            setPatError(
              "PAT is no longer configured. Falling back to OAuth."
            );
          }
        }
      })
      .catch(() => {
        // If the endpoint fails, default to OAuth
      });
  }, []);

  const setAuthMethod = useCallback(
    (method: AuthMethod) => {
      if (method === "pat" && !patAvailable) {
        setPatError(
          "GITHUB_PAT environment variable is not set. Cannot use PAT mode."
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
