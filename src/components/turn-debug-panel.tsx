import { CircleAlert, Clock, SkipForward, ArrowRight } from "lucide-react";
import type { TurnDebugInfo } from "@/lib/types";

interface TurnDebugPanelProps {
  debugInfo: TurnDebugInfo;
}

export function TurnDebugPanel({ debugInfo }: TurnDebugPanelProps) {
  return (
    <div className="mt-2 rounded-md border border-dashed border-muted-foreground/40 bg-muted/30 p-2 text-xs space-y-1.5">
      <div className="flex items-center gap-1.5 text-muted-foreground font-medium">
        <span>Turn logic ({debugInfo.section})</span>
      </div>
      {debugInfo.checks.map((check) => {
        const isDeciding = check.label === debugInfo.decidingCheck;
        return (
          <div
            key={check.label}
            className={`flex items-start gap-1.5 rounded px-1.5 py-1 ${
              isDeciding ? "bg-muted/60 ring-1 ring-muted-foreground/20" : ""
            }`}
          >
            <span className="mt-0.5 shrink-0">
              {check.result === "my-turn" ? (
                <CircleAlert className="h-3 w-3 text-destructive" />
              ) : check.result === "their-turn" ? (
                <Clock className="h-3 w-3 text-muted-foreground" />
              ) : (
                <SkipForward className="h-3 w-3 text-muted-foreground/50" />
              )}
            </span>
            <div className="min-w-0">
              <span className="font-medium">
                {check.label}
              </span>
              {isDeciding && (
                <span className="ml-1.5 inline-flex items-center gap-0.5 text-[10px] text-muted-foreground">
                  <ArrowRight className="h-2.5 w-2.5" />
                  deciding
                </span>
              )}
              <p className="text-muted-foreground break-words">{check.value}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
