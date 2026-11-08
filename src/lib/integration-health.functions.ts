import { createServerFn } from '@tanstack/react-start';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';

export const integrationHealth = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: owner, error } = await context.supabase.rpc('has_role', { _user_id: context.userId, _role: 'owner' });
    if (error || !owner) throw new Error('الفحص متاح للمدير العام فقط');
    const url = process.env.TRACCAR_URL?.trim().replace(/\/+$/, '');
    const email = process.env.TRACCAR_EMAIL;
    const password = process.env.TRACCAR_PASSWORD;
    let tracking: { state: string; detail: string; devices: number; positions: number } = { state: 'missing', detail: 'لم يتم الربط', devices: 0, positions: 0 };
    if (url && email && password) {
      try {
        const headers = { Authorization: `Basic ${btoa(`${email}:${password}`)}` };
        const response = await fetch(`${url}/api/devices`, { headers, signal: AbortSignal.timeout(15000) });
        if (!response.ok) throw new Error('connection');
        const devices: unknown = await response.json();
        if (!Array.isArray(devices)) throw new Error('format');
        const positionResponse = await fetch(`${url}/api/positions`, { headers, signal: AbortSignal.timeout(15000) });
        if (!positionResponse.ok) throw new Error('positions');
        const positions: unknown = await positionResponse.json();
        if (!Array.isArray(positions)) throw new Error('format');
        tracking = { state: 'connected', devices: devices.length, positions: positions.length, detail: devices.length === 0 ? 'الخادم متصل؛ لا توجد أجهزة مسجلة' : `${devices.length} جهاز و${positions.length} قراءة لدى المزود؛ مزامنة الأجهزة مع دَرب غير مفعّلة` };
      } catch { tracking = { state: 'error', detail: 'تعذر الاتصال بخادم التتبع؛ تحقق من بيانات الربط', devices: 0, positions: 0 }; }
    }
    let routing = { state: 'missing', detail: 'لم يتم الربط' };
    const key = process.env.ORS_API_KEY;
    if (key) {
      try {
        const response = await fetch('https://api.openrouteservice.org/v2/directions/driving-hgv?start=46.6753,24.7136&end=50.0888,26.4207', { headers: { Authorization: key }, signal: AbortSignal.timeout(15000) });
        const body = response.ok ? await response.json() : null;
        routing = body?.features?.length ? { state: 'connected', detail: 'تم التحقق من مسار الرياض–الدمام' } : { state: 'error', detail: 'تعذر التحقق من خدمة المسارات' };
      } catch { routing = { state: 'error', detail: 'تعذر الاتصال بخدمة المسارات' }; }
    }
    return { tracking, routing, checkedAt: new Date().toISOString() };
  });