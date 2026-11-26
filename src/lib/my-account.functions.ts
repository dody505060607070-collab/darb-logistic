import { createServerFn } from '@tanstack/react-start';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import { z } from 'zod';
import { tryNormalizePhone } from './phone';

/** Lets any signed-in person change their own login phone; refuses numbers used by anyone else. */
export const updateMyPhone = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ phone: z.string().min(6).max(20) }).parse(input))
  .handler(async ({ data, context }) => {
    const phone = tryNormalizePhone(data.phone);
    if (!phone) throw new Error('رقم الجوال غير صحيح');
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    const { data: perm } = await supabaseAdmin.rpc('is_permanent_admin', { _uid: context.userId } as never);
    if (perm) throw new Error('رقم المدير الدائم لا يمكن تغييره');
    const { data: taken } = await supabaseAdmin.from('profiles').select('id').eq('phone', phone).neq('id', context.userId).limit(1);
    if (taken?.length) throw new Error('هذا الرقم مسجل لشخص آخر');
    const { data: drv } = await supabaseAdmin.from('drivers').select('id,user_id').eq('phone', phone).limit(5);
    if ((drv ?? []).some((d) => d.user_id !== context.userId)) throw new Error('هذا الرقم مسجل لملف سائق آخر');
    const { error } = await supabaseAdmin.from('profiles').update({ phone }).eq('id', context.userId);
    if (error) throw new Error(error.code === '23505' ? 'هذا الرقم مسجل لشخص آخر' : 'تعذر حفظ الرقم');
    return { phone };
  });
