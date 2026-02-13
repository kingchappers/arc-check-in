# Admin Page Design

## Overview

Add an admin page allowing authorized users to view all volunteer checkins. Two tabbed views: currently checked-in users and historical checkin records with date filtering.

## Auth0 Admin Role

- Create `admin` role in Auth0 dashboard and assign to users
- Add Post-Login Action injecting roles into JWT as custom claim: `https://<domain>/roles: ["admin"]`
- Backend extracts roles claim from decoded JWT
- `isAdmin()` helper checks for `admin` role
- Admin endpoints (`/api/admin/*`) return 403 for non-admin users
- Frontend route guard on `/admin` — non-admins see "Not Authorized"
- Sidebar "Admin" link only renders for admin users

## API Endpoints

### `GET /api/admin/checkins/active`

Returns all currently checked-in users (sessions without checkOutTime).

DynamoDB Scan with FilterExpression. Returns `[{ userId, name, email, checkInTime }]`.

### `GET /api/admin/checkins/history?start=<iso>&end=<iso>`

Returns checkins within a date range.

DynamoDB Scan with FilterExpression on checkInTime. Returns `[{ userId, name, email, checkInTime, checkOutTime }]`.

## Infrastructure Changes

- Add `dynamodb:Scan` to Lambda IAM policy
- Add `AUTH0_NAMESPACE` env var to Lambda (custom claims namespace)

## Frontend

### Route: `app/routes/admin.tsx`

Admin page with Mantine Tabs component.

### Tab 1: Currently Checked In

- Mantine Table: Name | Email | Checked In At
- Sorted by check-in time descending
- Auto-refresh on tab focus, manual refresh button
- Empty state: "No one is currently checked in"

### Tab 2: Check-In History

- Preset range buttons: Today | This Week | This Month (SegmentedControl)
- Custom date range picker (DatePickerInput with type="range")
- Table: Name | Email | Checked In At | Checked Out At
- "Still checked in" badge when no checkout time
- Sorted by check-in time descending
- Empty state: "No checkins found for this period"

### New Files

- `app/routes/admin.tsx` — admin page
- `app/components/admin/AdminCheckins.tsx` — active checkins table
- `app/components/admin/CheckinHistory.tsx` — history table with date filter
- `app/hooks/useAdminRole.ts` — hook to check admin role from JWT

### Sidebar

"Admin" nav link conditionally rendered for admin users.

## Out of Scope

- No GSI (scan sufficient at this scale)
- No admin actions (view-only)
- No export/download
