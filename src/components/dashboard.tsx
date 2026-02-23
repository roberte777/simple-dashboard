"use client";

import { PrSection } from "@/components/pr-section";
import { ErrorMessage } from "@/components/error-message";
import { DashboardSkeleton } from "@/components/dashboard-skeleton";
import { usePolling } from "@/hooks/use-polling";
import { useAuthMethod } from "@/hooks/use-auth-method";
import { AuthMethodSelect } from "@/components/auth-method-select";
import { RefreshCw, CircleAlert, Clock } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import type { DashboardResponse, DashboardPR } from "@/lib/types";

const POLL_INTERVAL = 30_000; // 30 seconds

function timeAgoShort(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 5) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}m ago`;
}

function filterByTurn(prs: DashboardPR[], turn: "my-turn" | "their-turn") {
  return prs.filter((pr) => pr.turnStatus === turn);
}

interface SectionHeaderProps {
  title: string;
  turn: "my-turn" | "their-turn";
  count: number;
}

function SectionHeader({ title, turn, count }: SectionHeaderProps) {
  return (
    <div className="flex items-center gap-2 mb-3">
      {turn === "my-turn" ? (
        <CircleAlert className="h-4 w-4 text-destructive" />
      ) : (
        <Clock className="h-4 w-4 text-muted-foreground" />
      )}
      <h2 className="text-sm font-semibold uppercase tracking-wide">
        {title}
      </h2>
      <span className="text-xs text-muted-foreground">({count})</span>
    </div>
  );
}

export function Dashboard() {
  const { authMethod, setAuthMethod, patAvailable, patError } =
    useAuthMethod();

  const { data, error, isLoading, isRefreshing, refresh, lastFetchedAt } =
    usePolling<DashboardResponse>({
      url: `/api/prs?authMethod=${authMethod}`,
      intervalMs: POLL_INTERVAL,
    });

  const myPrsMyTurn = data ? filterByTurn(data.myPrs, "my-turn") : [];
  const myPrsTheirTurn = data ? filterByTurn(data.myPrs, "their-turn") : [];
  const reviewMyTurn = data
    ? filterByTurn(data.reviewRequests, "my-turn")
    : [];
  const reviewTheirTurn = data
    ? filterByTurn(data.reviewRequests, "their-turn")
    : [];

  const totalMyTurn = myPrsMyTurn.length + reviewMyTurn.length;

  return (
    <div className="w-full max-w-2xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">PR Dashboard</h1>
          {!isLoading && totalMyTurn > 0 && (
            <p className="text-sm text-muted-foreground mt-0.5">
              {totalMyTurn} {totalMyTurn === 1 ? "PR needs" : "PRs need"} your
              attention
            </p>
          )}
        </div>
        <div className="flex items-center gap-3">
          <AuthMethodSelect
            authMethod={authMethod}
            onAuthMethodChange={setAuthMethod}
            patAvailable={patAvailable}
            patError={patError}
          />
          {lastFetchedAt && (
            <span className="text-xs text-muted-foreground">
              Updated {timeAgoShort(lastFetchedAt)}
            </span>
          )}
          <button
            onClick={refresh}
            disabled={isLoading}
            className="p-2 rounded-md hover:bg-accent transition-colors disabled:opacity-50"
            aria-label="Refresh"
          >
            <RefreshCw
              className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`}
            />
          </button>
        </div>
      </div>

      {error && !data && <ErrorMessage error={error} onRetry={refresh} />}

      {error && data && (
        <p className="text-xs text-destructive mb-4">
          Update failed. Showing stale data.
        </p>
      )}

      {isLoading && !data ? (
        <DashboardSkeleton />
      ) : (
        data && (
          <div className="space-y-8">
            {/* My PRs — My Turn */}
            <section>
              <SectionHeader
                title="My PRs — My Turn"
                turn="my-turn"
                count={myPrsMyTurn.length}
              />
              <PrSection
                prs={myPrsMyTurn}
                isLoading={false}
                emptyMessage="Nothing to respond to"
              />
            </section>

            <Separator />

            {/* My PRs — Their Turn */}
            <section>
              <SectionHeader
                title="My PRs — Their Turn"
                turn="their-turn"
                count={myPrsTheirTurn.length}
              />
              <PrSection
                prs={myPrsTheirTurn}
                isLoading={false}
                emptyMessage="No PRs waiting on others"
              />
            </section>

            <Separator />

            {/* Review Requests — My Turn */}
            <section>
              <SectionHeader
                title="Review Requests — My Turn"
                turn="my-turn"
                count={reviewMyTurn.length}
              />
              <PrSection
                prs={reviewMyTurn}
                isLoading={false}
                emptyMessage="No reviews needed from you"
              />
            </section>

            <Separator />

            {/* Review Requests — Their Turn */}
            <section>
              <SectionHeader
                title="Review Requests — Their Turn"
                turn="their-turn"
                count={reviewTheirTurn.length}
              />
              <PrSection
                prs={reviewTheirTurn}
                isLoading={false}
                emptyMessage="No reviews waiting on others"
              />
            </section>
          </div>
        )
      )}
    </div>
  );
}
