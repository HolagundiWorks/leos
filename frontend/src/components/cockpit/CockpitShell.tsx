import { useEffect, type ReactNode } from 'react';
import { AppShell } from '@mantine/core';
import type { SessionUser } from '../../types';
import { modules } from '../../modules';
import { UtilityStrip } from './UtilityStrip';
import { IconRail } from './IconRail';
import { ContextRibbon } from './ContextRibbon';
import { CommandPalette } from './CommandPalette';

interface CockpitShellProps {
  user: SessionUser;
  active: string;
  onNavigate: (key: string) => void;
  onViewStudent?: (id: number) => void;
  children: ReactNode;
}

/**
 * School-ops cockpit: thin utility strip (top), 48px latent icon rail (left),
 * workspace (center), bottom context ribbon, Ctrl-K palette. No wide sidebar.
 */
export function CockpitShell({
  user,
  active,
  onNavigate,
  onViewStudent,
  children,
}: CockpitShellProps) {
  // Alt+1..9 jump to modules.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.altKey && !e.ctrlKey && !e.metaKey && /^[1-9]$/.test(e.key)) {
        const mod = modules[Number(e.key) - 1];
        if (mod) {
          e.preventDefault();
          onNavigate(mod.key);
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onNavigate]);

  return (
    <>
      <CommandPalette onNavigate={onNavigate} />
      <AppShell
        header={{ height: 44 }}
        navbar={{ width: 56, breakpoint: 'xs', collapsed: { mobile: false } }}
        footer={{ height: 64 }}
        padding="md"
      >
        <AppShell.Header>
          <UtilityStrip user={user} />
        </AppShell.Header>
        <AppShell.Navbar p={4}>
          <IconRail active={active} onSelect={onNavigate} />
        </AppShell.Navbar>
        <AppShell.Main bg="var(--mantine-color-gray-0)">{children}</AppShell.Main>
        <AppShell.Footer>
          <ContextRibbon active={active} onViewStudent={onViewStudent} />
        </AppShell.Footer>
      </AppShell>
    </>
  );
}
