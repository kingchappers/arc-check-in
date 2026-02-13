# Admin Page Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add an admin page that lets authorized users view all volunteer checkins (active and historical).

**Architecture:** Auth0 role-based access control via custom JWT claims. Two new API endpoints using DynamoDB Scan. React frontend with Mantine Tabs, Table, SegmentedControl, and DatePickerInput. The existing checkin handler is updated to store user name/email alongside the session.

**Tech Stack:** Auth0 (roles + Post-Login Action), AWS Lambda, DynamoDB Scan, React 19, Mantine 8, dayjs

---

### Task 1: Store user name and email on checkin

The existing `POST /api/checkin` only stores `userId` and `checkInTime`. The admin page needs name/email to display who's checked in.

**Files:**
- Modify: `api-handler.ts:180-192` (the PutCommand in handleCheckinToggle)

**Step 1: Update the PutCommand to include name and email**

In `api-handler.ts`, find the `PutCommand` inside `handleCheckinToggle` (the check-in branch). Add `userName` and `userEmail` fields from the decoded JWT:

```typescript
// Inside handleCheckinToggle, the "Not checked in - check in" branch:
const checkInTime = new Date().toISOString();
const userName = decoded[`${AUTH0_DOMAIN}/name`] || decoded.name || '';
const userEmail = decoded[`${AUTH0_DOMAIN}/email`] || decoded.email || '';
await docClient.send(new PutCommand({
  TableName: DYNAMODB_TABLE_NAME,
  Item: {
    userId: userId,
    checkInTime: checkInTime,
    userName: userName,
    userEmail: userEmail,
  },
}));
```

Note: `decoded` is not in scope of `handleCheckinToggle` — it only receives `decoded` as a parameter, which already works. The `AUTH0_DOMAIN` constant is module-level and accessible.

**Step 2: Verify the build succeeds**

Run: `yarn typecheck`
Expected: No errors

**Step 3: Commit**

```bash
git add api-handler.ts
git commit -m "feat: store user name and email on checkin for admin visibility"
```

---

### Task 2: Add `isAdmin` helper and admin authorization guard

**Files:**
- Modify: `api-handler.ts` (add helper function and route guard)

**Step 1: Add the AUTH0_NAMESPACE constant and isAdmin helper**

At the top of `api-handler.ts`, after the existing constants:

```typescript
const AUTH0_NAMESPACE = process.env.AUTH0_NAMESPACE || '';

function isAdmin(decoded: any): boolean {
  const roles: string[] = decoded[`${AUTH0_NAMESPACE}/roles`] || [];
  return roles.includes('admin');
}
```

**Step 2: Add admin route guard in the router**

In the `handler` function, after the existing routes and before the 404:

```typescript
// Admin endpoints - require admin role
if (path.startsWith('/api/admin/')) {
  if (!isAdmin(decoded)) {
    return {
      statusCode: 403,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Forbidden: admin role required' }),
    };
  }

  if (path === '/api/admin/checkins/active' && method === 'GET') {
    return handleAdminActiveCheckins();
  }

  if (path === '/api/admin/checkins/history' && method === 'GET') {
    const params = event.queryStringParameters || {};
    return handleAdminCheckinHistory(params.start, params.end);
  }
}
```

**Step 3: Verify the build succeeds**

Run: `yarn typecheck`
Expected: Errors about missing `handleAdminActiveCheckins` and `handleAdminCheckinHistory` — expected, we'll add them in Task 3.

**Step 4: Commit**

```bash
git add api-handler.ts
git commit -m "feat: add admin role check and route guard for admin endpoints"
```

---

### Task 3: Implement admin API endpoints

**Files:**
- Modify: `api-handler.ts` (add ScanCommand import and two handler functions)

**Step 1: Add ScanCommand to imports**

Update the import at line 5:

```typescript
import { DynamoDBDocumentClient, QueryCommand, PutCommand, UpdateCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';
```

**Step 2: Implement handleAdminActiveCheckins**

