import { useEffect, useState } from 'react';
import { ribbonTabs, tabForModule, profileToLevel, type RibbonTab } from '../../ribbon.config';
import { useAuth } from '../../stores/auth';
import classes from './TopRibbon.module.css';
import { moduleAvailable } from '../../clientMode';

interface TopRibbonProps {
  active: string;           // current module key
  onSelect: (key: string) => void;
  onTabChange?: (tabId: string) => void;  // report active tab to the shell
}

/**
 * Two-level MS Office-style ribbon.
 *
 * Level 1 — Tab strip (slim, dark): Dashboard | People | Academics | …
 * Level 2 — Action ribbon (light): grouped actions for the selected tab.
 *
 * The Dashboard ('home') tab has no action ribbon — it holds only the single
 * Dashboard view, so the lower strip is hidden and the workspace gains height.
 *
 * Active tab is derived from the current module; user can also click a tab
 * to browse its actions without navigating (standard ribbon behaviour).
 */
export function TopRibbon({ active, onSelect, onTabChange }: TopRibbonProps) {
  const user = useAuth((s) => s.user);
  const userLevel = profileToLevel(user?.profile ?? '');
  const [activeTab, setActiveTab] = useState(() => tabForModule(active));

  // Sync tab when external navigation changes `active`
  useEffect(() => {
    const t = tabForModule(active);
    if (t !== 'home' || active === 'dashboard') setActiveTab(t);
  }, [active]);

  // Keep the shell informed so it can collapse the header on the Dashboard tab
  useEffect(() => {
    onTabChange?.(activeTab);
  }, [activeTab, onTabChange]);

  // Filter tabs the user can see
  const visibleTabs = ribbonTabs.filter(
    (t) => (!t.accessLevel || userLevel <= t.accessLevel) &&
      t.groups.some((group) => group.actions.some((action) => moduleAvailable(action.key))),
  );

  const currentTab: RibbonTab =
    visibleTabs.find((t) => t.id === activeTab) ?? visibleTabs[0];

  // Dashboard tab: tab strip only, no action ribbon.
  const hideActionRibbon = activeTab === 'home';

  return (
    <div className={classes.ribbonRoot} role="navigation" aria-label="Module navigation">
      {/* ── Level 1: Tab strip ── */}
      <div className={classes.tabStrip} role="tablist">
        {visibleTabs.map((tab) => (
          <button
            key={tab.id}
            role="tab"
            type="button"
            aria-selected={tab.id === activeTab}
            aria-controls={`ribbon-panel-${tab.id}`}
            className={classes.tabBtn}
            data-testid={`ribbon-tab-${tab.id}`}
            data-active={tab.id === activeTab}
            onClick={() => {
              setActiveTab(tab.id);
              // Clicking the Dashboard tab navigates straight to the dashboard.
              if (tab.id === 'home') onSelect('dashboard');
            }}
            title={tab.label}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── Level 2: Action ribbon (hidden on Dashboard tab) ── */}
      {!hideActionRibbon && (
      <div
        id={`ribbon-panel-${currentTab?.id}`}
        className={classes.actionRibbon}
        role="tabpanel"
      >
        <div className={classes.actionInner}>
          {currentTab?.groups.map((group, gi) => {
            // Filter actions by user level
            const visibleActions = group.actions.filter(
              (a) => (!a.accessLevel || userLevel <= a.accessLevel) && moduleAvailable(a.key),
            );
            if (visibleActions.length === 0) return null;

            return (
              <div key={group.id} className={classes.actionGroup}>
                {gi > 0 && <div className={classes.groupDivider} aria-hidden />}
                <div className={classes.actionRow}>
                  {visibleActions.map((action) => {
                    const Icon = action.icon;
                    const isActive = action.key === active;
                    return (
                      <button
                        key={action.key}
                        type="button"
                        className={classes.actionBtn}
                        data-testid={`nav-${action.key}`}
                        data-active={isActive}
                        onClick={() => onSelect(action.key)}
                        title={action.label}
                        aria-label={action.label}
                        aria-current={isActive ? 'page' : undefined}
                      >
                        <Icon size={20} strokeWidth={1.7} />
                        <span className={classes.actionLabel}>{action.label}</span>
                        {action.badge && (
                          <span className={classes.actionBadge}>{action.badge}</span>
                        )}
                      </button>
                    );
                  })}
                </div>
                <div className={classes.groupLabel}>{group.label}</div>
              </div>
            );
          })}
        </div>
      </div>
      )}
    </div>
  );
}
