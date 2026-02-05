# DynamoDB Check-In Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add DynamoDB-backed check-in/check-out functionality with session history tracking.

**Architecture:** DynamoDB table stores check-in sessions with userId (partition key) and checkInTime (sort key). API Lambda gets new endpoints to toggle status and query current state. IAM permissions scoped to specific DynamoDB actions on the table.

**Tech Stack:** AWS DynamoDB, AWS SDK v3 (`@aws-sdk/client-dynamodb`, `@aws-sdk/lib-dynamodb`), OpenTofu

---

## Task 1: Add AWS SDK Dependencies

**Files:**
- Modify: `package.json`

**Step 1: Install AWS SDK packages**

Run:
```bash
yarn add @aws-sdk/client-dynamodb @aws-sdk/lib-dynamodb
```

**Step 2: Verify installation**

Run:
```bash
yarn typecheck
```
Expected: No errors

**Step 3: Commit**

```bash
git add package.json yarn.lock
git commit -m "add AWS SDK v3 DynamoDB dependencies"
```

---

## Task 2: Create DynamoDB Table Infrastructure

**Files:**
- Create: `infra/dynamodb.tf`

**Step 1: Create the DynamoDB table resource**

Create `infra/dynamodb.tf`:

```hcl
# ============================================================================
# DynamoDB Table for Check-In Sessions
# ============================================================================

resource "aws_dynamodb_table" "checkin_sessions" {
  name         = "${var.app_name}-checkin-sessions"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "userId"
  range_key    = "checkInTime"

  attribute {
    name = "userId"
    type = "S"
  }

  attribute {
    name = "checkInTime"
    type = "S"
  }

  point_in_time_recovery {
    enabled = true
  }

  tags = {
    Environment = var.environment
    ManagedBy   = "OpenTofu"
  }
}

output "dynamodb_table_name" {
  value       = aws_dynamodb_table.checkin_sessions.name
  description = "DynamoDB table name for check-in sessions"
}

output "dynamodb_table_arn" {
  value       = aws_dynamodb_table.checkin_sessions.arn
  description = "DynamoDB table ARN for check-in sessions"
}
```

**Step 2: Validate OpenTofu syntax**

Run:
```bash
cd infra && tofu validate
```
Expected: "Success! The configuration is valid."

**Step 3: Commit**

```bash
git add infra/dynamodb.tf
git commit -m "add DynamoDB table for check-in sessions"
```

---

## Task 3: Add IAM Permissions for Lambda

**Files:**
- Modify: `infra/lambda.tf` (add IAM policy after line 31)

**Step 1: Add DynamoDB IAM policy**

Add after the `aws_iam_role_policy_attachment.lambda_basic_execution` resource in `infra/lambda.tf`:

```hcl
# DynamoDB access policy for Lambda
resource "aws_iam_role_policy" "lambda_dynamodb" {
  name = "${var.app_name}-lambda-dynamodb-policy"
  role = aws_iam_role.lambda_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "dynamodb:GetItem",
          "dynamodb:PutItem",
          "dynamodb:UpdateItem",
          "dynamodb:Query"
        ]
        Resource = aws_dynamodb_table.checkin_sessions.arn
      }
    ]
  })
}
```

**Step 2: Validate OpenTofu syntax**

Run:
```bash
cd infra && tofu validate
```
Expected: "Success! The configuration is valid."

**Step 3: Commit**

```bash
git add infra/lambda.tf
git commit -m "add DynamoDB IAM permissions for Lambda"
```

---

## Task 4: Add Environment Variable to API Lambda

**Files:**
- Modify: `infra/api-lambda.tf` (update environment block around line 23-28)

**Step 1: Add DYNAMODB_TABLE_NAME to Lambda environment**

Update the `environment` block in `aws_lambda_function.api` resource:

```hcl
  environment {
    variables = {
      NODE_ENV            = "production"
      AUTH0_DOMAIN        = var.auth0_domain
      AUTH0_AUDIENCE      = var.auth0_audience
      DYNAMODB_TABLE_NAME = aws_dynamodb_table.checkin_sessions.name
    }
  }
```

**Step 2: Validate OpenTofu syntax**

Run:
```bash
cd infra && tofu validate
```
Expected: "Success! The configuration is valid."

**Step 3: Commit**

```bash
git add infra/api-lambda.tf
git commit -m "add DYNAMODB_TABLE_NAME environment variable to API Lambda"
```

---

## Task 5: Implement Check-In Status Endpoint

**Files:**
- Modify: `api-handler.ts`

**Step 1: Add DynamoDB imports and client**

Add at the top of `api-handler.ts` after existing imports:

```typescript
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand, PutCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';

const DYNAMODB_TABLE_NAME = process.env.DYNAMODB_TABLE_NAME || '';

// Create DynamoDB client
const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);
```

**Step 2: Add helper function to get current session**

