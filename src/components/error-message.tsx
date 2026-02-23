import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertCircle, Github, Key } from "lucide-react";

interface ErrorMessageProps {
  error: string;
  onRetry: () => void;
}

export function ErrorMessage({ error, onRetry }: ErrorMessageProps) {
  const isGitHubConnectionError =
    error.toLowerCase().includes("no github account") ||
    error.toLowerCase().includes("connect github");

  const isPatError =
    error.toLowerCase().includes("personal access token") ||
    error.toLowerCase().includes("pat");

  let icon = <AlertCircle className="h-4 w-4" />;
  let title = "Error";

  if (isGitHubConnectionError) {
    icon = <Github className="h-4 w-4" />;
    title = "GitHub Not Connected";
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
        {isGitHubConnectionError ? (
          <p className="mt-2 text-sm">
            Go to your{" "}
            <a href="/user-profile" className="underline font-medium">
              account settings
            </a>{" "}
            and connect your GitHub account to use this dashboard.
          </p>
        ) : isPatError ? (
          <p className="mt-2 text-sm">
            Check your <code className="text-xs">NEXT_PUBLIC_PAT</code>{" "}
            environment variable, or switch to OAuth using the dropdown above.
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
