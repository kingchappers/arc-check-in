import { useState, useEffect, useCallback } from 'react';
import { Card, Table, Text, Stack, Skeleton } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useAuth0 } from '@auth0/auth0-react';

interface Session {
  checkInTime: string;
  checkOutTime: string | null;
}

export function CheckInHistory({ name }: { name?: string }) {
  const { getAccessTokenSilently } = useAuth0();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);

  const authedFetch = useCallback(
    async (endpoint: string) => {
      const token = await getAccessTokenSilently();
      return fetch(endpoint, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });
    },
    [getAccessTokenSilently],
  );

  useEffect(() => {
    authedFetch('/api/checkin/history')
      .then(async (response) => {
        if (!response.ok) throw new Error('Failed to fetch history');
        const data = await response.json();
        setSessions(data.sessions);
      })
      .catch((error) => {
        console.error('Failed to fetch check-in history:', error);
        notifications.show({
          title: 'Error',
          message: 'Failed to load check-in history',
          color: 'red',
        });
      })
      .finally(() => setLoading(false));
  }, [authedFetch]);

  const formatDate = (isoString: string) =>
    new Date(isoString).toLocaleDateString([], {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });

  const formatTime = (isoString: string) =>
    new Date(isoString).toLocaleTimeString([], {
      hour: 'numeric',
      minute: '2-digit',
    });

  const displayName = name || 'Your';
  const heading = displayName === 'Your'
    ? 'Your checkins'
    : `${displayName}'s checkins`;

  if (loading) {
    return (
      <Card shadow="sm" padding="lg" radius="md" withBorder>
        <Stack>
          <Skeleton height={24} width="40%" />
          <Skeleton height={16} />
          <Skeleton height={16} />
          <Skeleton height={16} />
        </Stack>
      </Card>
    );
  }

  return (
    <Card shadow="sm" padding="lg" radius="md" withBorder>
      <Stack>
        <Text size="lg" fw={500}>{heading}</Text>
        {sessions.length === 0 ? (
          <Text c="dimmed">No check-in history yet.</Text>
        ) : (
          <Table striped highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Date</Table.Th>
                <Table.Th>Check-in</Table.Th>
                <Table.Th>Check-out</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {sessions.map((session) => (
                <Table.Tr key={session.checkInTime}>
                  <Table.Td>{formatDate(session.checkInTime)}</Table.Td>
                  <Table.Td>{formatTime(session.checkInTime)}</Table.Td>
                  <Table.Td>
                    {session.checkOutTime
                      ? formatTime(session.checkOutTime)
                      : '—'}
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        )}
      </Stack>
    </Card>
  );
}
