import type { AppRole } from './auth';

/** Landing page per role: owners/ops managers keep the full dashboard. */
export function roleHome(roles: AppRole[]): string {
  if (roles.includes("owner") || roles.includes("ops_manager")) return "/";
  if(roles.includes('workshop')||roles.includes('field_maintenance')) return '/repair-center';
  if(roles.includes('driver')) return '/driver';
  if(roles.includes('representative')) return '/representative';
  // dispatcher, accountant, maintenance and fleet supervisor get their own dashboard on "/"
  return "/";
}
