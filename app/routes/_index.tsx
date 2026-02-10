import { StrictMode } from 'react';
import { useAuth0 } from '@auth0/auth0-react';
import { Center, Loader, Stack, Text } from '@mantine/core';
import { DefaultLayout } from '~/components/layout/DefaultLayout';
import { CheckInCard } from '~/components/checkin/CheckInCard';
import { CheckInHistory } from '~/components/checkin/CheckInHistory';

function HomeContent() {
  const { isAuthenticated, isLoading, user } = useAuth0();

  if (isLoading) {
    return (
      <Center py="xl">
        <Loader />
      </Center>
    );
  }

  if (!isAuthenticated) {
    return <Text>Please log in to check in.</Text>;
  }

  return (
    <Stack gap="md">
      <CheckInCard />
      <CheckInHistory name={user?.name} />
    </Stack>
  );
}

export default function Home() {
  return (
    <StrictMode>
      <DefaultLayout>
        <HomeContent />
      </DefaultLayout>
    </StrictMode>
  );
}
