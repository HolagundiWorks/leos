import { Fragment } from 'react';
import dayjs from 'dayjs';
import { moduleByKey, moduleGroups } from '../../modules';
import classes from './TopRibbon.module.css';

interface TopRibbonProps {
  active: string;
  onSelect: (key: string) => void;
  userName?: string;
}

function greetingWord(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

/**
 * AutoCAD-style top ribbon: modules as medium icon+label buttons, grouped into
 * labelled panels with vertical dividers, horizontally scrollable on overflow.
 * Replaces the left icon rail.
 */
export function TopRibbon({ active, onSelect, userName }: TopRibbonProps) {
  const firstName = (userName ?? '').split(' ')[0];
  return (
    <div className={classes.ribbon}>
      {userName && (
        <div className={classes.greeting}>
          <div className={classes.greetTitle}>
            {greetingWord()}, {firstName} 👋
          </div>
          <div className={classes.greetSub}>
            {dayjs().format('dddd, D MMMM YYYY')} · here's what needs your attention.
          </div>
        </div>
      )}
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
    </div>
  );
}
