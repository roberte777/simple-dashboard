import { auth } from "@clerk/nextjs/server";
import { SignInButton, SignUpButton } from "@clerk/nextjs";
import { Dashboard } from "@/components/dashboard";
import { Github } from "lucide-react";

export default async function Home() {
  const { userId } = await auth();

  if (!userId) {
    return (
      <main className="flex min-h-[80vh] flex-col items-center justify-center px-4">
        <div className="flex flex-col items-center gap-6 text-center max-w-md">
          <Github className="h-16 w-16" />
          <h1 className="text-4xl font-bold tracking-tight">GH Dash</h1>
          <p className="text-lg text-muted-foreground">
            See whose turn it is on every PR. Connect your GitHub account and
            get a simple dashboard showing what needs your attention.
          </p>
          <div className="flex gap-3">
            <SignInButton mode="modal">
              <button className="inline-flex items-center justify-center rounded-md bg-primary px-6 py-2.5 text-sm font-medium text-primary-foreground shadow hover:bg-primary/90 transition-colors">
                Sign In
              </button>
            </SignInButton>
            <SignUpButton mode="modal">
              <button className="inline-flex items-center justify-center rounded-md border border-input bg-background px-6 py-2.5 text-sm font-medium shadow-sm hover:bg-accent transition-colors">
                Sign Up
              </button>
            </SignUpButton>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen">
      <Dashboard />
    </main>
  );
}
