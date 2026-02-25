export type TurnStatus = "my-turn" | "their-turn";

export interface TurnDebugCheck {
  label: string;
  value: string;
  result: "my-turn" | "their-turn" | "skip";
}

export interface TurnDebugInfo {
  section: "my-prs" | "review-requests";
  checks: TurnDebugCheck[];
  decidingCheck: string;
}

export interface DashboardPR {
  id: number;
  number: number;
  title: string;
  url: string;
  repo: string;
  author: {
    login: string;
    avatarUrl: string;
  };
  turnStatus: TurnStatus;
  turnDebugInfo?: TurnDebugInfo;
  isDraft: boolean;
  createdAt: string;
  updatedAt: string;
  labels: Array<{
    name: string;
    color: string;
  }>;
  reviewSummary: string;
}

export interface DashboardResponse {
  myPrs: DashboardPR[];
  reviewRequests: DashboardPR[];
  githubUsername: string;
  fetchedAt: string;
}

export interface AppConfig {
  github_pat: string;
  poll_interval_ms: number;
}

export type ViewMode = "unified" | "split";
