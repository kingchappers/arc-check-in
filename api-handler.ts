import { verify } from 'jsonwebtoken';
import jwksClient from 'jwks-rsa';
import type { APIGatewayProxyHandlerV2 } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand, PutCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';

const AUTH0_DOMAIN = process.env.AUTH0_DOMAIN || '';
const AUTH0_AUDIENCE = process.env.AUTH0_AUDIENCE || '';
const DYNAMODB_TABLE_NAME = process.env.DYNAMODB_TABLE_NAME || '';

// Create DynamoDB client
const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);

// Create JWKS client to fetch Auth0's public keys
const client = jwksClient({
  cache: true,
  cacheMaxAge: 600000, // 10 minutes
  jwksUri: `https://${AUTH0_DOMAIN}/.well-known/jwks.json`,
});

// Synchronous wrapper for getKey that works with jwt.verify callback
function getKey(header: any, callback: any) {
  client.getSigningKey(header.kid, (err, key) => {
    if (err) {
      callback(err);
    } else {
      callback(null, key?.getPublicKey());
    }
  });
}

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  try {
    // Log request metadata only (not headers or body which may contain sensitive data)
    console.log('Request received:', { path: event.rawPath, method: event.requestContext?.http?.method });

    // Extract token from Authorization header
    const authHeader = event.headers?.authorization || '';
    
    const token = authHeader.replace('Bearer ', '');

    if (!token) {
      console.log('No token found');
      return {
        statusCode: 401,
        body: JSON.stringify({ error: 'Missing authorization token' }),
      };
    }

    // Verify and decode JWT using Promise wrapper
    const decoded: any = await new Promise((resolve, reject) => {
      verify(token, getKey, {
        audience: AUTH0_AUDIENCE,
        issuer: `https://${AUTH0_DOMAIN}/`
      }, (err, decoded) => {
        if (err) {
          reject(err);
        } else {
          resolve(decoded);
        }
      });
    });

    // Route requests based on path and method
    const path = event.rawPath;
    const method = event.requestContext?.http?.method;
    console.log('Path:', path);

    if (path === '/api/test') {
      return handleTestEndpoint(decoded);
    }

    if (path === '/api/user-info') {
      return handleUserInfo(decoded);
    }

    if (path === '/api/checkin/status' && method === 'GET') {
      return handleCheckinStatus(decoded);
    }

    if (path === '/api/checkin/history' && method === 'GET') {
      return handleCheckinHistory(decoded);
    }

    if (path === '/api/checkin' && method === 'POST') {
      return handleCheckinToggle(decoded);
    }

    // 404 for unknown endpoints
    return {
      statusCode: 404,
      body: JSON.stringify({ error: 'Endpoint not found' }),
    };
  } catch (error) {
    // Log error details server-side for debugging, but don't expose to client
    console.error('Authentication failed:', error instanceof Error ? error.name : 'Unknown error');
    return {
      statusCode: 401,
      body: JSON.stringify({ error: 'Unauthorized' }),
    };
  }
};

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

async function handleCheckinToggle(decoded: any) {
  try {
    const userId = decoded.sub;
    const currentSession = await getCurrentSession(userId);

    if (currentSession) {
      // Currently checked in - check out
      // ConditionExpression ensures the session hasn't already been checked out
      // by a concurrent request (prevents double check-out race condition)
      const checkOutTime = new Date().toISOString();
      await docClient.send(new UpdateCommand({
        TableName: DYNAMODB_TABLE_NAME,
        Key: {
          userId: userId,
          checkInTime: currentSession.checkInTime,
        },
        UpdateExpression: 'SET checkOutTime = :checkOutTime',
        ConditionExpression: 'attribute_not_exists(checkOutTime) OR checkOutTime = :null',
        ExpressionAttributeValues: {
          ':checkOutTime': checkOutTime,
          ':null': null,
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
      // condition_check not needed on PutItem since checkInTime (sort key) uses
      // a new timestamp, making each check-in a unique item. The checkout
      // ConditionExpression above prevents the real issue (orphaned sessions)
      // by ensuring only one request can close a session.
      const checkInTime = new Date().toISOString();
      await docClient.send(new PutCommand({
        TableName: DYNAMODB_TABLE_NAME,
        Item: {
          userId: userId,
          checkInTime: checkInTime,
        },
      }));

      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          checkedIn: true,
          session: {
            checkInTime: checkInTime,
          },
        }),
      };
    }
  } catch (error) {
    // ConditionalCheckFailedException means a concurrent request already
    // toggled the state — return 409 Conflict so the client can re-fetch status
    if (error instanceof Error && error.name === 'ConditionalCheckFailedException') {
      return {
        statusCode: 409,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Status changed by another request, please retry' }),
      };
    }
    console.error('Error toggling check-in:', error instanceof Error ? error.message : 'Unknown error');
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Internal server error' }),
    };
  }
}

async function handleCheckinHistory(decoded: any) {
  try {
    const userId = decoded.sub;
    const result = await docClient.send(new QueryCommand({
      TableName: DYNAMODB_TABLE_NAME,
      KeyConditionExpression: 'userId = :userId',
      ExpressionAttributeValues: {
        ':userId': userId,
      },
      ScanIndexForward: false,
      Limit: 50,
    }));

    const sessions = (result.Items || []).map(item => ({
      checkInTime: item.checkInTime,
      checkOutTime: item.checkOutTime || null,
    }));

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessions }),
    };
  } catch (error) {
    console.error('Error getting check-in history:', error instanceof Error ? error.message : 'Unknown error');
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Internal server error' }),
    };
  }
}

function handleTestEndpoint(decoded: any) {
  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: 'Hello from protected API',
      userId: decoded.sub,
      timestamp: new Date().toISOString(),
    }),
  };
}

function handleUserInfo(decoded: any) {
  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      userId: decoded.sub,
      email: decoded[`${AUTH0_DOMAIN}/email`] || decoded.email,
      name: decoded[`${AUTH0_DOMAIN}/name`] || decoded.name,
    }),
  };
}
