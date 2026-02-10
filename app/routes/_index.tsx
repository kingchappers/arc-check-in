import { StrictMode } from 'react';
import { useAuth0 } from '@auth0/auth0-react';
import { Center, Loader, Text } from '@mantine/core';
import { DefaultLayout } from '~/components/layout/DefaultLayout';
import { CheckInCard } from '~/components/checkin/CheckInCard';

function HomeContent() {
  const { isAuthenticated, isLoading } = useAuth0();

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

  return <CheckInCard />;
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
