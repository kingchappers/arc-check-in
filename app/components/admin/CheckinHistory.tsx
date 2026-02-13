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
            setDateRange(value.map(v => (v ? new Date(v) : null)) as [Date | null, Date | null]);
            setPreset('' as PresetRange);
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
