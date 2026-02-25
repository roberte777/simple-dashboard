use reqwest::header::{HeaderMap, HeaderValue, ACCEPT, AUTHORIZATION, USER_AGENT};
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};

const GITHUB_API: &str = "https://api.github.com";

// ---------------------------------------------------------------------------
// GitHub API response types (Deserialize only — inbound from GitHub)
// ---------------------------------------------------------------------------

#[derive(Debug, Deserialize, Clone)]
#[allow(dead_code)]
pub struct GitHubUser {
    pub login: String,
    pub avatar_url: String,
    pub id: u64,
}

#[derive(Debug, Deserialize, Serialize, Clone)]
pub struct GitHubAuthenticatedUser {
    pub login: String,
    pub avatar_url: String,
    pub id: u64,
}

#[derive(Debug, Deserialize, Clone)]
#[allow(dead_code)]
pub struct GitHubReview {
    pub id: u64,
    pub user: GitHubUser,
    pub state: String,
    pub submitted_at: Option<String>,
}

#[derive(Debug, Deserialize, Clone)]
#[allow(dead_code)]
pub struct GitHubTeam {
    pub name: String,
    pub slug: String,
}

#[derive(Debug, Deserialize, Clone)]
pub struct GitHubRequestedReviewersResponse {
    pub users: Vec<GitHubUser>,
    pub teams: Vec<GitHubTeam>,
}

#[derive(Debug, Deserialize, Clone)]
#[allow(dead_code)]
pub struct GitHubPullRequest {
    pub url: String,
    pub html_url: String,
}

#[derive(Debug, Deserialize, Clone)]
pub struct GitHubLabel {
    pub name: String,
    pub color: String,
}

#[derive(Debug, Deserialize, Clone)]
#[allow(dead_code)]
pub struct GitHubSearchItem {
    pub id: u64,
    pub number: u64,
    pub title: String,
    pub html_url: String,
    pub state: String,
    pub created_at: String,
    pub updated_at: String,
    #[serde(default)]
    pub draft: bool,
    pub user: GitHubUser,
    pub repository_url: String,
    pub pull_request: Option<GitHubPullRequest>,
    #[serde(default)]
    pub labels: Vec<GitHubLabel>,
}

#[derive(Debug, Deserialize)]
#[allow(dead_code)]
pub struct GitHubSearchResponse {
    pub total_count: u64,
    pub incomplete_results: bool,
    pub items: Vec<GitHubSearchItem>,
}

#[derive(Debug, Deserialize, Clone)]
#[allow(dead_code)]
pub struct GitHubPullDetail {
    pub mergeable: Option<bool>,
    pub mergeable_state: Option<String>,
}

