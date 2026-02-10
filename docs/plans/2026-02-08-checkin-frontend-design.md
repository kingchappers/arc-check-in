# Check-In Frontend Design

## Overview

Add a check-in UI to the home page, allowing authenticated volunteers to toggle their check-in status via a card component with a button, timestamp display, and toast notifications.

## Requirements

- Dashboard-style card on home page with check-in toggle button
- Show "Checked in since HH:MM AM/PM" when active
- Toast notifications on successful check-in/check-out
- Loading states during API calls
- Unauthenticated users see login prompt only

## Component Structure

### `CheckInCard` (`app/components/checkin/CheckInCard.tsx`)

A Mantine `Card` containing:
- Status text: "Checked in since 10:30 AM" or "Not checked in"
- Toggle button: "Check In" (green) / "Check Out" (red)
- Loading spinner on button during API calls
- Success toast via `@mantine/notifications`

### Home Page (`app/routes/_index.tsx`)

- Authenticated: render `CheckInCard` in dashboard layout
- Not authenticated: login prompt

## Data Flow

### On page load (authenticated)

1. Call `GET /api/checkin/status` via `useProtectedApi` hook
2. Set local state: `checkedIn` (boolean), `checkInTime` (string | null)
3. Show loading skeleton in card while fetching

### On button click

1. Set button to loading state (spinner, disabled)
2. Call `POST /api/checkin`
3. On success: update state from response, show toast ("Checked in!" / "Checked out!")
4. On 409 (race condition): re-fetch status, show toast ("Status updated, please try again")
5. On error: show error toast ("Something went wrong"), keep previous state

### Timestamp display

- Format ISO string to local time via `Date.toLocaleTimeString()`
- Only shown when checked in

## Dependencies

- `@mantine/notifications` (new) - toast notifications
- `Notifications` provider added to root layout

## Styling

- Mantine component props for component styling (color, size, variant)
- Tailwind for layout (spacing, centering)
- Button colors: green for "Check In", red for "Check Out"
- Standard Mantine `Card` with shadow, padding, radius

## Button States

| State | Color | Text | Disabled |
|-------|-------|------|----------|
| Not checked in | Green | Check In | No |
| Checked in | Red | Check Out | No |
| Loading (check in) | Green | Checking in... | Yes (with spinner) |
| Loading (check out) | Red | Checking out... | Yes (with spinner) |