```typescript
async function handleAdminActiveCheckins() {
  try {
    const result = await docClient.send(new ScanCommand({
      TableName: DYNAMODB_TABLE_NAME,
      FilterExpression: 'attribute_not_exists(checkOutTime)',
    }));

    const sessions = (result.Items || [])
      .sort((a, b) => b.checkInTime.localeCompare(a.checkInTime))
      .map(item => ({
        userId: item.userId,
        userName: item.userName || '',
        userEmail: item.userEmail || '',
        checkInTime: item.checkInTime,
      }));

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessions }),
    };
  } catch (error) {
    console.error('Error fetching active checkins:', error instanceof Error ? error.message : 'Unknown error');
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Internal server error' }),
    };
  }
}
```

**Step 3: Implement handleAdminCheckinHistory**

```typescript
async function handleAdminCheckinHistory(start?: string, end?: string) {
  try {
    if (!start || !end) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'start and end query parameters are required' }),
      };
    }

    const result = await docClient.send(new ScanCommand({
      TableName: DYNAMODB_TABLE_NAME,
      FilterExpression: 'checkInTime BETWEEN :start AND :end',
      ExpressionAttributeValues: {
        ':start': start,
        ':end': end,
      },
    }));

    const sessions = (result.Items || [])
      .sort((a, b) => b.checkInTime.localeCompare(a.checkInTime))
      .map(item => ({
        userId: item.userId,
        userName: item.userName || '',
        userEmail: item.userEmail || '',
        checkInTime: item.checkInTime,
        checkOutTime: item.checkOutTime || null,
      }));

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessions }),
    };
  } catch (error) {
    console.error('Error fetching checkin history:', error instanceof Error ? error.message : 'Unknown error');
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Internal server error' }),
    };
  }
}
```

**Step 4: Verify the build succeeds**

Run: `yarn typecheck`
Expected: No errors

**Step 5: Commit**

```bash
git add api-handler.ts
git commit -m "feat: add admin endpoints for active checkins and history"
```

---

### Task 4: Update infrastructure (IAM + Lambda env vars)

**Files:**
- Modify: `infra/lambda.tf:43` (DynamoDB policy — add Scan permission)
- Modify: `infra/api-lambda.tf:23-29` (Lambda env vars — add AUTH0_NAMESPACE)
- Modify: `infra/variables.tf` (add auth0_namespace variable if not present)

**Step 1: Add dynamodb:Scan to IAM policy**

In `infra/lambda.tf`, find the `aws_iam_role_policy.lambda_dynamodb` resource. Add `"dynamodb:Scan"` to the Action array:

```hcl
Action = [
  "dynamodb:GetItem",
  "dynamodb:PutItem",
  "dynamodb:UpdateItem",
  "dynamodb:Query",
  "dynamodb:Scan"
]
```

**Step 2: Add AUTH0_NAMESPACE env var to API Lambda**

In `infra/api-lambda.tf`, add to the environment variables block:

```hcl
environment {
  variables = {
    NODE_ENV            = "production"
    AUTH0_DOMAIN        = var.auth0_domain
    AUTH0_AUDIENCE      = var.auth0_audience
    DYNAMODB_TABLE_NAME = aws_dynamodb_table.checkin_sessions.name
    AUTH0_NAMESPACE     = var.auth0_namespace
  }
}
```

**Step 3: Add the variable declaration**

Check `infra/variables.tf` for existing variables pattern and add:

```hcl
variable "auth0_namespace" {
  description = "Auth0 custom claims namespace (e.g. https://yourdomain.com)"
  type        = string
}
```

**Step 4: Add the variable to GitHub Actions workflow**

Check `.github/workflows/yarnBuild.yml` for how other Auth0 vars are passed, and add `AUTH0_NAMESPACE` in the same pattern (likely from GitHub Secrets).

**Step 5: Commit**

```bash
git add infra/lambda.tf infra/api-lambda.tf infra/variables.tf
git commit -m "feat: add Scan permission and AUTH0_NAMESPACE env var for admin endpoints"
```

---

### Task 5: Create useAdminRole hook

