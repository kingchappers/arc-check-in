# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Security Requirements

**You must follow the security best practices defined in [SECURITY.md](./SECURITY.md).** This includes OWASP Top 10:2025 mitigations, serverless security controls, and application-specific requirements. Before making code changes, review the relevant sections for JWT handling, input validation, IAM permissions, and dependency management.

## Project Overview

ARC Check-In is a volunteer check-in web application for a charity organization. It's a full-stack serverless application with a React SPA frontend, Auth0 authentication, and AWS Lambda backend deployed with OpenTofu.

## Commands

```bash
yarn dev          # Start local development server with hot reload
yarn build        # Production build (React + static handler + API handler)
yarn start        # Serve built application locally
yarn typecheck    # TypeScript type checking with React Router type generation
```

## Tech Stack

- **Frontend:** React 19, React Router 7 (file-based routing, SPA mode), Mantine 8, Tailwind CSS, TypeScript
- **Authentication:** Auth0 React SDK with JWT validation
- **Backend:** AWS Lambda (Node.js 24.x), API Gateway v2, DynamoDB
- **Infrastructure:** OpenTofu (Terraform-compatible), S3 state backend

## Architecture

```
Browser → API Gateway (HTTP v2)
    ├→ Route: $default → Static File Server Lambda → serve React SPA
    └→ Route: /api/* → Protected API Lambda → validate JWT & handle requests
```

### Key Directories

- `app/` - React application source
  - `routes/` - File-based routes (`_index.tsx` → home page)
  - `components/` - React components (authentication, layout, checkin, admin)
  - `hooks/` - Custom hooks including `useProtectedApi` for authenticated API calls
  - `root.tsx` - Root layout with Mantine theme configuration
- `infra/` - OpenTofu infrastructure (Lambda, API Gateway, DynamoDB, IAM)
- `scripts/` - Build scripts for handler injection and API bundling
- `handler.ts` - Static file server Lambda handler (source)
- `api-handler.ts` - Protected API Lambda handler (source)

### Build Process

The build is a three-stage pipeline:
1. `react-router build` - Compiles React/TypeScript with Vite
2. `scripts/inject-handler.cjs` - Injects static file handler into `build/client/index.js`
3. `scripts/build-api-handler.cjs` - Compiles API handler with dependencies to `build/api/`

### Authentication Flow

1. Auth0Provider wraps app in `DefaultLayout`
2. User authenticates via Auth0, receives JWT
3. `useProtectedApi()` hook attaches JWT in Authorization header
4. Lambda validates JWT signature using Auth0's JWKS endpoint

### API Endpoints (`api-handler.ts`)

- `GET /api/checkin/status` - Returns current check-in state (`{ checkedIn, currentSession }`)
- `POST /api/checkin` - Toggles check-in/check-out (race-condition protected via DynamoDB ConditionExpression)
- `GET /api/checkin/history` - Returns last 50 check-in sessions for the user
- `GET /api/user-info` - Returns user profile (name, email) from JWT claims
- `GET /api/admin/checkins/active` - Returns all currently checked-in users (admin only)
- `GET /api/admin/checkins/history?start=&end=` - Returns checkins within date range (admin only)

### Data Model (DynamoDB)

Table `arc-check-in-checkin-sessions`: `userId` (PK) + `checkInTime` (SK). Check-out adds a `checkOutTime` attribute.

## Environment Variables

**Frontend (Vite compile-time):**
- `VITE_AUTH0_DOMAIN`, `VITE_AUTH0_CLIENT_ID`, `VITE_AUTH0_AUDIENCE`, `VITE_AUTH0_NAMESPACE`

**Lambda (runtime):**
- `AUTH0_DOMAIN`, `AUTH0_AUDIENCE`, `AUTH0_NAMESPACE`, `NODE_ENV`, `DYNAMODB_TABLE_NAME`

## CI/CD

GitHub Actions workflow (`.github/workflows/yarnBuild.yml`) builds and deploys on push to `main`. Uses OIDC for AWS authentication. Auth0 credentials stored in GitHub Secrets.

## Path Aliases

TypeScript configured with `~/*` → `./app/*` (e.g., `import { useProtectedApi } from "~/hooks/useProtectedApi"`)
