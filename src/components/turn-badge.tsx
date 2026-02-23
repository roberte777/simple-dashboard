import { Badge } from "@/components/ui/badge";
import { CircleAlert, Clock } from "lucide-react";
import type { TurnStatus } from "@/lib/types";

interface TurnBadgeProps {
  status: TurnStatus;
}

export function TurnBadge({ status }: TurnBadgeProps) {
  if (status === "my-turn") {
    return (
      <Badge variant="destructive" className="gap-1">
        <CircleAlert className="h-3 w-3" />
        My Turn
      </Badge>
    );
  }

  return (
    <Badge variant="secondary" className="gap-1">
      <Clock className="h-3 w-3" />
      Their Turn
    </Badge>
  );
}
