import { useDisclosure } from '@mantine/hooks';
import { AppShell, Burger, Flex, Text, NavLink } from '@mantine/core';
import { Auth0Provider } from '@auth0/auth0-react';
import Authentication from "../authentication/Authentication";
import { ApiTest } from '../api/ApiTest';
import { IconHome2, IconSettings } from '@tabler/icons-react';
// import { NavLink } from "react-router";

export function DefaultLayout({ children }: { children: React.ReactNode }) {
  const [mobileOpened, { toggle: toggleMobile }] = useDisclosure();
  const [desktopOpened, { toggle: toggleDesktop }] = useDisclosure(true);

  return (
    <Auth0Provider
      domain={import.meta.env.VITE_AUTH0_DOMAIN}
      clientId={import.meta.env.VITE_AUTH0_CLIENT_ID}
      authorizationParams={{
        redirect_uri: window.location.origin,
        audience: import.meta.env.VITE_AUTH0_AUDIENCE,
      }}
    >
      <AppShell
        padding="md"
        header={{ height: 60 }}
        navbar={{
          width: 300,
          breakpoint: 'sm',
          collapsed: { mobile: !mobileOpened, desktop: !desktopOpened },
        }}
      >
        <AppShell.Header bg="arc-orange.8">
          <Flex mih={50}
            gap="md"
            justify="space-between"
            align="center"
            direction="row"
            wrap="wrap"
            p="md">
            <div className="flex gap-2 items-center">
              <Burger opened={mobileOpened} onClick={toggleMobile} hiddenFrom="sm" size="md" color="white" />
              <Burger opened={desktopOpened} onClick={toggleDesktop} visibleFrom="sm" size="md" color="white" />
              <Text c="white" fw={700} ff="'Fredoka One', cursive">ARC Check-In</Text>
            </div>

            <div className=''>
              <Authentication />
            </div>
          </Flex>

        </AppShell.Header>
        <AppShell.Navbar p="md" bg="arc-orange.8">
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
        </AppShell.Navbar>

        <AppShell.Main>
          {children}
          <div style={{ marginTop: '2rem' }}>
            <ApiTest />
          </div>
        </AppShell.Main>
      </AppShell>
    </Auth0Provider>
  );
}