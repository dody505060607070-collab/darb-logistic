import { useState } from 'react';
import { Loader2, Smartphone } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { normalizePhone } from '@/lib/phone';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export function PhoneLogin() {
  const [country, setCountry] = useState('+966');
  const [number, setNumber] = useState('');
  const [sentTo, setSentTo] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setError('');
    try {
      if (sentTo) {
        const { error } = await supabase.auth.verifyOtp({ phone: sentTo, token: code, type: 'sms' });
        if (error) throw error;
      } else {
        const phone = normalizePhone(country, number);
        const { error } = await supabase.auth.signInWithOtp({ phone });
        if (error) throw error;
        setSentTo(phone); toast.success('تم طلب رمز الدخول عبر SMS');
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'تعذر تسجيل الدخول';
      setError(/provider|phone.*disabled|unsupported|sms.*configured/i.test(message) ? 'لم يتم تفعيل خدمة رسائل SMS بعد. استخدم الدخول بالبريد مؤقتًا.' : message);
    } finally { setBusy(false); }
  }
  return <form onSubmit={submit} className="space-y-4">
    {sentTo ? <>
      <p className="text-center text-sm text-muted-foreground">رمز التحقق إلى <b dir="ltr">{sentTo}</b></p>
      <Label htmlFor="sms-code">رمز التحقق</Label>
      <Input id="sms-code" dir="ltr" inputMode="numeric" autoComplete="one-time-code" value={code} onChange={e => setCode(e.target.value.replace(/\D/g, ''))} required minLength={6} maxLength={8} className="h-12 text-center text-xl" />
    </> : <>
      <Label htmlFor="phone-number">رقم الجوال</Label>
      <div className="flex gap-2" dir="ltr">
        <select aria-label="رمز الدولة" value={country} onChange={e => setCountry(e.target.value)} className="h-11 max-w-40 rounded-md border border-input bg-card px-2 text-sm">
          {[['+966','السعودية'],['+20','مصر'],['+971','الإمارات'],['+965','الكويت'],['+974','قطر'],['+973','البحرين'],['+968','عُمان'],['+962','الأردن'],['+1','أمريكا / كندا'],['+44','بريطانيا']].map(([v,l]) => <option key={v} value={v}>{l} {v}</option>)}
        </select>
        <Input id="phone-number" type="tel" autoComplete="tel-national" value={number} onChange={e => setNumber(e.target.value)} required className="h-11 min-w-0 flex-1" />
      </div>
    </>}
    {error && <p role="alert" className="text-sm text-danger">{error}</p>}
    <Button type="submit" variant="gold" disabled={busy} className="h-11 w-full">{busy ? <Loader2 className="animate-spin" /> : <Smartphone />}{sentTo ? 'تحقق وتسجيل الدخول' : 'إرسال رمز SMS'}</Button>
    {sentTo && <Button type="button" variant="ghost" className="w-full" onClick={() => { setSentTo(''); setCode(''); setError(''); }}>تغيير الرقم أو طلب رمز جديد</Button>}
  </form>;
}