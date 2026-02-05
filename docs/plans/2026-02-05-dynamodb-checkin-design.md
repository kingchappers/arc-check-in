# DynamoDB Check-In System Design

## Overview

Implement a DynamoDB-backed check-in system that allows volunteers to check in and out, tracking full session history for volunteer hour reporting.

## Requirements

- Manual toggle: users click to check in/out (time clock model)
- Full history: track every session with timestamps
- Single record per session: one record with `checkInTime` and `checkOutTime`
- MVP endpoints: toggle and status only

## DynamoDB Table Design

**Table: `arc-checkin-sessions`**

| Attribute | Type | Role | Description |
|-----------|------|------|-------------|
| `userId` | String | Partition Key | Auth0 `sub` claim |
| `checkInTime` | String | Sort Key | ISO 8601 timestamp |
| `checkOutTime` | String | Attribute | ISO 8601 timestamp, null while checked in |

**Access patterns:**
- Get current status: Query by `userId`, sort descending, limit 1, check if `checkOutTime` is null
- Check in: PutItem with new session
- Check out: UpdateItem to set `checkOutTime` on current session

## API Endpoints

### `GET /api/checkin/status`

Returns current check-in status for authenticated user.

**Response:**
```json
{
  "checkedIn": true,
  "currentSession": {
    "checkInTime": "2026-02-05T10:30:00.000Z"
  }
}
```

Or if not checked in:
```json
{
  "checkedIn": false,
  "currentSession": null
}
```

### `POST /api/checkin`

Toggles check-in status. No request body needed (user ID from JWT).

**Logic:**
1. Query current status (most recent session)
2. If not checked in: create new session with `checkInTime = now`
3. If checked in: update session with `checkOutTime = now`

**Response:**
```json
{
  "checkedIn": true,
  "session": {
    "checkInTime": "2026-02-05T10:30:00.000Z",
    "checkOutTime": null
  }
}
```

## Infrastructure

### DynamoDB Table (`infra/dynamodb.tf`)

- Billing mode: PAY_PER_REQUEST (on-demand)
- Point-in-time recovery: enabled
- No GSI needed for MVP

### IAM Permissions

Add to existing Lambda role (scoped to table ARN):
- `dynamodb:GetItem`
- `dynamodb:PutItem`
- `dynamodb:UpdateItem`
- `dynamodb:Query`

### Environment Variables

Add to API Lambda:
- `DYNAMODB_TABLE_NAME`: Table name for runtime access

## Implementation Plan

### Files to create:
- `infra/dynamodb.tf` - DynamoDB table definition

### Files to modify:
- `infra/api-lambda.tf` - IAM permissions, env var
- `api-handler.ts` - New endpoints with AWS SDK

### Dependencies to add:
- `@aws-sdk/client-dynamodb`
- `@aws-sdk/lib-dynamodb`

## Security Considerations

- All queries scoped to authenticated user's `userId` (from JWT `sub` claim)
- IAM permissions follow least privilege (specific table, specific actions)
- No user input used in queries beyond the JWT-verified user ID
- DynamoDB SDK uses parameterized operations (no injection risk)
- Error details logged server-side, generic messages returned to client
