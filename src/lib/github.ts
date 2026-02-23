import type {
    GitHubSearchResponse,
    GitHubSearchItem,
    GitHubReview,
    GitHubRequestedReviewersResponse,
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
    authorUsername: string
): TurnStatus {
    // Get the set of users who have submitted reviews, excluding the PR author
    // (author's own review comments, e.g. replying to feedback, don't count as actionable feedback)
    const reviewersWhoSubmitted = new Set<string>();
    for (const review of reviews) {
        if (
            SUBMITTED_STATES.has(review.state) &&
            review.user.login.toLowerCase() !== authorUsername.toLowerCase()
        ) {
            reviewersWhoSubmitted.add(review.user.login.toLowerCase());
        }
    }

    // No reviews submitted yet — waiting on reviewers
    if (reviewersWhoSubmitted.size === 0) {
        return "their-turn";
    }

    // Check if all reviewers who submitted have been re-requested
    const requestedLogins = new Set(
        requestedReviewers.map((r) => r.login.toLowerCase())
    );
    console.log("submitted: " + [...reviewersWhoSubmitted]);
    console.log("requested: " + [...requestedLogins]);
    const allReRequested = [...reviewersWhoSubmitted].every((login) =>
        requestedLogins.has(login)
    );

    // If I've re-requested reviews from everyone who gave feedback, ball is in their court
    return allReRequested ? "their-turn" : "my-turn";
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

    const [reviews, requestedReviewers] = await Promise.all([
        fetchReviews(owner, repoName, item.number, token),
        fetchRequestedReviewers(owner, repoName, item.number, token),
    ]);

    console.log("PR: ", item.title)
    const turnStatus =
        section === "my-prs"
            ? determineMyPrTurn(reviews, requestedReviewers, item.user.login)
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
