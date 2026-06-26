import { Fragment } from 'react';
import { ScrollArea } from '@mantine/core';
import { moduleByKey, moduleGroups } from '../../modules';
import classes from './TopRibbon.module.css';

interface TopRibbonProps {
  active: string;
  onSelect: (key: string) => void;
}

/**
 * AutoCAD-style top ribbon: modules as medium icon+label buttons, grouped into
 * labelled panels with vertical dividers, horizontally scrollable on overflow.
 * Replaces the left icon rail.
 */
export function TopRibbon({ active, onSelect }: TopRibbonProps) {
  return (
    <ScrollArea type="hover" scrollbarSize={6} className={classes.ribbon}>
      <div className={classes.inner}>
        {moduleGroups.map((group, gi) => (
          <Fragment key={group.label}>
            {gi > 0 && <div className={classes.divider} />}
            <div className={classes.group}>
              <div className={classes.row}>
                {group.keys.map((key) => {
                  const mod = moduleByKey[key];
                  if (!mod) return null;
                  const Icon = mod.icon;
                  return (
                    <button
                      key={key}
                      type="button"
                      className={classes.btn}
                      data-active={mod.key === active}
                      onClick={() => onSelect(key)}
                      title={mod.label}
                    >
                      <Icon size={24} strokeWidth={1.8} />
                      <span className={classes.btnLabel}>{mod.label}</span>
                    </button>
                  );
                })}
              </div>
              <div className={classes.groupLabel}>{group.label}</div>
            </div>
          </Fragment>
        ))}
      </div>
    </ScrollArea>
  );
}