// ---------------------------------------------------------------------------
// Dashboard types (Serialize — outbound to the frontend)
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum TurnStatus {
    MyTurn,
    TheirTurn,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum CheckResult {
    MyTurn,
    TheirTurn,
    Skip,
}

#[derive(Debug, Clone, Serialize)]
pub struct TurnDebugCheck {
    pub label: String,
    pub value: String,
    pub result: CheckResult,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TurnDebugInfo {
    pub section: String,
    pub checks: Vec<TurnDebugCheck>,
    pub deciding_check: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DashboardAuthor {
    pub login: String,
    pub avatar_url: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DashboardLabel {
    pub name: String,
    pub color: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DashboardPR {
    pub id: u64,
    pub number: u64,
    pub title: String,
    pub url: String,
    pub repo: String,
    pub author: DashboardAuthor,
    pub turn_status: TurnStatus,
    pub turn_debug_info: Option<TurnDebugInfo>,
    pub is_draft: bool,
    pub created_at: String,
    pub updated_at: String,
    pub labels: Vec<DashboardLabel>,
    pub review_summary: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DashboardResponse {
    pub my_prs: Vec<DashboardPR>,
    pub review_requests: Vec<DashboardPR>,
    pub github_username: String,
    pub fetched_at: String,
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/// "https://api.github.com/repos/octocat/hello" -> "octocat/hello"
fn parse_repo(repository_url: &str) -> String {
    if let Some(idx) = repository_url.find("repos/") {
        repository_url[idx + 6..].to_string()
    } else {
        repository_url.to_string()
    }
}

fn build_headers(token: &str) -> HeaderMap {
    let mut headers = HeaderMap::new();
    headers.insert(
        ACCEPT,
        HeaderValue::from_static("application/vnd.github.v3+json"),
    );
    headers.insert(
        AUTHORIZATION,
        HeaderValue::from_str(&format!("Bearer {}", token))
            .expect("invalid token characters"),
    );
    headers.insert(
        USER_AGENT,
        HeaderValue::from_static("gh-dash-desktop"),
    );
    headers
}

/// Generic GitHub API fetch with rate-limit detection.
async fn github_fetch<T: serde::de::DeserializeOwned>(
    client: &reqwest::Client,
    url: &str,
    token: &str,
) -> Result<T, String> {
    let response = client
        .get(url)
        .headers(build_headers(token))
        .send()
        .await
        .map_err(|e| format!("Network error: {}", e))?;

    let status = response.status();

    if !status.is_success() {
        // Rate-limit detection: 429, or 403 with x-ratelimit-remaining: 0
        let is_rate_limited = status.as_u16() == 429
            || (status.as_u16() == 403
                && response
                    .headers()
                    .get("x-ratelimit-remaining")
                    .and_then(|v| v.to_str().ok())
                    == Some("0"));

        if is_rate_limited {
            let reset_info = response
                .headers()
                .get("x-ratelimit-reset")
                .and_then(|v| v.to_str().ok())
                .and_then(|v| v.parse::<i64>().ok())
                .map(|ts| {
                    let dt = chrono_timestamp_to_local_time(ts);
                    format!(" Resets at {}.", dt)
                })
                .unwrap_or_default();

            return Err(format!(
                "RATE_LIMITED: GitHub API rate limit exceeded.{}",
                reset_info
            ));
        }

        let status_code = status.as_u16();
        let reason = status.canonical_reason().unwrap_or("Unknown");
        let body = response.text().await.unwrap_or_default();
        let body_preview = if body.len() > 200 { &body[..200] } else { &body };
        return Err(format!(
            "GitHub API {}: {} - {}",
            status_code, reason, body_preview
        ));
    }

    response
        .json::<T>()
        .await
        .map_err(|e| format!("Failed to parse GitHub response: {}", e))
}

/// Format a UNIX timestamp into a local time string.
fn chrono_timestamp_to_local_time(ts: i64) -> String {
    // Simple formatting without pulling in the chrono crate.
    // We produce a UTC time string; close enough for a reset message.
    let secs = ts;
    let hours = (secs % 86400) / 3600;
    let minutes = (secs % 3600) / 60;
    let seconds = secs % 60;
    // Approximate — give HH:MM:SS UTC
    format!("{:02}:{:02}:{:02} UTC", hours, minutes, seconds)
}

// ---------------------------------------------------------------------------
// GitHub API fetchers
// ---------------------------------------------------------------------------

async fn fetch_authenticated_user(
    client: &reqwest::Client,
    token: &str,
) -> Result<GitHubAuthenticatedUser, String> {
    github_fetch(client, &format!("{}/user", GITHUB_API), token).await
}

async fn fetch_my_prs(
    client: &reqwest::Client,
    username: &str,
    token: &str,
) -> Result<Vec<GitHubSearchItem>, String> {
    let query = format!("author:{} type:pr state:open sort:updated", username);
    let q = urlencoding::encode(&query);
    let url = format!("{}/search/issues?q={}&per_page=25", GITHUB_API, q);
    let data: GitHubSearchResponse = github_fetch(client, &url, token).await?;
    Ok(data
        .items
        .into_iter()
        .filter(|item| item.pull_request.is_some())
        .collect())
}

async fn fetch_review_requests(
    client: &reqwest::Client,
    username: &str,
    token: &str,
) -> Result<Vec<GitHubSearchItem>, String> {
    let query = format!("review-requested:{} type:pr state:open sort:updated", username);
    let q = urlencoding::encode(&query);
    let url = format!("{}/search/issues?q={}&per_page=25", GITHUB_API, q);
    let data: GitHubSearchResponse = github_fetch(client, &url, token).await?;
    Ok(data
        .items
        .into_iter()
        .filter(|item| item.pull_request.is_some())
        .collect())
}

async fn fetch_reviewed_by(
    client: &reqwest::Client,
    username: &str,
    token: &str,
) -> Result<Vec<GitHubSearchItem>, String> {
    let query = format!("reviewed-by:{} type:pr state:open sort:updated", username);
    let q = urlencoding::encode(&query);
    let url = format!("{}/search/issues?q={}&per_page=25", GITHUB_API, q);
    let data: GitHubSearchResponse = github_fetch(client, &url, token).await?;
    Ok(data
        .items
        .into_iter()
        .filter(|item| item.pull_request.is_some())
        .collect())
}

async fn fetch_reviews(
    client: &reqwest::Client,
    owner: &str,
    repo: &str,
    pr_number: u64,
    token: &str,
) -> Result<Vec<GitHubReview>, String> {
    let url = format!(
        "{}/repos/{}/{}/pulls/{}/reviews",
        GITHUB_API, owner, repo, pr_number
    );
    github_fetch(client, &url, token).await
}

async fn fetch_requested_reviewers(
    client: &reqwest::Client,
    owner: &str,
    repo: &str,
    pr_number: u64,
    token: &str,
) -> Result<GitHubRequestedReviewersResponse, String> {
    let url = format!(
        "{}/repos/{}/{}/pulls/{}/requested_reviewers",
        GITHUB_API, owner, repo, pr_number
    );
    github_fetch(client, &url, token).await
}

async fn fetch_pull_detail(
    client: &reqwest::Client,
    pull_url: &str,
    token: &str,
) -> Result<GitHubPullDetail, String> {
    github_fetch(client, pull_url, token).await
}

// ---------------------------------------------------------------------------
// Submitted-state helpers
// ---------------------------------------------------------------------------

fn is_submitted_state(state: &str) -> bool {
    matches!(
        state,
        "APPROVED" | "CHANGES_REQUESTED" | "COMMENTED" | "DISMISSED"
    )
}

// ---------------------------------------------------------------------------
// Turn determination — My PRs
// ---------------------------------------------------------------------------

struct TurnResult {
    turn_status: TurnStatus,
    debug_info: TurnDebugInfo,
}

fn determine_my_pr_turn(
    reviews: &[GitHubReview],
    requested_reviewers: &[GitHubUser],
    author_username: &str,
    mergeable_state: Option<&str>,
) -> TurnResult {
    let mut checks: Vec<TurnDebugCheck> = Vec::new();
    let deciding_check: String;
    let author_lower = author_username.to_lowercase();

    // Step 1: Identify reviewers who have submitted feedback (excluding author)
    let mut reviewers_who_submitted: HashSet<String> = HashSet::new();
    for review in reviews {
        if is_submitted_state(&review.state)
            && review.user.login.to_lowercase() != author_lower
        {
            reviewers_who_submitted.insert(review.user.login.to_lowercase());
        }
    }

    // Step 2: No reviews submitted yet — waiting on reviewers
    let no_reviews = reviewers_who_submitted.is_empty();
    let submitted_list: Vec<String> = reviewers_who_submitted.iter().cloned().collect();
    checks.push(TurnDebugCheck {
        label: "No reviews submitted yet".to_string(),
        value: if no_reviews {
            "No reviewers have submitted feedback".to_string()
        } else {
            format!(
                "{} reviewer(s) submitted: {}",
                reviewers_who_submitted.len(),
                submitted_list.join(", ")
            )
        },
        result: if no_reviews {
            CheckResult::TheirTurn
        } else {
            CheckResult::Skip
        },
    });
    if no_reviews {
        deciding_check = "No reviews submitted yet".to_string();
        return TurnResult {
            turn_status: TurnStatus::TheirTurn,
            debug_info: TurnDebugInfo {
                section: "my-prs".to_string(),
                checks,
                deciding_check,
            },
        };
    }

    // Step 3: Check if all reviewers who submitted have been re-requested
    let requested_logins: HashSet<String> = requested_reviewers
        .iter()
        .map(|r| r.login.to_lowercase())
        .collect();
    let all_re_requested = reviewers_who_submitted
        .iter()
        .all(|login| requested_logins.contains(login));

    checks.push(TurnDebugCheck {
        label: "All submitters re-requested".to_string(),
        value: if all_re_requested {
            format!(
                "All reviewers re-requested: {}",
                submitted_list.join(", ")
            )
        } else if !requested_logins.is_empty() {
            let requested_list: Vec<String> = requested_logins.iter().cloned().collect();
            format!(
                "Re-requested: {} (not all submitters)",
                requested_list.join(", ")
            )
        } else {
            "No re-requests pending".to_string()
        },
        result: if all_re_requested {
            CheckResult::TheirTurn
        } else {
            CheckResult::Skip
        },
    });
    if all_re_requested {
        deciding_check = "All submitters re-requested".to_string();
        return TurnResult {
            turn_status: TurnStatus::TheirTurn,
            debug_info: TurnDebugInfo {
                section: "my-prs".to_string(),
                checks,
                deciding_check,
            },
        };
    }

    // Step 4: Compute latest review state per user
    // COMMENTED does not clear CHANGES_REQUESTED or APPROVED
    let mut latest_by_user: HashMap<String, String> = HashMap::new();
    for review in reviews {
        if is_submitted_state(&review.state)
            && review.user.login.to_lowercase() != author_lower
        {
            let login = review.user.login.to_lowercase();
            if let Some(prev) = latest_by_user.get(&login) {
                if (prev == "CHANGES_REQUESTED" || prev == "APPROVED")
                    && review.state == "COMMENTED"
                {
                    continue;
                }
            }
            latest_by_user.insert(login, review.state.clone());
        }
    }

    // Step 5: If any reviewer's latest state is CHANGES_REQUESTED, always my-turn
    let has_changes_requested = latest_by_user.values().any(|s| s == "CHANGES_REQUESTED");
    let latest_states: String = latest_by_user
        .iter()
        .map(|(u, s)| format!("{}: {}", u, s))
        .collect::<Vec<_>>()
        .join(", ");

    checks.push(TurnDebugCheck {
        label: "Changes requested".to_string(),
        value: if has_changes_requested {
            format!("Changes requested found ({})", latest_states)
        } else {
            format!(
                "No changes requested ({})",
                if latest_states.is_empty() {
                    "none".to_string()
                } else {
                    latest_states
                }
            )
        },
        result: if has_changes_requested {
            CheckResult::MyTurn
        } else {
            CheckResult::Skip
        },
    });
    if has_changes_requested {
        deciding_check = "Changes requested".to_string();
        return TurnResult {
            turn_status: TurnStatus::MyTurn,
            debug_info: TurnDebugInfo {
                section: "my-prs".to_string(),
                checks,
                deciding_check,
            },
        };
    }

    // Step 6: No changes requested — check mergeable_state
    let state_str = mergeable_state.unwrap_or("null");
    let (merge_result, merge_desc) = match state_str {
        "clean" => (
            TurnStatus::MyTurn,
            "Ready to merge — all branch protection met".to_string(),
        ),
        "blocked" => (
            TurnStatus::TheirTurn,
            "Insufficient approvals / CODEOWNERS not satisfied".to_string(),
        ),
        "dirty" => (
            TurnStatus::MyTurn,
            "Merge conflicts — author needs to resolve".to_string(),
        ),
        "unstable" => (
            TurnStatus::MyTurn,
            "Failing checks — author should investigate".to_string(),
        ),
        _ => (
            TurnStatus::MyTurn,
            "Unknown/null — conservative fallback".to_string(),
        ),
    };

    checks.push(TurnDebugCheck {
        label: format!("Mergeable state: {}", state_str),
        value: merge_desc,
        result: match &merge_result {
            TurnStatus::MyTurn => CheckResult::MyTurn,
            TurnStatus::TheirTurn => CheckResult::TheirTurn,
        },
    });
    deciding_check = format!("Mergeable state: {}", state_str);

    TurnResult {
        turn_status: merge_result,
        debug_info: TurnDebugInfo {
            section: "my-prs".to_string(),
            checks,
            deciding_check,
        },
    }
}

// ---------------------------------------------------------------------------
// Turn determination — Review Requests
// ---------------------------------------------------------------------------

fn determine_review_request_turn(
    _reviews: &[GitHubReview],
    requested_reviewers: &[GitHubUser],
    requested_teams: &[GitHubTeam],
    my_username: &str,
    is_review_requested: bool,
) -> TurnResult {
    let mut checks: Vec<TurnDebugCheck> = Vec::new();
    let my_lower = my_username.to_lowercase();

    // Check 1: My turn if my review is individually requested
    let my_review_requested = requested_reviewers
        .iter()
        .any(|r| r.login.to_lowercase() == my_lower);
    let requested_names: String = requested_reviewers
        .iter()
        .map(|r| r.login.clone())
        .collect::<Vec<_>>()
        .join(", ");

    checks.push(TurnDebugCheck {
        label: "My review requested".to_string(),
        value: if my_review_requested {
            format!(
                "Your review is currently requested (pending reviewers: {})",
                requested_names
            )
        } else if !requested_names.is_empty() {
            format!(
                "Your review is not in the requested list (pending: {})",
                requested_names
            )
        } else {
            "No pending individual review requests".to_string()
        },
        result: if my_review_requested {
            CheckResult::MyTurn
        } else {
            CheckResult::Skip
        },
    });

    if my_review_requested {
        return TurnResult {
            turn_status: TurnStatus::MyTurn,
            debug_info: TurnDebugInfo {
                section: "review-requests".to_string(),
                checks,
                deciding_check: "My review requested".to_string(),
            },
        };
    }

    // Check 2: My turn if requested via a team
    let team_names: String = requested_teams
        .iter()
        .map(|t| t.name.clone())
        .collect::<Vec<_>>()
        .join(", ");
    let requested_via_team = is_review_requested && !requested_teams.is_empty();

    checks.push(TurnDebugCheck {
        label: "My review requested (via team)".to_string(),
        value: if requested_via_team {
            format!("Requested via team (teams: {})", team_names)
        } else if !is_review_requested {
            "PR found via reviewed-by search, not review-requested".to_string()
        } else {
            "No team review requests".to_string()
        },
        result: if requested_via_team {
            CheckResult::MyTurn
        } else {
            CheckResult::TheirTurn
        },
    });

    TurnResult {
        turn_status: if requested_via_team {
            TurnStatus::MyTurn
        } else {
            TurnStatus::TheirTurn
        },
        debug_info: TurnDebugInfo {
            section: "review-requests".to_string(),
            checks,
            deciding_check: "My review requested (via team)".to_string(),
        },
    }
}

// ---------------------------------------------------------------------------
// Review summary
// ---------------------------------------------------------------------------

fn build_review_summary(
    reviews: &[GitHubReview],
    requested_reviewers: &[GitHubUser],
    requested_teams: &[GitHubTeam],
) -> String {
    let mut parts: Vec<String> = Vec::new();

    // Count latest review state per reviewer.
    // COMMENTED does not override CHANGES_REQUESTED or APPROVED.
    let mut latest_by_user: HashMap<String, String> = HashMap::new();
    for review in reviews {
        if is_submitted_state(&review.state) {
            let login = &review.user.login;
            if let Some(prev) = latest_by_user.get(login) {
                if (prev == "CHANGES_REQUESTED" || prev == "APPROVED")
                    && review.state == "COMMENTED"
                {
                    continue;
                }
            }
            latest_by_user.insert(login.clone(), review.state.clone());
        }
    }

    let mut counts: HashMap<String, u32> = HashMap::new();
    for state in latest_by_user.values() {
        *counts.entry(state.clone()).or_insert(0) += 1;
    }

    if let Some(&count) = counts.get("APPROVED") {
        parts.push(format!("{} approved", count));
    }
    if let Some(&count) = counts.get("CHANGES_REQUESTED") {
        parts.push(format!("{} changes requested", count));
    }
    if let Some(&count) = counts.get("COMMENTED") {
        parts.push(format!("{} commented", count));
    }

    let pending_count = requested_reviewers.len() + requested_teams.len();
    if pending_count > 0 {
        let team_suffix = if !requested_teams.is_empty() {
            let plural = if requested_teams.len() > 1 { "s" } else { "" };
            format!(" ({} team{})", requested_teams.len(), plural)
        } else {
            String::new()
        };
        parts.push(format!("{} pending{}", pending_count, team_suffix));
    }

    if parts.is_empty() {
        "No reviews".to_string()
    } else {
        parts.join(", ")
    }
}

// ---------------------------------------------------------------------------
// PR enrichment
// ---------------------------------------------------------------------------

async fn enrich_pr(
    client: &reqwest::Client,
    item: &GitHubSearchItem,
    token: &str,
    section: &str,
    my_username: &str,
    is_review_requested: bool,
) -> Result<DashboardPR, String> {
    let repo = parse_repo(&item.repository_url);
    let parts: Vec<&str> = repo.splitn(2, '/').collect();
    if parts.len() != 2 {
        return Err(format!("Could not parse owner/repo from: {}", repo));
    }
    let owner = parts[0];
    let repo_name = parts[1];

    // Parallel fetches: reviews, requested reviewers, and (for my-prs) pull detail
    let reviews_fut = fetch_reviews(client, owner, repo_name, item.number, token);
    let requested_reviewers_fut =
        fetch_requested_reviewers(client, owner, repo_name, item.number, token);

    let pull_detail = if section == "my-prs" {
        if let Some(ref pr) = item.pull_request {
            let detail_fut = fetch_pull_detail(client, &pr.url, token);
            let (reviews_res, rr_res, detail_res) =
                tokio::join!(reviews_fut, requested_reviewers_fut, detail_fut);
            let reviews = reviews_res?;
            let rr_data = rr_res?;
            let detail = detail_res?;
            return finish_enrich(
                item,
                &repo,
                section,
                my_username,
                is_review_requested,
                reviews,
                rr_data,
                Some(detail),
            );
        }
        None
    } else {
        None
    };

    // Non my-prs path, or no pull_request URL
    let (reviews_res, rr_res) = tokio::join!(reviews_fut, requested_reviewers_fut);
    let reviews = reviews_res?;
    let rr_data = rr_res?;

    finish_enrich(
        item,
        &repo,
        section,
        my_username,
        is_review_requested,
        reviews,
        rr_data,
        pull_detail,
    )
}

#[allow(clippy::too_many_arguments)]
fn finish_enrich(
    item: &GitHubSearchItem,
    repo: &str,
    section: &str,
    my_username: &str,
    is_review_requested: bool,
    reviews: Vec<GitHubReview>,
    rr_data: GitHubRequestedReviewersResponse,
    pull_detail: Option<GitHubPullDetail>,
) -> Result<DashboardPR, String> {
    let requested_reviewers = &rr_data.users;
    let requested_teams = &rr_data.teams;
    let mergeable_state = pull_detail.as_ref().and_then(|d| d.mergeable_state.as_deref());

    let TurnResult {
        turn_status,
        debug_info,
    } = if section == "my-prs" {
        determine_my_pr_turn(
            &reviews,
            requested_reviewers,
            &item.user.login,
            mergeable_state,
        )
    } else {
        determine_review_request_turn(
            &reviews,
            requested_reviewers,
            requested_teams,
            my_username,
            is_review_requested,
        )
    };

    let review_summary = build_review_summary(&reviews, requested_reviewers, requested_teams);

    Ok(DashboardPR {
        id: item.id,
        number: item.number,
        title: item.title.clone(),
        url: item.html_url.clone(),
        repo: repo.to_string(),
        author: DashboardAuthor {
            login: item.user.login.clone(),
            avatar_url: item.user.avatar_url.clone(),
        },
        turn_status,
        turn_debug_info: Some(debug_info),
        is_draft: item.draft,
        created_at: item.created_at.clone(),
        updated_at: item.updated_at.clone(),
        labels: item
            .labels
            .iter()
            .map(|l| DashboardLabel {
                name: l.name.clone(),
                color: l.color.clone(),
            })
            .collect(),
        review_summary,
    })
}

// ---------------------------------------------------------------------------
// Sort
// ---------------------------------------------------------------------------

fn sort_prs(prs: &mut [DashboardPR]) {
    prs.sort_by(|a, b| {
        // "my-turn" first
        if a.turn_status != b.turn_status {
            return if a.turn_status == TurnStatus::MyTurn {
                std::cmp::Ordering::Less
            } else {
                std::cmp::Ordering::Greater
            };
        }
        // Then by most recently updated (descending)
        b.updated_at.cmp(&a.updated_at)
    });
}

// ---------------------------------------------------------------------------
// Tauri commands
// ---------------------------------------------------------------------------

#[tauri::command]
pub async fn validate_pat(pat: String) -> Result<GitHubAuthenticatedUser, String> {
    let client = reqwest::Client::new();
    let user = fetch_authenticated_user(&client, &pat).await.map_err(|e| {
        if e.starts_with("RATE_LIMITED:") {
            e.replacen("RATE_LIMITED: ", "", 1)
        } else {
            format!("Invalid Personal Access Token or GitHub API error: {}", e)
        }
    })?;
    Ok(user)
}

#[tauri::command]
pub async fn fetch_dashboard(pat: String) -> Result<DashboardResponse, String> {
    let client = reqwest::Client::new();

    // 1. Resolve the authenticated user
    let gh_user = fetch_authenticated_user(&client, &pat).await.map_err(|e| {
        if e.starts_with("RATE_LIMITED:") {
            e.replacen("RATE_LIMITED: ", "", 1)
        } else {
            format!(
                "Invalid Personal Access Token or GitHub API error. Check your token. ({})",
                e
            )
        }
    })?;
    let github_username = gh_user.login;

    // 2. Fetch PRs from GitHub — three parallel searches
    let my_prs_fut = fetch_my_prs(&client, &github_username, &pat);
    let review_requests_fut = fetch_review_requests(&client, &github_username, &pat);
    let reviewed_by_fut = fetch_reviewed_by(&client, &github_username, &pat);

    let (my_pr_result, rr_result, rb_result) =
        tokio::join!(my_prs_fut, review_requests_fut, reviewed_by_fut);

    let my_pr_items = my_pr_result.map_err(|e| format_search_error(&e))?;
    let review_request_items = rr_result.map_err(|e| format_search_error(&e))?;
    let reviewed_by_items = rb_result.map_err(|e| format_search_error(&e))?;

    // 3. Track which PRs came from review-requested search
    let review_requested_ids: HashSet<u64> =
        review_request_items.iter().map(|item| item.id).collect();

    // 4. Deduplicate review items (merge review-requested + reviewed-by)
    let mut review_items_map: HashMap<u64, GitHubSearchItem> = HashMap::new();
    for item in review_request_items
        .into_iter()
        .chain(reviewed_by_items.into_iter())
    {
        review_items_map.entry(item.id).or_insert(item);
    }

    // Remove PRs authored by the user (no self-review)
    let deduped_review_items: Vec<GitHubSearchItem> = review_items_map
        .into_values()
        .filter(|item| item.user.login.to_lowercase() != github_username.to_lowercase())
        .collect();

    // 5. Enrich each PR with review details — parallel enrichment
    let my_pr_futures: Vec<_> = my_pr_items
        .iter()
        .map(|item| enrich_pr(&client, item, &pat, "my-prs", &github_username, false))
        .collect();

    let review_futures: Vec<_> = deduped_review_items
        .iter()
        .map(|item| {
            let is_rr = review_requested_ids.contains(&item.id);
            enrich_pr(
                &client,
                item,
                &pat,
                "review-requests",
                &github_username,
                is_rr,
            )
        })
        .collect();

    let my_prs_results = futures::future::join_all(my_pr_futures).await;
    let review_results = futures::future::join_all(review_futures).await;

    let mut my_prs: Vec<DashboardPR> = Vec::new();
    for result in my_prs_results {
        match result {
            Ok(pr) => my_prs.push(pr),
            Err(e) => return Err(format_enrichment_error(&e)),
        }
    }

    let mut review_requests: Vec<DashboardPR> = Vec::new();
    for result in review_results {
        match result {
            Ok(pr) => review_requests.push(pr),
            Err(e) => return Err(format_enrichment_error(&e)),
        }
    }

    // 6. Sort
    sort_prs(&mut my_prs);
    sort_prs(&mut review_requests);

    let fetched_at = chrono_now_iso();

    Ok(DashboardResponse {
        my_prs,
        review_requests,
        github_username,
        fetched_at,
    })
}

// ---------------------------------------------------------------------------
// Error formatting helpers
// ---------------------------------------------------------------------------

fn format_search_error(msg: &str) -> String {
    if msg.starts_with("RATE_LIMITED:") {
        msg.replacen("RATE_LIMITED: ", "", 1)
    } else {
        format!("GitHub search failed: {}", msg)
    }
}

fn format_enrichment_error(msg: &str) -> String {
    if msg.starts_with("RATE_LIMITED:") {
        msg.replacen("RATE_LIMITED: ", "", 1)
    } else {
        format!("GitHub PR enrichment failed: {}", msg)
    }
}

/// Produce an ISO-8601 timestamp for "now" without pulling in the chrono crate.
/// Uses `std::time::SystemTime` for a lightweight solution.
fn chrono_now_iso() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let duration = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default();
    let secs = duration.as_secs();
    // Convert to a simple UTC ISO-8601 string
    let days = secs / 86400;
    let time_secs = secs % 86400;
    let hours = time_secs / 3600;
    let minutes = (time_secs % 3600) / 60;
    let seconds = time_secs % 60;

    // Calculate year/month/day from days since epoch (1970-01-01)
    let (year, month, day) = days_to_date(days);

    format!(
        "{:04}-{:02}-{:02}T{:02}:{:02}:{:02}Z",
        year, month, day, hours, minutes, seconds
    )
}

/// Convert days since 1970-01-01 to (year, month, day).
fn days_to_date(days_since_epoch: u64) -> (u64, u64, u64) {
    // Algorithm from Howard Hinnant's chrono-compatible date library
    let z = days_since_epoch + 719468;
    let era = z / 146097;
    let doe = z - era * 146097;
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = if m <= 2 { y + 1 } else { y };
    (y, m, d)
}
