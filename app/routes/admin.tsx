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
