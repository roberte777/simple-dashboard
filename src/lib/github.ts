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
    TurnDebugCheck,
    TurnDebugInfo,
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
        // Detect rate limiting: HTTP 429 or 403 with X-RateLimit-Remaining: 0
        const isRateLimited =
            res.status === 429 ||
            (res.status === 403 && res.headers.get("x-ratelimit-remaining") === "0");

        if (isRateLimited) {
            const resetHeader = res.headers.get("x-ratelimit-reset");
            const resetInfo = resetHeader
                ? ` Resets at ${new Date(Number(resetHeader) * 1000).toLocaleTimeString()}.`
                : "";
            throw new Error(`RATE_LIMITED: GitHub API rate limit exceeded.${resetInfo}`);
        }

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
): Promise<{ users: GitHubUser[]; teams: Array<{ name: string; slug: string }> }> {
    const data = await githubFetch<GitHubRequestedReviewersResponse>(
        `${GITHUB_API}/repos/${owner}/${repo}/pulls/${prNumber}/requested_reviewers`,
        token
    );
    return { users: data.users, teams: data.teams };
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
): { turnStatus: TurnStatus; debugInfo: TurnDebugInfo } {
    const checks: TurnDebugCheck[] = [];
    let decidingCheck = "";

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
    const noReviews = reviewersWhoSubmitted.size === 0;
    checks.push({
        label: "No reviews submitted yet",
        value: noReviews
            ? "No reviewers have submitted feedback"
            : `${reviewersWhoSubmitted.size} reviewer(s) submitted: ${[...reviewersWhoSubmitted].join(", ")}`,
        result: noReviews ? "their-turn" : "skip",
    });
    if (noReviews) {
        decidingCheck = "No reviews submitted yet";
        return { turnStatus: "their-turn", debugInfo: { section: "my-prs", checks, decidingCheck } };
    }

    // Step 3: Check if all reviewers who submitted have been re-requested
    const requestedLogins = new Set(
        requestedReviewers.map((r) => r.login.toLowerCase())
    );
    const allReRequested = [...reviewersWhoSubmitted].every((login) =>
        requestedLogins.has(login)
    );
    checks.push({
        label: "All submitters re-requested",
        value: allReRequested
            ? `All reviewers re-requested: ${[...reviewersWhoSubmitted].join(", ")}`
            : requestedLogins.size > 0
                ? `Re-requested: ${[...requestedLogins].join(", ")} (not all submitters)`
                : "No re-requests pending",
        result: allReRequested ? "their-turn" : "skip",
    });
    if (allReRequested) {
        decidingCheck = "All submitters re-requested";
        return { turnStatus: "their-turn", debugInfo: { section: "my-prs", checks, decidingCheck } };
    }

    // Step 4: Compute the latest review state per user (excluding author)
    // On GitHub, COMMENTED does not clear a previous CHANGES_REQUESTED.
    // Only APPROVED or DISMISSED can override CHANGES_REQUESTED.
    const latestByUser = new Map<string, string>();
    for (const review of reviews) {
        if (
            SUBMITTED_STATES.has(review.state) &&
            review.user.login.toLowerCase() !== authorUsername.toLowerCase()
        ) {
            const login = review.user.login.toLowerCase();
            const prev = latestByUser.get(login);
            if (
                (prev === "CHANGES_REQUESTED" || prev === "APPROVED") &&
                review.state === "COMMENTED"
            ) {
                continue; // COMMENTED does not dismiss CHANGES_REQUESTED or APPROVED
            }
            latestByUser.set(login, review.state);
        }
    }

    // Step 5: If any reviewer's latest state is CHANGES_REQUESTED, always my-turn
    const hasChangesRequested = [...latestByUser.values()].some(
        (state) => state === "CHANGES_REQUESTED"
    );
    const latestStates = [...latestByUser.entries()].map(([u, s]) => `${u}: ${s}`).join(", ");
    checks.push({
        label: "Changes requested",
        value: hasChangesRequested
            ? `Changes requested found (${latestStates})`
            : `No changes requested (${latestStates || "none"})`,
        result: hasChangesRequested ? "my-turn" : "skip",
    });
    if (hasChangesRequested) {
        decidingCheck = "Changes requested";
        return { turnStatus: "my-turn", debugInfo: { section: "my-prs", checks, decidingCheck } };
    }

    // Step 6: No changes requested — check mergeable_state
    const stateStr = mergeableState ?? "null";
    let mergeResult: TurnStatus;
    let mergeDesc: string;
    switch (mergeableState) {
        case "clean":
            mergeResult = "my-turn";
            mergeDesc = "Ready to merge — all branch protection met";
            break;
        case "blocked":
            mergeResult = "their-turn";
            mergeDesc = "Insufficient approvals / CODEOWNERS not satisfied";
            break;
        case "dirty":
            mergeResult = "my-turn";
            mergeDesc = "Merge conflicts — author needs to resolve";
            break;
        case "unstable":
            mergeResult = "my-turn";
            mergeDesc = "Failing checks — author should investigate";
            break;
        default:
            mergeResult = "my-turn";
            mergeDesc = "Unknown/null — conservative fallback";
            break;
    }
    checks.push({
        label: `Mergeable state: ${stateStr}`,
        value: mergeDesc,
        result: mergeResult,
    });
    decidingCheck = `Mergeable state: ${stateStr}`;

    return { turnStatus: mergeResult, debugInfo: { section: "my-prs", checks, decidingCheck } };
}

