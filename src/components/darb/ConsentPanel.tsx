import { useEffect, useRef, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { needsAnswer, onConsentChange, readChoice, saveChoices } from '@/lib/consent';

export function ConsentPanel() {
  const [banner, setBanner] = useState(false);
  const [settings, setSettings] = useState(false);
  const [analytics, setAnalytics] = useState(false);
  const [privacySignal, setPrivacySignal] = useState(false);
  const panel = useRef<HTMLElement>(null);
  useEffect(() => {
    setPrivacySignal((navigator as Navigator & { globalPrivacyControl?: boolean }).globalPrivacyControl === true);
    const update = () => { setAnalytics(readChoice('analytics') === 'granted'); void needsAnswer(['analytics']).then(setBanner); };
    update();
    const open = () => setSettings(true);
    window.addEventListener('shata-consent-settings', open);
    const stop = onConsentChange(update);
    return () => { stop(); window.removeEventListener('shata-consent-settings', open); };
  }, []);
  useEffect(() => { if (banner) panel.current?.focus(); }, [banner]);
  function decide(granted: boolean) { saveChoices({ analytics: granted ? 'granted' : 'denied' }); setBanner(false); setSettings(false); }
  return <>
    {banner && <section ref={panel} tabIndex={-1} aria-label="خيارات الخصوصية" className="fixed inset-x-3 bottom-24 z-40 mx-auto max-w-xl rounded-lg border bg-card p-4 shadow-card lg:bottom-4"><h2 className="font-bold text-primary">خيارات الخصوصية</h2><p className="my-2 text-sm text-muted-foreground">نحسب الزيارات دون ملفات تعريف ارتباط. إذا وافقت، نقيس أيضًا النقرات.</p><div className="flex flex-wrap items-center gap-2"><Button variant="outline" className="flex-1" onClick={() => decide(true)}>قبول الكل</Button><Button variant="outline" className="flex-1" onClick={() => decide(false)}>رفض الكل</Button><Button variant="ghost" onClick={() => setSettings(true)}>إعدادات الخصوصية</Button><Link to="/privacy" className="text-xs underline">سياسة الخصوصية</Link></div></section>}
    <Dialog open={settings} onOpenChange={setSettings}><DialogContent><DialogHeader><DialogTitle>إعدادات الخصوصية</DialogTitle></DialogHeader><div className="flex items-center justify-between border-b py-3"><span>ضرورية — تسجيل الدخول والتفضيلات</span><span className="text-xs text-muted-foreground">مفعلة دائمًا</span></div><label className="flex items-center justify-between gap-3 py-3"><span>قياس الاستخدام، مقدم من Lovable</span><Switch aria-label="قياس الاستخدام" checked={analytics} disabled={privacySignal} onCheckedChange={setAnalytics} /></label>{privacySignal && <p className="text-sm text-muted-foreground">إشارة الخصوصية من متصفحك تمنع القياس الاختياري.</p>}<Button onClick={() => decide(analytics)}>حفظ الاختيارات</Button></DialogContent></Dialog>
  </>;
}

export function PrivacyLinks() {
  return <footer className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 py-4 text-xs text-muted-foreground"><Link to="/privacy" className="underline">سياسة الخصوصية</Link><Link to="/terms" className="underline">شروط الاستخدام</Link><Link to="/contact" className="underline">التواصل</Link><Button type="button" variant="link" size="sm" className="h-auto p-0 text-xs text-muted-foreground" onClick={() => window.dispatchEvent(new Event('shata-consent-settings'))}>إعدادات الخصوصية</Button></footer>;
}