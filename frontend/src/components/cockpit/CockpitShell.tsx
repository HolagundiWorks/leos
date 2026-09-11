import { useEffect, useState, type ReactNode } from 'react';
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
  children: ReactNode;
}

/**
 * LEOS cockpit: Carbon G100 utility strip and neutral workspace.
 */
export function CockpitShell({ user, active, onNavigate, children }: CockpitShellProps) {
  // The Dashboard ('home') tab hides its action ribbon, so the header shrinks
  // to utility strip (44) + tab strip (36) = 80px; other tabs use 160px.
  const [ribbonTab, setRibbonTab] = useState('home');
  const onHome = ribbonTab === 'home';
  const headerHeight = onHome ? 80 : 160;

  // Alt+1..9 jump to ribbon tabs.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.altKey && !e.ctrlKey && !e.metaKey && /^[1-9]$/.test(e.key)) {
        const idx = Number(e.key) - 1;
        const firstAction = ribbonTabs[idx]?.groups[0]?.actions[0];
        if (firstAction) {
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
      <AppShell header={{ height: headerHeight }} padding="md">
        <AppShell.Header style={{ borderBottom: 'none' }}>
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            {/* Carbon G100 utility strip */}
            <div
              style={{
                height: 44,
                flexShrink: 0,
                background: '#161616',
              }}
            >
              <UtilityStrip user={user} />
            </div>
            {/* Tab strip (+ action ribbon on non-Dashboard tabs) */}
            <div style={{ flex: 1, minHeight: 0 }}>
              <TopRibbon active={active} onSelect={onNavigate} onTabChange={setRibbonTab} />
            </div>
          </div>
        </AppShell.Header>
        <AppShell.Main data-testid="cockpit-shell">{children}</AppShell.Main>
      </AppShell>
      <BrandWatermark />
    </>
  );
}
