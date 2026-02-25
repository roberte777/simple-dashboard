import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Dashboard } from "@/components/Dashboard";
import { PatSetup } from "@/components/PatSetup";
import type { AppConfig } from "@/lib/types";

export default function App() {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    invoke<AppConfig>("get_config")
      .then((cfg) => {
        setConfig(cfg);
        setLoading(false);
      })
      .catch((err) => {
        console.error("Failed to load config:", err);
        setLoading(false);
      });
  }, []);

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <p className="text-muted-foreground">Loading...</p>
      </main>
    );
  }

  if (!config?.github_pat) {
    return (
      <main className="min-h-screen">
        <PatSetup onComplete={(cfg) => setConfig(cfg)} />
      </main>
    );
  }

  return (
    <main className="min-h-screen">
      <Dashboard pat={config.github_pat} initialPollIntervalMs={config.poll_interval_ms} />
    </main>
  );
}
