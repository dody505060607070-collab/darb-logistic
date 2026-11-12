import { createServerFn } from '@tanstack/react-start';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
/** Owner-triggered, service-only acceptance run; database fixtures roll back. */
export const runShitaaAcceptance=createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).handler(async({context})=>{
 const {data:owner,error:roleError}=await context.supabase.rpc('has_role',{_user_id:context.userId,_role:'owner'});
 if(roleError||!owner)throw new Error('اختبارات القبول متاحة للإدارة فقط');
 const {supabaseAdmin}=await import('@/integrations/supabase/client.server');
 const {data,error}=await supabaseAdmin.rpc('shitaa_acceptance_checks');
 if(error)throw new Error('تعذر تنفيذ اختبارات القبول: '+error.message);
 return data;
});