import { auth, clerkClient } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import {
  fetchMyPrs,
  fetchReviewRequests,
  fetchReviewedBy,
  fetchAuthenticatedUser,
  enrichPr,
} from "@/lib/github";
import type {
  DashboardPR,
  DashboardResponse,
  DashboardError,
  GitHubSearchItem,
} from "@/lib/types";

function sortPrs(prs: DashboardPR[]): DashboardPR[] {
  return prs.sort((a, b) => {
    // "my-turn" first
    if (a.turnStatus !== b.turnStatus) {
      return a.turnStatus === "my-turn" ? -1 : 1;
    }
    // Then by most recently updated
    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
  });
}

export async function GET(request: Request) {
  // 1. Authenticate with Clerk (always required)
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json(
      { error: "Unauthorized", code: "UNAUTHORIZED" } satisfies DashboardError,
      { status: 401 }
    );
  }

  // 2. Determine auth method from query param
  const { searchParams } = new URL(request.url);
  const authMethod = searchParams.get("authMethod") ?? "oauth";

  let githubToken: string;
  let githubUsername: string;

  if (authMethod === "pat") {
    // --- PAT mode ---
    const pat = process.env.NEXT_PUBLIC_PAT;
    if (!pat) {
      return NextResponse.json(
        {
          error:
            "Personal Access Token is not configured. Set the NEXT_PUBLIC_PAT environment variable.",
          code: "PAT_NOT_CONFIGURED",
        } satisfies DashboardError,
        { status: 400 }
      );
    }
    githubToken = pat;

    try {
      const ghUser = await fetchAuthenticatedUser(pat);
      githubUsername = ghUser.login;
    } catch {
      return NextResponse.json(
        {
          error:
            "Invalid Personal Access Token or GitHub API error. Check your token.",
          code: "GITHUB_API_ERROR",
        } satisfies DashboardError,
        { status: 502 }
      );
    }
  } else {
    // --- OAuth mode ---
    const client = await clerkClient();

    try {
      const tokenResponse = await client.users.getUserOauthAccessToken(
        userId,
        "github"
      );
      const tokenData = tokenResponse.data[0];
      if (!tokenData?.token) {
        return NextResponse.json(
          {
            error:
              "No GitHub account connected. Please connect GitHub in your account settings.",
            code: "NO_GITHUB_ACCOUNT",
          } satisfies DashboardError,
          { status: 400 }
        );
      }
      githubToken = tokenData.token;
    } catch {
      return NextResponse.json(
        {
          error:
            "No GitHub account connected. Please connect GitHub in your account settings.",
          code: "NO_GITHUB_ACCOUNT",
        } satisfies DashboardError,
        { status: 400 }
      );
    }

    const user = await client.users.getUser(userId);
    const githubAccount = user.externalAccounts.find(
      (account) => account.provider === "oauth_github"
    );
    if (!githubAccount?.username) {
      return NextResponse.json(
        {
          error: "No GitHub username found on your account.",
          code: "NO_GITHUB_ACCOUNT",
        } satisfies DashboardError,
        { status: 400 }
      );
    }
    githubUsername = githubAccount.username;
  }

  // 3. Fetch PRs from GitHub (same for both auth methods)
  let myPrItems: GitHubSearchItem[];
  let reviewRequestItems: GitHubSearchItem[];
  let reviewedByItems: GitHubSearchItem[];

  try {
    [myPrItems, reviewRequestItems, reviewedByItems] = await Promise.all([
      fetchMyPrs(githubUsername, githubToken),
      fetchReviewRequests(githubUsername, githubToken),
      fetchReviewedBy(githubUsername, githubToken),
    ]);
  } catch (error) {
    console.error("[gh-dash] Search queries failed:", error);
    const message = error instanceof Error ? error.message : String(error);
    const isRateLimited = message.startsWith("RATE_LIMITED:");
    return NextResponse.json(
      {
        error: isRateLimited
          ? message.replace("RATE_LIMITED: ", "")
          : `GitHub search failed: ${message}`,
        code: isRateLimited ? "RATE_LIMITED" : "GITHUB_API_ERROR",
      } satisfies DashboardError,
      { status: isRateLimited ? 429 : 502 }
    );
  }

  console.log(
    `[gh-dash] Fetched ${myPrItems.length} my PRs, ${reviewRequestItems.length} review-requested, ${reviewedByItems.length} reviewed-by`
  );

  // Track which PRs came from review-requested search (user has a pending request)
  const reviewRequestedIds = new Set(reviewRequestItems.map((item) => item.id));

  // Deduplicate review requests (merge review-requested + reviewed-by)
  const reviewItemsMap = new Map<number, GitHubSearchItem>();
  for (const item of [...reviewRequestItems, ...reviewedByItems]) {
    reviewItemsMap.set(item.id, item);
  }
  // Remove PRs authored by the user (no self-review)
  const dedupedReviewItems = [...reviewItemsMap.values()].filter(
    (item) =>
      item.user.login.toLowerCase() !== githubUsername.toLowerCase()
  );

  // 4. Enrich each PR with review details
  try {
    const [myPrs, reviewRequests] = await Promise.all([
      Promise.all(
        myPrItems.map((item) =>
          enrichPr(item, githubToken, "my-prs", githubUsername)
        )
      ),
      Promise.all(
        dedupedReviewItems.map((item) =>
          enrichPr(item, githubToken, "review-requests", githubUsername, reviewRequestedIds.has(item.id))
        )
      ),
    ]);

    return NextResponse.json({
      myPrs: sortPrs(myPrs),
      reviewRequests: sortPrs(reviewRequests),
      githubUsername,
      fetchedAt: new Date().toISOString(),
    } satisfies DashboardResponse);
  } catch (error) {
    console.error("[gh-dash] PR enrichment failed:", error);
    const message = error instanceof Error ? error.message : String(error);
    const isRateLimited = message.startsWith("RATE_LIMITED:");
    return NextResponse.json(
      {
        error: isRateLimited
          ? message.replace("RATE_LIMITED: ", "")
          : `GitHub PR enrichment failed: ${message}`,
        code: isRateLimited ? "RATE_LIMITED" : "GITHUB_API_ERROR",
      } satisfies DashboardError,
      { status: isRateLimited ? 429 : 502 }
    );
  }
}
