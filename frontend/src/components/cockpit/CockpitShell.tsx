import { useEffect, type ReactNode } from 'react';
import { AppShell } from '@mantine/core';
import type { SessionUser } from '../../types';
import { modules } from '../../modules';
import { UtilityStrip } from './UtilityStrip';
import { TopRibbon } from './TopRibbon';
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
 * School-ops cockpit: bold purple header (utility strip + AutoCAD-style top
 * ribbon) over a full-height workspace. No footer.
 */
export function CockpitShell({ user, active, onNavigate, children }: CockpitShellProps) {
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
      <AppShell header={{ height: 132 }} padding="md">
        <AppShell.Header>
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            <div
              style={{
                height: 44,
                flexShrink: 0,
                background: 'var(--mantine-color-lavender-6)',
                borderBottom: '1px solid rgba(255, 255, 255, 0.18)',
              }}
            >
              <UtilityStrip user={user} />
            </div>
            <div style={{ flex: 1, minHeight: 0 }}>
              <TopRibbon active={active} onSelect={onNavigate} userName={user.name} />
            </div>
          </div>
        </AppShell.Header>
        <AppShell.Main>{children}</AppShell.Main>
      </AppShell>
      <BrandWatermark />
    </>
  );
}