**Files:**
- Create: `app/hooks/useAdminRole.ts`

**Step 1: Create the hook**

```typescript
import { useAuth0 } from '@auth0/auth0-react';
import { useState, useEffect } from 'react';

export function useAdminRole() {
  const { getIdTokenClaims, isAuthenticated, isLoading } = useAuth0();
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminLoading, setAdminLoading] = useState(true);

  useEffect(() => {
    if (isLoading || !isAuthenticated) {
      setAdminLoading(false);
      return;
    }

    getIdTokenClaims().then(claims => {
      const namespace = import.meta.env.VITE_AUTH0_NAMESPACE || '';
      const roles: string[] = claims?.[`${namespace}/roles`] || [];
      setIsAdmin(roles.includes('admin'));
      setAdminLoading(false);
    });
  }, [getIdTokenClaims, isAuthenticated, isLoading]);

  return { isAdmin, isLoading: adminLoading };
}
```

Note: This requires adding `VITE_AUTH0_NAMESPACE` to the frontend env vars. The `VITE_` prefix makes it available at build time via Vite.

**Step 2: Verify the build**

Run: `yarn typecheck`
Expected: No errors

**Step 3: Commit**

```bash
git add app/hooks/useAdminRole.ts
git commit -m "feat: add useAdminRole hook for checking admin JWT claim"
```

---

### Task 6: Create ActiveCheckins component

**Files:**
- Create: `app/components/admin/ActiveCheckins.tsx`

**Step 1: Create the component**

```typescript
import { useState, useEffect, useCallback } from 'react';
import { Table, Card, Text, Stack, Skeleton, Button, Group } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useAuth0 } from '@auth0/auth0-react';
import { IconRefresh } from '@tabler/icons-react';

interface ActiveSession {
  userId: string;
  userName: string;
  userEmail: string;
  checkInTime: string;
}

export function ActiveCheckins() {
  const { getAccessTokenSilently } = useAuth0();
  const [sessions, setSessions] = useState<ActiveSession[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchActive = useCallback(async () => {
    try {
      const token = await getAccessTokenSilently();
      const response = await fetch('/api/admin/checkins/active', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error('Failed to fetch');
      const data = await response.json();
      setSessions(data.sessions);
    } catch (error) {
      console.error('Failed to fetch active checkins:', error);
      notifications.show({
        title: 'Error',
        message: 'Failed to load active checkins',
        color: 'red',
      });
    } finally {
      setLoading(false);
    }
  }, [getAccessTokenSilently]);

  useEffect(() => {
    fetchActive();
  }, [fetchActive]);

  // Refresh on tab focus
  useEffect(() => {
    const onFocus = () => fetchActive();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [fetchActive]);

  const formatTime = (iso: string) =>
    new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

  if (loading) {
    return (
      <Stack>
        <Skeleton height={20} width="60%" />
        <Skeleton height={200} />
      </Stack>
    );
  }

  return (
    <Stack>
      <Group justify="space-between">
        <Text size="sm" c="dimmed">{sessions.length} volunteer{sessions.length !== 1 ? 's' : ''} checked in</Text>
        <Button variant="subtle" size="xs" leftSection={<IconRefresh size={14} />} onClick={fetchActive}>
          Refresh
        </Button>
      </Group>

      {sessions.length === 0 ? (
        <Card shadow="sm" padding="lg" radius="md" withBorder>
          <Text c="dimmed" ta="center">No one is currently checked in</Text>
        </Card>
      ) : (
        <Card shadow="sm" padding="lg" radius="md" withBorder>
          <Table striped highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Name</Table.Th>
                <Table.Th>Email</Table.Th>
                <Table.Th>Checked In At</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {sessions.map(session => (
                <Table.Tr key={`${session.userId}-${session.checkInTime}`}>
                  <Table.Td>{session.userName || session.userId}</Table.Td>
                  <Table.Td>{session.userEmail || '—'}</Table.Td>
                  <Table.Td>{formatTime(session.checkInTime)}</Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Card>
      )}
    </Stack>
  );
}
```

