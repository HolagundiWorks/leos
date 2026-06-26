import { useEffect, type ReactNode } from 'react';
import { AppShell } from '@mantine/core';
import type { SessionUser } from '../../types';
import { modules } from '../../modules';
import { UtilityStrip } from './UtilityStrip';
import { TopRibbon } from './TopRibbon';
import { ContextRibbon } from './ContextRibbon';
import { CommandPalette } from './CommandPalette';
import { BrandWatermark } from '../brand/BrandWatermark';

interface CockpitShellProps {
  user: SessionUser;
  active: string;
  onNavigate: (key: string) => void;
  onViewStudent?: (id: number) => void;
  children: ReactNode;
}

/**
 * School-ops cockpit: utility strip (school brand) + AutoCAD-style top ribbon
 * for module navigation, workspace, and a bottom context ribbon. No side rail.
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
      <AppShell header={{ height: 132 }} footer={{ height: 64 }} padding="md">
        <AppShell.Header>
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            <div
              style={{
                height: 44,
                flexShrink: 0,
                borderBottom: '1px solid var(--mantine-color-gray-2)',
              }}
            >
              <UtilityStrip user={user} />
            </div>
            <div style={{ flex: 1, minHeight: 0 }}>
              <TopRibbon active={active} onSelect={onNavigate} />
            </div>
          </div>
        </AppShell.Header>
        <AppShell.Main bg="var(--mantine-color-gray-0)">{children}</AppShell.Main>
        <AppShell.Footer>
          <ContextRibbon active={active} onViewStudent={onViewStudent} />
        </AppShell.Footer>
      </AppShell>
      <BrandWatermark />
    </>
  );
}
