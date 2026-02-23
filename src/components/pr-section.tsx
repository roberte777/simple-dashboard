import { PrCard } from "@/components/pr-card";
import { DashboardSkeleton } from "@/components/dashboard-skeleton";
import { Inbox } from "lucide-react";
import type { DashboardPR } from "@/lib/types";

interface PrSectionProps {
  prs: DashboardPR[] | undefined;
  isLoading: boolean;
  emptyMessage: string;
}

export function PrSection({ prs, isLoading, emptyMessage }: PrSectionProps) {
  if (isLoading && !prs) {
    return <DashboardSkeleton />;
  }

  if (!prs || prs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
        <Inbox className="h-10 w-10 mb-3" />
        <p className="text-sm">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {prs.map((pr) => (
        <PrCard key={pr.id} pr={pr} />
      ))}
    </div>
  );
}
