import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertCircle, Github } from "lucide-react";

interface ErrorMessageProps {
  error: string;
  onRetry: () => void;
}

export function ErrorMessage({ error, onRetry }: ErrorMessageProps) {
  const isGitHubConnectionError =
    error.toLowerCase().includes("no github account") ||
    error.toLowerCase().includes("connect github");

  return (
    <Alert variant="destructive">
      {isGitHubConnectionError ? (
        <Github className="h-4 w-4" />
      ) : (
        <AlertCircle className="h-4 w-4" />
      )}
      <AlertTitle>
        {isGitHubConnectionError ? "GitHub Not Connected" : "Error"}
      </AlertTitle>
      <AlertDescription className="mt-2">
        <p>{error}</p>
        {isGitHubConnectionError ? (
          <p className="mt-2 text-sm">
            Go to your{" "}
            <a
              href="/user-profile"
              className="underline font-medium"
            >
              account settings
            </a>{" "}
            and connect your GitHub account to use this dashboard.
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