**Step 2: Verify the build**

Run: `yarn typecheck`
Expected: No errors

**Step 3: Commit**

```bash
git add app/components/admin/ActiveCheckins.tsx
git commit -m "feat: add ActiveCheckins component for admin page"
```

---

### Task 7: Create CheckinHistory component

**Files:**
- Create: `app/components/admin/CheckinHistory.tsx`

**Step 1: Add the dates CSS import to root.tsx**

In `app/root.tsx`, add after the existing CSS imports:

```typescript
import '@mantine/dates/styles.css';
```

**Step 2: Create the component**

```typescript
import { useState, useCallback } from 'react';
import { Table, Card, Text, Stack, Skeleton, Button, Group, Badge, SegmentedControl } from '@mantine/core';
import { DatePickerInput } from '@mantine/dates';
import { notifications } from '@mantine/notifications';
import { useAuth0 } from '@auth0/auth0-react';
import { IconSearch } from '@tabler/icons-react';
import dayjs from 'dayjs';

interface HistorySession {
  userId: string;
  userName: string;
  userEmail: string;
  checkInTime: string;
  checkOutTime: string | null;
}

type PresetRange = 'today' | 'week' | 'month';

function getPresetDates(preset: PresetRange): [Date, Date] {
  const now = dayjs();
  switch (preset) {
    case 'today':
      return [now.startOf('day').toDate(), now.endOf('day').toDate()];
    case 'week':
      return [now.startOf('week').toDate(), now.endOf('day').toDate()];
    case 'month':
      return [now.startOf('month').toDate(), now.endOf('day').toDate()];
  }
}

export function CheckinHistory() {
  const { getAccessTokenSilently } = useAuth0();
  const [sessions, setSessions] = useState<HistorySession[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasFetched, setHasFetched] = useState(false);
  const [preset, setPreset] = useState<PresetRange>('today');
  const [dateRange, setDateRange] = useState<[Date | null, Date | null]>(
    getPresetDates('today')
  );

  const fetchHistory = useCallback(async (start: Date, end: Date) => {
    setLoading(true);
    try {
      const token = await getAccessTokenSilently();
      const params = new URLSearchParams({
        start: start.toISOString(),
        end: end.toISOString(),
      });
      const response = await fetch(`/api/admin/checkins/history?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error('Failed to fetch');
      const data = await response.json();
      setSessions(data.sessions);
      setHasFetched(true);
    } catch (error) {
      console.error('Failed to fetch checkin history:', error);
      notifications.show({
        title: 'Error',
        message: 'Failed to load checkin history',
        color: 'red',
      });
    } finally {
      setLoading(false);
    }
  }, [getAccessTokenSilently]);

  const handlePresetChange = (value: string) => {
    const p = value as PresetRange;
    setPreset(p);
    const [start, end] = getPresetDates(p);
    setDateRange([start, end]);
    fetchHistory(start, end);
  };

  const handleSearch = () => {
    if (dateRange[0] && dateRange[1]) {
      // Ensure end date covers the full day
      const end = dayjs(dateRange[1]).endOf('day').toDate();
      fetchHistory(dateRange[0], end);
    }
  };

  const formatDateTime = (iso: string) =>
    new Date(iso).toLocaleString([], {
      month: 'short', day: 'numeric',
      hour: 'numeric', minute: '2-digit',
    });

  return (
    <Stack>
      <Group>
        <SegmentedControl
          value={preset}
          onChange={handlePresetChange}
          data={[
            { label: 'Today', value: 'today' },
            { label: 'This Week', value: 'week' },
            { label: 'This Month', value: 'month' },
          ]}
        />
      </Group>

      <Group>
        <DatePickerInput
          type="range"
          label="Custom range"
          value={dateRange}
          onChange={(value) => {
            setDateRange(value);
            setPreset('' as PresetRange); // Deselect preset
          }}
        />
        <Button
          leftSection={<IconSearch size={14} />}
          onClick={handleSearch}
          disabled={!dateRange[0] || !dateRange[1]}
          mt="auto"
        >
          Search
        </Button>
      </Group>

      {loading ? (
        <Stack>
          <Skeleton height={20} width="60%" />
          <Skeleton height={200} />
        </Stack>
      ) : !hasFetched ? (
        <Card shadow="sm" padding="lg" radius="md" withBorder>
          <Text c="dimmed" ta="center">Select a date range to view checkin history</Text>
        </Card>
      ) : sessions.length === 0 ? (
        <Card shadow="sm" padding="lg" radius="md" withBorder>
          <Text c="dimmed" ta="center">No checkins found for this period</Text>
        </Card>
      ) : (
        <Card shadow="sm" padding="lg" radius="md" withBorder>
          <Text size="sm" c="dimmed" mb="sm">{sessions.length} checkin{sessions.length !== 1 ? 's' : ''} found</Text>
          <Table striped highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Name</Table.Th>
                <Table.Th>Email</Table.Th>
                <Table.Th>Checked In At</Table.Th>
                <Table.Th>Checked Out At</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {sessions.map(session => (
                <Table.Tr key={`${session.userId}-${session.checkInTime}`}>
                  <Table.Td>{session.userName || session.userId}</Table.Td>
                  <Table.Td>{session.userEmail || '—'}</Table.Td>
                  <Table.Td>{formatDateTime(session.checkInTime)}</Table.Td>
                  <Table.Td>
                    {session.checkOutTime
                      ? formatDateTime(session.checkOutTime)
                      : <Badge color="green" variant="light">Still checked in</Badge>
                    }
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Card>
      )}
    </Stack>
  );
}
```

**Step 3: Verify the build**

Run: `yarn typecheck`
Expected: No errors

**Step 4: Commit**

```bash
git add app/root.tsx app/components/admin/CheckinHistory.tsx
git commit -m "feat: add CheckinHistory component with date range filtering"
```

---

### Task 8: Create admin route page

**Files:**
- Create: `app/routes/admin.tsx`

**Step 1: Create the admin page**

```typescript
import { StrictMode } from 'react';
import { useAuth0 } from '@auth0/auth0-react';
import { Center, Loader, Text, Tabs, Title, Stack, Card } from '@mantine/core';
import { IconUsers, IconHistory } from '@tabler/icons-react';
import { DefaultLayout } from '~/components/layout/DefaultLayout';
import { useAdminRole } from '~/hooks/useAdminRole';
import { ActiveCheckins } from '~/components/admin/ActiveCheckins';
import { CheckinHistory } from '~/components/admin/CheckinHistory';

function AdminContent() {
  const { isAuthenticated, isLoading: authLoading } = useAuth0();
  const { isAdmin, isLoading: adminLoading } = useAdminRole();

  if (authLoading || adminLoading) {
    return (
      <Center py="xl">
        <Loader />
      </Center>
    );
  }

  if (!isAuthenticated) {
    return <Text>Please log in to access this page.</Text>;
  }

  if (!isAdmin) {
    return (
      <Card shadow="sm" padding="lg" radius="md" withBorder>
        <Text c="red" fw={500}>Not Authorized</Text>
        <Text c="dimmed" size="sm">You do not have permission to view this page.</Text>
      </Card>
    );
  }

  return (
    <Stack>
      <Title order={2}>Admin Dashboard</Title>
      <Tabs defaultValue="active">
        <Tabs.List>
          <Tabs.Tab value="active" leftSection={<IconUsers size={16} />}>
            Currently Checked In
          </Tabs.Tab>
          <Tabs.Tab value="history" leftSection={<IconHistory size={16} />}>
            Check-In History
          </Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="active" pt="md">
          <ActiveCheckins />
        </Tabs.Panel>

        <Tabs.Panel value="history" pt="md">
          <CheckinHistory />
        </Tabs.Panel>
      </Tabs>
    </Stack>
  );
}

export default function Admin() {
  return (
    <StrictMode>
      <DefaultLayout>
        <AdminContent />
      </DefaultLayout>
    </StrictMode>
  );
}
```

**Step 2: Verify the build**

Run: `yarn typecheck`
Expected: No errors

**Step 3: Commit**

```bash
git add app/routes/admin.tsx
git commit -m "feat: add admin route with tabbed checkin views"
```

---

### Task 9: Add admin link to sidebar (conditional on role)

**Files:**
- Modify: `app/components/layout/DefaultLayout.tsx`

**Step 1: Add conditional admin NavLink**

Import `useAdminRole` and `IconShieldCheck` at the top:

```typescript
import { useAdminRole } from '~/hooks/useAdminRole';
import { IconHome2, IconSettings, IconShieldCheck } from '@tabler/icons-react';
```

The sidebar needs the admin role check, but `useAdminRole` uses `useAuth0` which requires Auth0Provider. Since DefaultLayout wraps its children in Auth0Provider, the NavLink rendering is inside the provider — but the navbar itself is also inside. So we need to extract the navbar into a child component that can use hooks.

Create a `NavbarContent` component inside DefaultLayout:

```typescript
function NavbarContent() {
  const { isAdmin } = useAdminRole();

  return (
    <>
      <NavLink href="/"
        label="Home"
        color="white"
        style={{ color: 'white' }}
        leftSection={<IconHome2 size={16} stroke={1.5} color="white" />} />
      <NavLink href="/test"
        label="Test"
        color="white"
        style={{ color: 'white' }}
        leftSection={<IconSettings size={16} stroke={1.5} color="white" />} />
      {isAdmin && (
        <NavLink href="/admin"
          label="Admin"
          color="white"
          style={{ color: 'white' }}
          leftSection={<IconShieldCheck size={16} stroke={1.5} color="white" />} />
      )}
    </>
  );
}
```

Then replace the inline NavLinks in the AppShell.Navbar with `<NavbarContent />`.

**Step 2: Verify the build**

Run: `yarn typecheck`
Expected: No errors

**Step 3: Commit**

```bash
git add app/components/layout/DefaultLayout.tsx
git commit -m "feat: show admin nav link only for admin users"
```

---

### Task 10: Add VITE_AUTH0_NAMESPACE to frontend env config

**Files:**
- Modify: `.github/workflows/yarnBuild.yml` (add VITE_AUTH0_NAMESPACE to build env)

**Step 1: Check the workflow file for how other VITE_ vars are set**

Look at how `VITE_AUTH0_DOMAIN`, `VITE_AUTH0_CLIENT_ID`, `VITE_AUTH0_AUDIENCE` are set in the workflow and add `VITE_AUTH0_NAMESPACE` in the same pattern using a GitHub Secret.

**Step 2: Commit**

```bash
git add .github/workflows/yarnBuild.yml
git commit -m "chore: add VITE_AUTH0_NAMESPACE to build environment"
```

---

### Task 11: Verify full build and typecheck

**Step 1: Run typecheck**

Run: `yarn typecheck`
Expected: No errors

**Step 2: Run build**

Run: `yarn build`
Expected: Build completes successfully

**Step 3: Final commit if any fixes needed**

---

## Manual Steps (not automated)

These must be done by the developer in the Auth0 dashboard and GitHub:

1. **Auth0 Dashboard:** Create `admin` role under User Management > Roles
2. **Auth0 Dashboard:** Assign the role to admin users
3. **Auth0 Dashboard:** Create a Post-Login Action that adds roles to the token:
   ```javascript
   exports.onExecutePostLogin = async (event, api) => {
     const namespace = 'https://your-namespace.com';
     const roles = event.authorization?.roles || [];
     api.idToken.setCustomClaim(`${namespace}/roles`, roles);
     api.accessToken.setCustomClaim(`${namespace}/roles`, roles);
   };
   ```
4. **GitHub Secrets:** Add `AUTH0_NAMESPACE` and `VITE_AUTH0_NAMESPACE` secrets
5. **Local .env:** Add `VITE_AUTH0_NAMESPACE=https://your-namespace.com` for local dev
