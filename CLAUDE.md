# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

GH Dash is a GitHub PR dashboard built with Next.js 16 that shows whose turn it is on every pull request. It integrates Clerk for authentication (OAuth + optional PAT) and the GitHub Search/REST API for PR data.

## Commands

```bash
bun run dev        # Start dev server (Turbopack)
bun run build      # Production build
bun run start      # Start production server
bun run lint       # ESLint (next lint)
```

Bun is the package manager (`bun add`, `bun install`). Node 22 is the runtime (provisioned via Nix flake).

No test framework is configured yet.

## Architecture

### Data Flow

1. `usePolling` hook in `dashboard.tsx` fetches `/api/prs` every 30 seconds
2. API route (`src/app/api/prs/route.ts`) authenticates via Clerk, gets a GitHub OAuth token, runs three parallel GitHub Search API queries (my PRs, review-requested, reviewed-by), deduplicates, enriches each PR with review details, determines turn status, and returns a `DashboardResponse`
3. Dashboard renders PRs grouped into "My PRs" and "Review Requests" sections, sorted by turn status (my-turn first)

### Turn Logic

- **My PRs**: `my-turn` if any reviews have been submitted (feedback to address); `their-turn` otherwise
- **Review Requests**: `my-turn` if my review is still pending/requested; `their-turn` otherwise

### Key Directories

- `src/app/api/prs/` — Server-side API route (GitHub API calls, Clerk auth)
- `src/components/` — Client components (`"use client"`) for dashboard UI
- `src/components/ui/` — shadcn/ui primitives (Card, Badge, Avatar, Alert, Select, etc.)
- `src/hooks/` — `usePolling` (data fetching with visibility-aware polling), `useAuthMethod` (OAuth/PAT selection persisted in localStorage)
- `src/lib/github.ts` — GitHub API client functions (search queries, review enrichment)
- `src/lib/types.ts` — All TypeScript types (`DashboardPR`, `DashboardResponse`, `DashboardError`, `TurnStatus`, GitHub API types)

### Styling

Tailwind CSS v4 with `@tailwindcss/postcss`. Colors use OKLCH color space defined as CSS variables in `src/app/globals.css`. Dark mode via `.dark` class. Component variants use `class-variance-authority`. The `cn()` utility (`src/lib/utils.ts`) merges classes via `clsx` + `tailwind-merge`.

### Auth

Clerk handles authentication. The middleware (`src/middleware.ts`) protects API routes. Two auth methods: Clerk OAuth (default) or Personal Access Token via `NEXT_PUBLIC_PAT` env var. GitHub username is resolved from Clerk external accounts.

### Environment Variables

- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` / `CLERK_SECRET_KEY` — Clerk auth
- `NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL` / `NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL` — Clerk redirects
- `NEXT_PUBLIC_PAT` — Optional GitHub Personal Access Token (bypasses OAuth)

### Path Alias

`@/*` maps to `./src/*` (configured in tsconfig.json).
