export type TurnStatus = "my-turn" | "their-turn";

// GitHub API response types

export interface GitHubUser {
  login: string;
  avatar_url: string;
  id: number;
}

export interface GitHubReview {
  id: number;
  user: GitHubUser;
  state:
    | "APPROVED"
    | "CHANGES_REQUESTED"
    | "COMMENTED"
    | "DISMISSED"
    | "PENDING";
  submitted_at: string;
}

export interface GitHubRequestedReviewersResponse {
  users: GitHubUser[];
  teams: Array<{ name: string; slug: string }>;
}

export interface GitHubSearchItem {
  id: number;
  number: number;
  title: string;
  html_url: string;
  state: string;
  created_at: string;
  updated_at: string;
  draft: boolean;
  user: GitHubUser;
  repository_url: string; // e.g. "https://api.github.com/repos/owner/repo"
  pull_request: {
    url: string;
    html_url: string;
  };
  labels: Array<{
    name: string;
    color: string;
  }>;
}

export interface GitHubSearchResponse {
  total_count: number;
  incomplete_results: boolean;
  items: GitHubSearchItem[];
}

// Dashboard types (what the API route returns to the client)

export interface DashboardPR {
  id: number;
  number: number;
  title: string;
  url: string;
  repo: string; // "owner/repo"
  author: {
    login: string;
    avatarUrl: string;
  };
  turnStatus: TurnStatus;
  isDraft: boolean;
  createdAt: string;
  updatedAt: string;
  labels: Array<{
    name: string;
    color: string;
  }>;
  reviewSummary: string; // e.g. "2 approved, 1 changes requested"
}

export interface DashboardResponse {
  myPrs: DashboardPR[];
  reviewRequests: DashboardPR[];
  githubUsername: string;
  fetchedAt: string;
}

export type ErrorCode =
  | "NO_GITHUB_ACCOUNT"
  | "TOKEN_EXPIRED"
  | "GITHUB_API_ERROR"
  | "UNAUTHORIZED";

export interface DashboardError {
  error: string;
  code: ErrorCode;
}
