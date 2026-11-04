import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { AuthContext } from '@/lib/auth-context';
import type { AuthState } from '@/lib/auth';

vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));

describe('auth context across provider module updates', () => {
  it('allows a newly evaluated hook to read the existing provider', async () => {
    const initial = await import('@/lib/auth');
    vi.resetModules();
    // Reuse the independently mounted context while the hooks module reloads.
    vi.doMock('@/lib/auth-context', () => ({ AuthContext }));
    const updated = await import('@/lib/auth');
    expect(updated.useAuth).not.toBe(initial.useAuth);
    const state: AuthState = { ready: true, session: null, roles: [], fullName: 'connected', driverId: null, can: () => false, isStaff: false, refresh: async () => {}, isSuperAdmin: false, viewAs: null, setViewAs: () => {}, signOut: async () => {} };
    function Probe() { return createElement('span', null, updated.useAuth().fullName); }
    expect(renderToString(createElement(AuthContext.Provider, { value: state }, createElement(Probe)))).toBe('<span>connected</span>');
    vi.doUnmock('@/lib/auth-context');
  });
});