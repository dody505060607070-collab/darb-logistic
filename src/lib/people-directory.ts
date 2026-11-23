/** One list of everybody the company has: employee accounts plus driver files that have no account yet. */
export type PersonProfile = { id: string; full_name: string | null; phone: string | null };
export type PersonRole = { user_id: string; role: string };
export type PersonDriver = { id: string; code: string; full_name: string; phone: string | null; user_id: string | null };

export type PersonAccess = 'active' | 'awaiting_login' | 'no_phone';
export type PersonRow = {
  id: string;
  kind: 'account' | 'driver_file';
  full_name: string;
  phone: string | null;
  roles: string[];
  driverId: string | null;
  driverCode: string | null;
  access: PersonAccess;
};

export function buildPeople(profiles: PersonProfile[], roles: PersonRole[], drivers: PersonDriver[]): PersonRow[] {
  const profileIds = new Set(profiles.map(p => p.id));
  const driverOf = new Map(drivers.filter(d => d.user_id).map(d => [d.user_id!, d]));
  const accounts: PersonRow[] = profiles.map(p => {
    const d = driverOf.get(p.id) ?? null;
    return {
      id: p.id, kind: 'account', full_name: p.full_name || d?.full_name || '', phone: p.phone,
      roles: roles.filter(r => r.user_id === p.id).map(r => r.role),
      driverId: d?.id ?? null, driverCode: d?.code ?? null, access: 'active',
    };
  });
  // A driver file whose account no longer exists is still a person waiting to sign in.
  const files: PersonRow[] = drivers.filter(d => !d.user_id || !profileIds.has(d.user_id)).map(d => ({
    id: `driver:${d.id}`, kind: 'driver_file', full_name: d.full_name, phone: d.phone, roles: ['driver'],
    driverId: d.id, driverCode: d.code, access: d.phone ? 'awaiting_login' : 'no_phone',
  }));
  return [...accounts, ...files];
}

export const PERSON_ACCESS_LABEL: Record<PersonAccess, string> = {
  active: 'له حساب دخول',
  awaiting_login: 'جاهز — ينتظر أول دخول',
  no_phone: 'ينقصه رقم الجوال للدخول',
};
