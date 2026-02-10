import { useState, useEffect, useCallback } from 'react';
import { Card, Button, Text, Stack, Skeleton } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useAuth0 } from '@auth0/auth0-react';

export function CheckInCard() {
  const { getAccessTokenSilently } = useAuth0();
  const [checkedIn, setCheckedIn] = useState(false);
  const [checkInTime, setCheckInTime] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);

  const authedFetch = useCallback(
    async (endpoint: string, options: RequestInit = {}) => {
      const token = await getAccessTokenSilently();
      return fetch(endpoint, {
        ...options,
        headers: {
          ...options.headers,
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });
    },
    [getAccessTokenSilently],
  );

  const fetchStatus = useCallback(async () => {
    try {
      const response = await authedFetch('/api/checkin/status');
      if (!response.ok) throw new Error('Failed to fetch status');
      const data = await response.json();
      setCheckedIn(data.checkedIn);
      setCheckInTime(data.currentSession?.checkInTime ?? null);
    } catch (error) {
      console.error('Failed to fetch check-in status:', error);
      notifications.show({
        title: 'Error',
        message: 'Failed to load check-in status',
        color: 'red',
      });
    }
  }, [authedFetch]);

  useEffect(() => {
    fetchStatus().finally(() => setInitialLoading(false));
  }, [fetchStatus]);

  const handleToggle = async () => {
    setLoading(true);
    try {
      const response = await authedFetch('/api/checkin', { method: 'POST' });

      if (response.status === 409) {
        await fetchStatus();
        notifications.show({
          title: 'Status updated',
          message: 'Your status was changed by another request. Please try again.',
          color: 'yellow',
        });
        return;
      }

      if (!response.ok) throw new Error('Toggle failed');

      const data = await response.json();
      setCheckedIn(data.checkedIn);
      setCheckInTime(data.session?.checkInTime ?? null);

      notifications.show({
        title: data.checkedIn ? 'Checked in!' : 'Checked out!',
        message: data.checkedIn
          ? 'You are now checked in.'
          : 'You have been checked out.',
        color: data.checkedIn ? 'green' : 'blue',
      });
    } catch (error) {
      console.error('Failed to toggle check-in:', error);
      notifications.show({
        title: 'Error',
        message: 'Something went wrong. Please try again.',
        color: 'red',
      });
    } finally {
      setLoading(false);
    }
  };

  const formatTime = (isoString: string) => {
    return new Date(isoString).toLocaleTimeString([], {
      hour: 'numeric',
      minute: '2-digit',
    });
  };

  if (initialLoading) {
    return (
      <Card shadow="sm" padding="lg" radius="md" withBorder>
        <Stack>
          <Skeleton height={20} width="60%" />
          <Skeleton height={36} />
        </Stack>
      </Card>
    );
  }

  return (
    <Card shadow="sm" padding="lg" radius="md" withBorder>
      <Stack>
        <Text size="lg" fw={500}>
          {checkedIn && checkInTime
            ? `Checked in since ${formatTime(checkInTime)}`
            : 'Not checked in'}
        </Text>
        <Button
          color={checkedIn ? 'red' : 'green'}
          loading={loading}
          onClick={handleToggle}
        >
          {loading
            ? checkedIn
              ? 'Checking out...'
              : 'Checking in...'
            : checkedIn
              ? 'Check Out'
              : 'Check In'}
        </Button>
      </Stack>
    </Card>
  );
}
