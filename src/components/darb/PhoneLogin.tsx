import { useState } from 'react';
import { ChevronDown, Loader2, ShieldCheck } from 'lucide-react';
import { WhatsAppIcon } from './WhatsAppIcon';
import { toast } from 'sonner';
import { useServerFn } from '@tanstack/react-start';
import { supabase } from '@/integrations/supabase/client';
import { normalizePhone, tryNormalizePhone } from '@/lib/phone';
import { requestLoginCode, verifyLoginCode } from '@/lib/whatsapp-login.functions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { errMsg } from '@/lib/format';

export function PhoneLogin() {
  const requestCode = useServerFn(requestLoginCode);
  const verifyCode = useServerFn(verifyLoginCode);
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
        const { tokenHash } = await verifyCode({ data: { phone: sentTo, code } });
        const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: 'magiclink' });
        if (error) throw error;
      } else {
        const phone = normalizePhone(country, number);
        await requestCode({ data: { phone } });
        setSentTo(phone); toast.success('إذا كان رقمك مسجلًا لدى الإدارة سيصلك رمز الدخول على واتساب');
      }
    } catch (err) {
      setError(errMsg(err));
    } finally { setBusy(false); }
  }
  return <form onSubmit={submit} className="space-y-4">
    {sentTo ? <>
      <p className="text-center text-sm text-muted-foreground">أرسلنا رمز التحقق على واتساب إلى <b dir="ltr">{sentTo}</b></p>
      <Label htmlFor="sms-code" className="block text-base font-semibold text-primary">رمز التحقق</Label>
      <Input id="sms-code" aria-invalid={!!error} aria-describedby={error ? 'login-error' : undefined} dir="ltr" inputMode="numeric" autoComplete="one-time-code" value={code} onChange={e => setCode(e.target.value.replace(/\D/g, ''))} required minLength={6} maxLength={6} className="glass-chip h-14 text-center text-xl tracking-[0.5em]" />
    </> : <>
      <Label htmlFor="phone-number" className="block text-base font-semibold text-primary">رقم الجوال</Label>
      <div dir="ltr" className="glass-chip flex h-14 items-center rounded-full ps-1 pe-2 focus-within:ring-2 focus-within:ring-gold/50">
        <label className="relative flex h-full shrink-0 cursor-pointer items-center gap-2 ps-3 pe-3">
          <span className="text-xl leading-none" aria-hidden>{COUNTRIES.find(c => c[0] === country)?.[2]}</span>
          <ChevronDown className="size-4 text-muted-foreground" aria-hidden />
          <span className="text-lg font-semibold text-foreground">{country}</span>
          <select aria-label="رمز الدولة" value={country} onChange={e => setCountry(e.target.value)} className="absolute inset-0 h-full w-full cursor-pointer opacity-0">
            {COUNTRIES.map(([v, l, f]) => <option key={v} value={v}>{f} {l} {v}</option>)}
          </select>
        </label>
        <span className="h-7 w-px shrink-0 bg-border" aria-hidden />
        <input id="phone-number" aria-invalid={!!error} aria-describedby={error ? 'login-error' : undefined} type="tel" inputMode="tel" autoComplete="tel-national" placeholder="5X XXX XXXX" value={number} onChange={e => setNumber(e.target.value)} required className="h-full min-w-0 flex-1 border-0 bg-transparent px-4 text-lg tracking-wide shadow-none outline-none placeholder:text-muted-foreground/70 focus:shadow-none" style={{ background: 'transparent' }} />
      </div>
      {number.trim() && (() => { const p = tryNormalizePhone(number, country); return <p className={p ? 'text-center text-sm text-success' : 'text-center text-sm text-muted-foreground'}>{p ? <>سنرسل الرمز إلى <b dir="ltr" className="num">{p}</b></> : 'اكتب الرقم كما تعرفه: 05… أو 966… أو +966…'}</p>; })()}
    </>}
    {error && <p id="login-error" role="alert" className="rounded-3xl border border-danger bg-danger-soft p-3 text-sm text-danger">{error}</p>}
    <Button type="submit" variant="gold" disabled={busy} className="h-14 w-full text-lg font-bold shadow-[0_14px_30px_-14px_var(--brand-red)] [&_svg]:size-6">{busy ? <Loader2 className="animate-spin" /> : sentTo ? <ShieldCheck /> : <WhatsAppIcon />}{sentTo ? 'تحقق وتسجيل الدخول' : 'إرسال رمز التحقق عبر واتساب'}</Button>
    <p className="text-center text-sm text-muted-foreground">{sentTo ? 'الرمز صالح لمدة 5 دقائق.' : 'سنرسل رمز تحقق إلى رقم جوالك.'}</p>
    {sentTo && <Button type="button" variant="ghost" className="w-full" onClick={() => { setSentTo(''); setCode(''); setError(''); }}>تغيير الرقم أو طلب رمز جديد</Button>}
  </form>;
}

const COUNTRIES: [string, string, string][] = [['+966','السعودية','🇸🇦'],['+20','مصر','🇪🇬'],['+971','الإمارات','🇦🇪'],['+965','الكويت','🇰🇼'],['+974','قطر','🇶🇦'],['+973','البحرين','🇧🇭'],['+968','عُمان','🇴🇲'],['+962','الأردن','🇯🇴'],['+92','باكستان','🇵🇰'],['+91','الهند','🇮🇳'],['+880','بنغلاديش','🇧🇩'],['+1','أمريكا / كندا','🇺🇸'],['+44','بريطانيا','🇬🇧']];
