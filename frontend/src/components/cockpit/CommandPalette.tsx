import { Spotlight, type SpotlightActionData } from '@mantine/spotlight';
import { Search } from 'lucide-react';
import { ribbonTabs } from '../../ribbon.config';
import { moduleAvailable } from '../../clientMode';

/** Ctrl-K command palette: jump to any action in the ribbon. */
export function CommandPalette({ onNavigate }: { onNavigate: (key: string) => void }) {
  const actions: SpotlightActionData[] = [];

  for (const tab of ribbonTabs) {
    for (const group of tab.groups) {
      for (const action of group.actions) {
        if (!moduleAvailable(action.key)) continue;
        const Icon = action.icon;
        actions.push({
          id: `nav-${action.key}`,
          label: action.label,
          description: `${tab.label} → ${group.label}`,
          onClick: () => onNavigate(action.key),
          leftSection: <Icon size={18} strokeWidth={1.8} />,
        });
      }
    }
  }

  return (
    <Spotlight
      actions={actions}
      shortcut="mod + K"
      nothingFound="Nothing found…"
      highlightQuery
      searchProps={{
        leftSection: <Search size={18} strokeWidth={1.8} />,
        placeholder: 'Search modules and actions…',
      }}
    />
  );
}
