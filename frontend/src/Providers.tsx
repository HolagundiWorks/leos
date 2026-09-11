import '@mantine/core/styles.css';
import '@mantine/dates/styles.css';
import '@mantine/spotlight/styles.css';
import './theme.css';

import type { ReactNode } from 'react';
import { MantineProvider } from '@mantine/core';
import { QueryClientProvider } from '@tanstack/react-query';
import { theme } from './theme';
import { queryClient } from './lib/queryClient';

/** App-wide providers: TanStack Query (server state) + Mantine theme/CSS. */
export function Providers({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <MantineProvider theme={theme} defaultColorScheme="auto">
        {children}
      </MantineProvider>
    </QueryClientProvider>
  );
}
