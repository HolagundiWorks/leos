import { useEffect, type ReactNode } from 'react';
import { AppShell } from '@mantine/core';
import type { SessionUser } from '../../types';
import { ribbonTabs } from '../../ribbon.config';
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
 * LEOS cockpit: Deep Graphite utility strip + translucent ribbon over the
 * full-height workspace. No footer.
 */
export function CockpitShell({ user, active, onNavigate, children }: CockpitShellProps) {
  // Alt+1..9 jump to ribbon tabs.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.altKey && !e.ctrlKey && !e.metaKey && /^[1-9]$/.test(e.key)) {
        const idx = Number(e.key) - 1;
        const firstAction = ribbonTabs[idx]?.groups[0]?.actions[0];
        if (firstAction && !firstAction.placeholder) {
          e.preventDefault();
          onNavigate(firstAction.key);
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onNavigate]);

  return (
    <>
      <CommandPalette onNavigate={onNavigate} />
      <AppShell header={{ height: 160 }} padding="md">
        <AppShell.Header style={{ borderBottom: 'none' }}>
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            {/* Deep Graphite utility strip */}
            <div
              style={{
                height: 44,
                flexShrink: 0,
                background: '#1E2329',
              }}
            >
              <UtilityStrip user={user} />
            </div>
            {/* Tab strip + action ribbon (116px total) */}
            <div style={{ flex: 1, minHeight: 0 }}>
              <TopRibbon active={active} onSelect={onNavigate} />
            </div>
          </div>
        </AppShell.Header>
        <AppShell.Main>{children}</AppShell.Main>
      </AppShell>
      <BrandWatermark />
    </>
  );
}
