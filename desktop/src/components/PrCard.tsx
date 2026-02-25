import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { GitPullRequest } from "lucide-react";
import { TurnDebugPanel } from "@/components/TurnDebugPanel";
import type { DashboardPR } from "@/lib/types";

interface PrCardProps {
  pr: DashboardPR;
  showDebug?: boolean;
}

function timeAgo(dateStr: string): string {
  const seconds = Math.floor(
    (Date.now() - new Date(dateStr).getTime()) / 1000
  );

  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function PrCard({ pr, showDebug }: PrCardProps) {
  return (
    <Card className={pr.isDraft ? "border-dashed opacity-75" : ""}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground font-mono">
            {pr.repo}
          </span>
          <span className="text-xs text-muted-foreground">
            {timeAgo(pr.updatedAt)}
          </span>
        </div>
        <a
          href={pr.url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm font-medium leading-snug hover:underline line-clamp-2"
        >
          <GitPullRequest className="inline h-3.5 w-3.5 mr-1 text-muted-foreground" />
          {pr.title}
          <span className="text-muted-foreground ml-1">#{pr.number}</span>
        </a>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Avatar className="h-5 w-5">
              <AvatarImage src={pr.author.avatarUrl} alt={pr.author.login} />
              <AvatarFallback className="text-[10px]">
                {pr.author.login.slice(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <span className="text-xs text-muted-foreground">
              {pr.author.login}
            </span>
            {pr.isDraft && (
              <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                Draft
              </Badge>
            )}
          </div>
        </div>
        {pr.reviewSummary && (
          <p className="text-xs text-muted-foreground mt-2">
            {pr.reviewSummary}
          </p>
        )}
        {pr.labels.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {pr.labels.map((label) => (
              <span
                key={label.name}
                className="text-[10px] px-1.5 py-0.5 rounded-full border"
                style={{
                  borderColor: `#${label.color}`,
                  color: `#${label.color}`,
                }}
              >
                {label.name}
              </span>
            ))}
          </div>
        )}
        {showDebug && pr.turnDebugInfo && (
          <TurnDebugPanel debugInfo={pr.turnDebugInfo} />
        )}
      </CardContent>
    </Card>
  );
}
