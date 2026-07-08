import type { Role } from './roles';

/** Current signed-in user. */
export interface SessionUser {
  name: string;
  role: Role;
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}
