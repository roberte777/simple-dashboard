import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Github, Key, ExternalLink } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import type { AppConfig } from "@/lib/types";

interface GitHubUser {
  login: string;
  avatar_url: string;
  id: number;
}

interface PatSetupProps {
  onComplete: (config: AppConfig) => void;
}

export function PatSetup({ onComplete }: PatSetupProps) {
  const [pat, setPat] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [validating, setValidating] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setValidating(true);

    try {
      await invoke<GitHubUser>("validate_pat", { pat });
      const config = await invoke<AppConfig>("save_pat", { pat });
      onComplete(config);
    } catch (err) {
      const message = typeof err === "string" ? err : String(err);
      setError(message);
      setValidating(false);
    }
  };

  return (
    <div className="flex min-h-[80vh] flex-col items-center justify-center px-4">
      <div className="flex flex-col items-center gap-6 text-center max-w-md">
        <Github className="h-16 w-16" />
        <h1 className="text-4xl font-bold tracking-tight">GH Dash</h1>
        <p className="text-lg text-muted-foreground">
          See whose turn it is on every PR. Enter your GitHub Personal Access
          Token to get started.
        </p>
        <Card className="w-full">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Key className="h-4 w-4" />
              <span className="font-medium">GitHub Personal Access Token</span>
            </div>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <input
                type="password"
                value={pat}
                onChange={(e) => setPat(e.target.value)}
                placeholder="ghp_..."
                className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
              <p className="text-xs text-muted-foreground">
                Required scopes: <code>repo</code>, <code>read:org</code>.{" "}
                <a
                  href="https://github.com/settings/tokens/new?scopes=repo,read:org"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline inline-flex items-center gap-1"
                >
                  Create a token <ExternalLink className="h-3 w-3" />
                </a>
              </p>
              {error && (
                <p className="text-sm text-destructive">{error}</p>
              )}
              <button
                type="submit"
                disabled={!pat.trim() || validating}
                className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                {validating ? "Validating..." : "Save & Continue"}
              </button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
