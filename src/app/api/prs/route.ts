import { auth, clerkClient } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import {
  fetchMyPrs,
  fetchReviewRequests,
  fetchReviewedBy,
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

export async function GET() {
  // 1. Authenticate
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json(
      { error: "Unauthorized", code: "UNAUTHORIZED" } satisfies DashboardError,
      { status: 401 }
    );
  }

  // 2. Get GitHub OAuth token from Clerk
  const client = await clerkClient();

  let githubToken: string;
  try {
    const tokenResponse = await client.users.getUserOauthAccessToken(
      userId,
      "github"
    );
    const tokenData = tokenResponse.data[0];
    if (!tokenData?.token) {
      return NextResponse.json(
        {
          error: "No GitHub account connected. Please connect GitHub in your account settings.",
          code: "NO_GITHUB_ACCOUNT",
        } satisfies DashboardError,
        { status: 400 }
      );
    }
    githubToken = tokenData.token;
  } catch {
    return NextResponse.json(
      {
        error: "No GitHub account connected. Please connect GitHub in your account settings.",
        code: "NO_GITHUB_ACCOUNT",
      } satisfies DashboardError,
      { status: 400 }
    );
  }

  // 3. Get GitHub username from Clerk external accounts
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
  const githubUsername = githubAccount.username;

  // 4. Fetch PRs from GitHub
  try {
    const [myPrItems, reviewRequestItems, reviewedByItems] = await Promise.all([
      fetchMyPrs(githubUsername, githubToken),
      fetchReviewRequests(githubUsername, githubToken),
      fetchReviewedBy(githubUsername, githubToken),
    ]);

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

    // 5. Enrich each PR with review details
    const [myPrs, reviewRequests] = await Promise.all([
      Promise.all(
        myPrItems.map((item) =>
          enrichPr(item, githubToken, "my-prs", githubUsername)
        )
      ),
      Promise.all(
        dedupedReviewItems.map((item) =>
          enrichPr(item, githubToken, "review-requests", githubUsername)
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
    console.error("GitHub API error:", error);
    return NextResponse.json(
      {
        error: "Failed to fetch data from GitHub. Please try again.",
        code: "GITHUB_API_ERROR",
      } satisfies DashboardError,
      { status: 502 }
    );
  }
}