function determineReviewRequestTurn(
    _reviews: GitHubReview[],
    requestedReviewers: GitHubUser[],
    requestedTeams: Array<{ name: string; slug: string }>,
    myUsername: string,
    isReviewRequested: boolean
): { turnStatus: TurnStatus; debugInfo: TurnDebugInfo } {
    const checks: TurnDebugCheck[] = [];

    // Check 1: My turn if my review is individually requested
    const myReviewRequested = requestedReviewers.some(
        (r) => r.login.toLowerCase() === myUsername.toLowerCase()
    );
    const requestedNames = requestedReviewers.map((r) => r.login).join(", ");
    checks.push({
        label: "My review requested",
        value: myReviewRequested
            ? `Your review is currently requested (pending reviewers: ${requestedNames})`
            : requestedNames
                ? `Your review is not in the requested list (pending: ${requestedNames})`
                : "No pending individual review requests",
        result: myReviewRequested ? "my-turn" : "skip",
    });

    if (myReviewRequested) {
        return {
            turnStatus: "my-turn",
            debugInfo: {
                section: "review-requests",
                checks,
                decidingCheck: "My review requested",
            },
        };
    }

    // Check 2: My turn if requested via a team
    // isReviewRequested means the PR was found via review-requested: search (GitHub confirmed involvement).
    // If not individually requested but teams are pending and search confirmed, user is requested via team.
    const teamNames = requestedTeams.map((t) => t.name).join(", ");
    const requestedViaTeam = isReviewRequested && requestedTeams.length > 0;
    checks.push({
        label: "My review requested (via team)",
        value: requestedViaTeam
            ? `Requested via team (teams: ${teamNames})`
            : !isReviewRequested
                ? "PR found via reviewed-by search, not review-requested"
                : "No team review requests",
        result: requestedViaTeam ? "my-turn" : "their-turn",
    });

    return {
        turnStatus: requestedViaTeam ? "my-turn" : "their-turn",
        debugInfo: {
            section: "review-requests",
            checks,
            decidingCheck: requestedViaTeam
                ? "My review requested (via team)"
                : "My review requested (via team)",
        },
    };
}

// --- Review summary ---

function buildReviewSummary(
    reviews: GitHubReview[],
    requestedReviewers: GitHubUser[],
    requestedTeams: Array<{ name: string; slug: string }>
): string {
    const parts: string[] = [];

    // Count latest review state per reviewer
    // COMMENTED does not override CHANGES_REQUESTED or APPROVED on GitHub
    const latestByUser = new Map<string, string>();
    for (const review of reviews) {
        if (SUBMITTED_STATES.has(review.state)) {
            const prev = latestByUser.get(review.user.login);
            if (
                (prev === "CHANGES_REQUESTED" || prev === "APPROVED") &&
                review.state === "COMMENTED"
            ) {
                continue;
            }
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
    const pendingCount = requestedReviewers.length + requestedTeams.length;
    if (pendingCount > 0) {
        const teamSuffix = requestedTeams.length > 0
            ? ` (${requestedTeams.length} team${requestedTeams.length > 1 ? "s" : ""})`
            : "";
        parts.push(`${pendingCount} pending${teamSuffix}`);
    }

    return parts.length > 0 ? parts.join(", ") : "No reviews";
}

// --- Enrichment ---

export async function enrichPr(
    item: GitHubSearchItem,
    token: string,
    section: "my-prs" | "review-requests",
    myUsername: string,
    isReviewRequested: boolean = false
): Promise<DashboardPR> {
    const repo = parseRepo(item.repository_url);
    const [owner, repoName] = repo.split("/");

    // Only fetch PR detail (for mergeable_state) when needed for my-prs turn logic
    const pullDetailPromise =
        section === "my-prs"
            ? fetchPullDetail(item.pull_request.url, token)
            : Promise.resolve(null);

    const [reviews, requestedReviewersData, pullDetail] = await Promise.all([
        fetchReviews(owner, repoName, item.number, token),
        fetchRequestedReviewers(owner, repoName, item.number, token),
        pullDetailPromise,
    ]);

    const requestedReviewers = requestedReviewersData.users;
    const requestedTeams = requestedReviewersData.teams;
    const mergeableState = pullDetail?.mergeable_state ?? null;

    const { turnStatus, debugInfo } =
        section === "my-prs"
            ? determineMyPrTurn(reviews, requestedReviewers, item.user.login, mergeableState)
            : determineReviewRequestTurn(reviews, requestedReviewers, requestedTeams, myUsername, isReviewRequested);

    const reviewSummary = buildReviewSummary(reviews, requestedReviewers, requestedTeams);

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
        turnDebugInfo: debugInfo,
        isDraft: item.draft ?? false,
        createdAt: item.created_at,
        updatedAt: item.updated_at,
        labels: item.labels,
        reviewSummary,
    };
}
