import type {
    GitHubSearchResponse,
    GitHubSearchItem,
    GitHubReview,
    GitHubRequestedReviewersResponse,
    GitHubPullDetail,
    GitHubUser,
    GitHubAuthenticatedUser,
    DashboardPR,
    TurnStatus,
} from "./types";

const GITHUB_API = "https://api.github.com";

// --- Helpers ---

function parseRepo(repositoryUrl: string): string {
    // "https://api.github.com/repos/octocat/hello" -> "octocat/hello"
    const match = repositoryUrl.match(/repos\/(.+)$/);
    return match?.[1] ?? repositoryUrl;
}

async function githubFetch<T>(url: string, token: string): Promise<T> {
    const res = await fetch(url, {
        headers: {
            Accept: "application/vnd.github.v3+json",
            Authorization: `Bearer ${token}`,
        },
    });

    if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new Error(
            `GitHub API ${res.status}: ${res.statusText} - ${body.slice(0, 200)}`
        );
    }

    return res.json() as Promise<T>;
}

// --- User resolution (for PAT mode) ---

export async function fetchAuthenticatedUser(
    token: string
): Promise<GitHubAuthenticatedUser> {
    return githubFetch<GitHubAuthenticatedUser>(`${GITHUB_API}/user`, token);
}

// --- Search queries ---

export async function fetchMyPrs(
    username: string,
    token: string
): Promise<GitHubSearchItem[]> {
    const q = encodeURIComponent(
        `author:${username} type:pr state:open sort:updated`
    );
    const data = await githubFetch<GitHubSearchResponse>(
        `${GITHUB_API}/search/issues?q=${q}&per_page=25`,
        token
    );
    return data.items.filter((item) => item.pull_request);
}

export async function fetchReviewRequests(
    username: string,
    token: string
): Promise<GitHubSearchItem[]> {
    const q = encodeURIComponent(
        `review-requested:${username} type:pr state:open sort:updated`
    );
    const data = await githubFetch<GitHubSearchResponse>(
        `${GITHUB_API}/search/issues?q=${q}&per_page=25`,
        token
    );
    return data.items.filter((item) => item.pull_request);
}

export async function fetchReviewedBy(
    username: string,
    token: string
): Promise<GitHubSearchItem[]> {
    const q = encodeURIComponent(
        `reviewed-by:${username} type:pr state:open sort:updated`
    );
    const data = await githubFetch<GitHubSearchResponse>(
        `${GITHUB_API}/search/issues?q=${q}&per_page=25`,
        token
    );
    return data.items.filter((item) => item.pull_request);
}

// --- PR detail queries ---

async function fetchReviews(
    owner: string,
    repo: string,
    prNumber: number,
    token: string
): Promise<GitHubReview[]> {
    return githubFetch<GitHubReview[]>(
        `${GITHUB_API}/repos/${owner}/${repo}/pulls/${prNumber}/reviews`,
        token
    );
}

async function fetchRequestedReviewers(
    owner: string,
    repo: string,
    prNumber: number,
    token: string
): Promise<GitHubUser[]> {
    const data = await githubFetch<GitHubRequestedReviewersResponse>(
        `${GITHUB_API}/repos/${owner}/${repo}/pulls/${prNumber}/requested_reviewers`,
        token
    );
    return data.users;
}

async function fetchPullDetail(
    pullUrl: string,
    token: string
): Promise<GitHubPullDetail> {
    return githubFetch<GitHubPullDetail>(pullUrl, token);
}

// --- Turn determination ---

const SUBMITTED_STATES = new Set([
    "APPROVED",
    "CHANGES_REQUESTED",
    "COMMENTED",
    "DISMISSED",
]);

