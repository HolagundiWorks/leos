import { accentColors, type AccentColor } from '../theme';

export function avatarColorFor(id: number): AccentColor {
  return accentColors[id % accentColors.length];
}
