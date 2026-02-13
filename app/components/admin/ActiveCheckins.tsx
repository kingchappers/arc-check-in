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
