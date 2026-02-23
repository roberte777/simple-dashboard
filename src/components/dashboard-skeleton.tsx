import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export function DashboardSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 4 }).map((_, i) => (
        <Card key={i}>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-3 w-12" />
            </div>
            <Skeleton className="h-4 w-full mt-1" />
          </CardHeader>
          <CardContent className="pt-0">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Skeleton className="h-5 w-5 rounded-full" />
                <Skeleton className="h-3 w-16" />
              </div>
              <Skeleton className="h-5 w-20 rounded-full" />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
