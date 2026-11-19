import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';

/** Driver-file editors activate the file's phone login; only the owner may attach it to someone holding another job. */
export const activateDriverLogin = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ driverId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const check = async (role: string) => {
      const { data: ok, error } = await context.supabase.rpc('has_role', { _user_id: context.userId, _role: role as never });
      if (error) throw new Error('تعذر التحقق من الصلاحية');
      return !!ok;
    };
    const owner = await check('owner');
    if (!owner && !(await check('ops_manager')) && !(await check('fleet_supervisor'))) throw new Error('تفعيل دخول السائقين متاح للإدارة ومشرف الأسطول فقط');
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    const { ensureDriverLogin } = await import('./driver-access.server');
    const r = await ensureDriverLogin(supabaseAdmin, data.driverId, owner ? 'owner' : 'staff');
    return r.status === 'refused' ? { status: r.status, reason: r.reason } : { status: r.status };
  });