Add before the `handleTestEndpoint` function:

```typescript
async function getCurrentSession(userId: string) {
  const result = await docClient.send(new QueryCommand({
    TableName: DYNAMODB_TABLE_NAME,
    KeyConditionExpression: 'userId = :userId',
    ExpressionAttributeValues: {
      ':userId': userId,
    },
    ScanIndexForward: false, // Sort descending (most recent first)
    Limit: 1,
  }));

  const session = result.Items?.[0];
  if (session && !session.checkOutTime) {
    return session; // Currently checked in
  }
  return null; // Not checked in
}
```

**Step 3: Add status endpoint handler**

Add after the `getCurrentSession` function:

```typescript
async function handleCheckinStatus(decoded: any) {
  try {
    const userId = decoded.sub;
    const currentSession = await getCurrentSession(userId);

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        checkedIn: !!currentSession,
        currentSession: currentSession ? {
          checkInTime: currentSession.checkInTime,
        } : null,
      }),
    };
  } catch (error) {
    console.error('Error getting check-in status:', error instanceof Error ? error.message : 'Unknown error');
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Internal server error' }),
    };
  }
}
```

**Step 4: Add route for status endpoint**

Add in the handler's routing section (after the `/api/user-info` check):

```typescript
    if (path === '/api/checkin/status') {
      return handleCheckinStatus(decoded);
    }
```

**Step 5: Run typecheck**

Run:
```bash
yarn typecheck
```
Expected: No errors

**Step 6: Commit**

```bash
git add api-handler.ts
git commit -m "add GET /api/checkin/status endpoint"
```

---

## Task 6: Implement Check-In Toggle Endpoint

**Files:**
- Modify: `api-handler.ts`

**Step 1: Add toggle endpoint handler**

Add after the `handleCheckinStatus` function:

```typescript
async function handleCheckinToggle(decoded: any) {
  try {
    const userId = decoded.sub;
    const currentSession = await getCurrentSession(userId);

    if (currentSession) {
      // Currently checked in - check out
      const checkOutTime = new Date().toISOString();
      await docClient.send(new UpdateCommand({
        TableName: DYNAMODB_TABLE_NAME,
        Key: {
          userId: userId,
          checkInTime: currentSession.checkInTime,
        },
        UpdateExpression: 'SET checkOutTime = :checkOutTime',
        ExpressionAttributeValues: {
          ':checkOutTime': checkOutTime,
        },
      }));

      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          checkedIn: false,
          session: {
            checkInTime: currentSession.checkInTime,
            checkOutTime: checkOutTime,
          },
        }),
      };
    } else {
      // Not checked in - check in
      const checkInTime = new Date().toISOString();
      await docClient.send(new PutCommand({
        TableName: DYNAMODB_TABLE_NAME,
        Item: {
          userId: userId,
          checkInTime: checkInTime,
          checkOutTime: null,
        },
      }));

      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          checkedIn: true,
          session: {
            checkInTime: checkInTime,
            checkOutTime: null,
          },
        }),
      };
    }
  } catch (error) {
    console.error('Error toggling check-in:', error instanceof Error ? error.message : 'Unknown error');
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Internal server error' }),
    };
  }
}
```

**Step 2: Add route for toggle endpoint**

Add in the handler's routing section (after the `/api/checkin/status` check):

```typescript
    if (path === '/api/checkin') {
      return handleCheckinToggle(decoded);
    }
```

**Step 3: Run typecheck**

Run:
```bash
yarn typecheck
```
Expected: No errors

**Step 4: Commit**

```bash
git add api-handler.ts
git commit -m "add POST /api/checkin toggle endpoint"
```

---

## Task 7: Build and Verify

**Files:**
- None (verification only)

**Step 1: Run full build**

Run:
```bash
yarn build
```
Expected: Build completes successfully, outputs to `build/` directory

**Step 2: Verify API bundle includes DynamoDB SDK**

Run:
```bash
ls -la build/api/
```
Expected: `index.js` exists and is larger than before (includes AWS SDK)

**Step 3: Final typecheck**

Run:
```bash
yarn typecheck
```
Expected: No errors

**Step 4: Commit any build-related changes (if any)**

If package.json scripts were modified:
```bash
git add -A
git commit -m "build verification complete"
```

---

## Summary

After completing all tasks:

1. **Infrastructure ready:** DynamoDB table defined in OpenTofu with proper IAM permissions
2. **API endpoints implemented:**
   - `GET /api/checkin/status` - returns current check-in state
   - `POST /api/checkin` - toggles check-in/check-out
3. **Security:** All operations scoped to authenticated user's ID from JWT

**To deploy:**
```bash
cd infra
tofu plan    # Review changes
tofu apply   # Deploy
```

**To test locally:** You'll need to run `yarn build` and deploy to AWS, as DynamoDB requires actual AWS resources.