function determineMyPrTurn(
    reviews: GitHubReview[],
    requestedReviewers: GitHubUser[],
    authorUsername: string,
    mergeableState: string | null | undefined
): TurnStatus {
    // Step 1: Identify reviewers who have submitted feedback (excluding author)
    const reviewersWhoSubmitted = new Set<string>();
    for (const review of reviews) {
        if (
            SUBMITTED_STATES.has(review.state) &&
            review.user.login.toLowerCase() !== authorUsername.toLowerCase()
        ) {
            reviewersWhoSubmitted.add(review.user.login.toLowerCase());
        }
    }

    // Step 2: No reviews submitted yet — waiting on reviewers
    if (reviewersWhoSubmitted.size === 0) {
        return "their-turn";
    }

    // Step 3: Check if all reviewers who submitted have been re-requested
    const requestedLogins = new Set(
        requestedReviewers.map((r) => r.login.toLowerCase())
    );
    const allReRequested = [...reviewersWhoSubmitted].every((login) =>
        requestedLogins.has(login)
    );
    if (allReRequested) {
        return "their-turn";
    }

    // Step 4: Compute the latest review state per user (excluding author)
    const latestByUser = new Map<string, string>();
    for (const review of reviews) {
        if (
            SUBMITTED_STATES.has(review.state) &&
            review.user.login.toLowerCase() !== authorUsername.toLowerCase()
        ) {
            latestByUser.set(review.user.login.toLowerCase(), review.state);
        }
    }

    // Step 5: If any reviewer's latest state is CHANGES_REQUESTED, always my-turn
    const hasChangesRequested = [...latestByUser.values()].some(
        (state) => state === "CHANGES_REQUESTED"
    );
    if (hasChangesRequested) {
        return "my-turn";
    }

    // Step 6: No changes requested — check mergeable_state to determine
    // whether the PR has enough approvals to actually be mergeable.
    if (mergeableState === "clean") {
        return "my-turn"; // All branch protection requirements met — ready to merge
    }
    if (mergeableState === "blocked") {
        return "their-turn"; // Insufficient approvals / CODEOWNERS not satisfied
    }
    if (mergeableState === "dirty") {
        return "my-turn"; // Merge conflicts — author needs to resolve
    }
    if (mergeableState === "unstable") {
        return "my-turn"; // Failing checks — author should investigate
    }

    // Fallback: mergeable_state is null, "unknown", or unexpected.
    // Conservative fallback to the old behavior (my-turn).
    return "my-turn";
}

function determineReviewRequestTurn(
    _reviews: GitHubReview[],
    requestedReviewers: GitHubUser[],
    myUsername: string
): TurnStatus {
    // My turn if my review is currently requested
    const myReviewRequested = requestedReviewers.some(
        (r) => r.login.toLowerCase() === myUsername.toLowerCase()
    );
    return myReviewRequested ? "my-turn" : "their-turn";
}

// --- Review summary ---

function buildReviewSummary(
    reviews: GitHubReview[],
    requestedReviewers: GitHubUser[]
): string {
    const parts: string[] = [];

    // Count latest review state per reviewer
    const latestByUser = new Map<string, string>();
    for (const review of reviews) {
        if (SUBMITTED_STATES.has(review.state)) {
            latestByUser.set(review.user.login, review.state);
        }
    }

    const counts: Record<string, number> = {};
    for (const state of latestByUser.values()) {
        counts[state] = (counts[state] ?? 0) + 1;
    }

    if (counts["APPROVED"]) {
        parts.push(`${counts["APPROVED"]} approved`);
    }
    if (counts["CHANGES_REQUESTED"]) {
        parts.push(`${counts["CHANGES_REQUESTED"]} changes requested`);
    }
    if (counts["COMMENTED"]) {
        parts.push(`${counts["COMMENTED"]} commented`);
    }
    if (requestedReviewers.length > 0) {
        parts.push(`${requestedReviewers.length} pending`);
    }

    return parts.length > 0 ? parts.join(", ") : "No reviews";
}

// --- Enrichment ---

export async function enrichPr(
    item: GitHubSearchItem,
    token: string,
    section: "my-prs" | "review-requests",
    myUsername: string
): Promise<DashboardPR> {
    const repo = parseRepo(item.repository_url);
    const [owner, repoName] = repo.split("/");

    // Only fetch PR detail (for mergeable_state) when needed for my-prs turn logic
    const pullDetailPromise =
        section === "my-prs"
            ? fetchPullDetail(item.pull_request.url, token)
            : Promise.resolve(null);

    const [reviews, requestedReviewers, pullDetail] = await Promise.all([
        fetchReviews(owner, repoName, item.number, token),
        fetchRequestedReviewers(owner, repoName, item.number, token),
        pullDetailPromise,
    ]);

    const mergeableState = pullDetail?.mergeable_state ?? null;

    const turnStatus =
        section === "my-prs"
            ? determineMyPrTurn(reviews, requestedReviewers, item.user.login, mergeableState)
            : determineReviewRequestTurn(reviews, requestedReviewers, myUsername);

    const reviewSummary = buildReviewSummary(reviews, requestedReviewers);

    return {
        id: item.id,
        number: item.number,
        title: item.title,
        url: item.html_url,
        repo,
        author: {
            login: item.user.login,
            avatarUrl: item.user.avatar_url,
        },
        turnStatus,
        isDraft: item.draft ?? false,
        createdAt: item.created_at,
        updatedAt: item.updated_at,
        labels: item.labels,
        reviewSummary,
    };
}
