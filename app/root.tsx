import '@mantine/core/styles.css';
import '@mantine/notifications/styles.css';

import {
  isRouteErrorResponse,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
} from "react-router";

import type { Route } from "./+types/root";
import "./app.css";

import { ColorSchemeScript, MantineProvider, mantineHtmlProps, createTheme, virtualColor } from '@mantine/core';
import { Notifications } from '@mantine/notifications';

const theme = createTheme({
  fontFamily: '"Nunito Sans", ui-sans-serif, system-ui, sans-serif',
  headings: {
    fontFamily: '"Fredoka One", cursive, sans-serif',
  },
  primaryColor: 'arc-orange',
  colors: {
    'arc-orange': [
      "#fff4e6",
      "#ffe8cc",
      "#ffd8a8",
      "#ffc078",
      "#ffa94d",
      "#ff8411",
      "#e8780f",
      "#cc6a0d",
      "#a3550a",
      "#7a3f08"
    ],
    'arc-charcoal': [
      "#f5f5f5",
      "#e0e0e0",
      "#bdbdbd",
      "#9e9e9e",
      "#798490",
      "#4a4a4a",
      "#333333",
      "#262626",
      "#1e1e1e",
      "#181818"
    ],
    'arc-warm-white': [
      "#fffdf9",
      "#fffdf9",
      "#fffdf9",
      "#fffdf9",
      "#fffdf9",
      "#fffdf9",
      "#fffdf9",
      "#fffdf9",
      "#fffdf9",
      "#fffdf9"
    ],
    menu: virtualColor({
      name: 'menu',
      dark: 'arc-charcoal',
      light: 'arc-orange',
    }),
    text: virtualColor({
      name: 'text',
      dark: 'arc-warm-white',
      light: 'arc-charcoal',
    }),
  },
});

export const links: Route.LinksFunction = () => [
  { rel: "preconnect", href: "https://fonts.googleapis.com" },
  {
    rel: "preconnect",
    href: "https://fonts.gstatic.com",
    crossOrigin: "anonymous",
  },
  {
    rel: "stylesheet",
    href: "https://fonts.googleapis.com/css2?family=Fredoka+One&family=Nunito+Sans:ital,opsz,wght@0,6..12,200..1000;1,6..12,200..1000&display=swap",
  },
];

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" {...mantineHtmlProps}>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <ColorSchemeScript defaultColorScheme="auto" />
        <Meta />
        <Links />
      </head>
      <body>
        <MantineProvider defaultColorScheme="auto" theme={theme}>
          <Notifications />
          {children}
        </MantineProvider>
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function App() {
  return <Outlet />;
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  let message = "Oops!";
  let details = "An unexpected error occurred.";
  let stack: string | undefined;

  if (isRouteErrorResponse(error)) {
    message = error.status === 404 ? "404" : "Error";
    details =
      error.status === 404
        ? "The requested page could not be found."
        : error.statusText || details;
  } else if (import.meta.env.DEV && error && error instanceof Error) {
    details = error.message;
    stack = error.stack;
  }

  return (
    <main className="pt-16 p-4 container mx-auto">
      <h1>{message}</h1>
      <p>{details}</p>
      {stack && (
        <pre className="w-full p-4 overflow-x-auto">
          <code>{stack}</code>
        </pre>
      )}
    </main>
  );
}
