import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertCircle, Key, Timer } from "lucide-react";

interface ErrorMessageProps {
  error: string;
  onRetry: () => void;
}

export function ErrorMessage({ error, onRetry }: ErrorMessageProps) {
  const isPatError =
    error.toLowerCase().includes("personal access token") ||
    error.toLowerCase().includes("pat") ||
    error.toLowerCase().includes("invalid token");

  const isRateLimitError =
    error.toLowerCase().includes("rate limit");

  let icon = <AlertCircle className="h-4 w-4" />;
  let title = "Error";

  if (isRateLimitError) {
    icon = <Timer className="h-4 w-4" />;
    title = "Rate Limited";
  } else if (isPatError) {
    icon = <Key className="h-4 w-4" />;
    title = "PAT Error";
  }

  return (
    <Alert variant="destructive">
      {icon}
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription className="mt-2">
        <p>{error}</p>
        {isRateLimitError ? (
          <p className="mt-2 text-sm">
            Try increasing the polling interval using the timer dropdown above,
            or pause auto-refresh until the limit resets.
          </p>
        ) : isPatError ? (
          <p className="mt-2 text-sm">
            Check your Personal Access Token in{" "}
            <code className="text-xs">~/.config/gh-dash/config.json</code>.
          </p>
        ) : (
          <button
            onClick={onRetry}
            className="mt-2 text-sm underline font-medium hover:no-underline"
          >
            Try again
          </button>
        )}
      </AlertDescription>
    </Alert>
  );
}
