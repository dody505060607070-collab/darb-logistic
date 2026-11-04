import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, MessageCircle, QrCode, RefreshCw, Send, Unplug } from "lucide-react";
import { toast } from "sonner";
import { Badge, Panel } from "@/components/darb/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { whatsappDisconnect, whatsappQr, whatsappSendTest, whatsappStatus } from "@/lib/whatsapp.functions";
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel } from '@/components/ui/alert-dialog';

const STATE_LABEL: Record<string, [string, "success" | "warning" | "danger" | "neutral"]> = {
  open: ["مربوط ويعمل", "success"],
  connecting: ["بانتظار مسح الرمز", "warning"],
  close: ["غير مربوط — امسح الرمز", "warning"],
  missing: ["الجلسة غير موجودة — اضغط إنشاء رمز QR", "warning"],
  unreachable: ["تعذّر الوصول للخادم", "danger"],
  error: ["الخادم رد بخطأ", "danger"],
  not_configured: ["لم يتم الربط", "neutral"],
};

/** WhatsApp gateway on the company's own server. Credentials live in secure server secrets, never in the browser. */
export function WhatsAppGatewayPanel() {
  const st = useQuery({ queryKey: ["whatsapp-status"], queryFn: () => whatsappStatus(), refetchInterval: (q) => (q.state.data?.state === "connecting" ? 5000 : false) });
  const [qr, setQr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [num, setNum] = useState("");
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const s = st.data;
  const [label, tone] = STATE_LABEL[s?.state ?? "not_configured"] ?? [s?.state ?? "—", "neutral"];

  async function getQr() {
    setBusy(true);
    try {
      const r = await whatsappQr();
      if (r.base64) setQr(r.base64.startsWith("data:") ? r.base64 : `data:image/png;base64,${r.base64}`);
      else toast.success("الرقم مربوط بالفعل");
      void st.refetch();
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  }
  async function test() {
    setBusy(true);
    try { await whatsappSendTest({ data: { number: num } }); toast.success("أُرسلت رسالة الاختبار"); }
    catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  }
  async function disconnect() {
    setBusy(true);
    try {
      await whatsappDisconnect();
      setQr(null); setConfirmDisconnect(false);
      await st.refetch();
      toast.success('تم فك الربط؛ يمكنك إنشاء رمز QR لربط رقم آخر');
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  }

  return (
    <Panel title="ربط واتساب (خادم الشركة)" icon={<MessageCircle />}>
      <div className="grid gap-5 lg:grid-cols-[1fr_240px]">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">الحالة</span>
            <span className="flex items-center gap-2">
              {st.isFetching ? <Loader2 className="size-4 animate-spin" /> : <Badge tone={tone}>{label}</Badge>}
              <Button type="button" variant="ghost" size="icon" aria-label="تحديث الحالة" title="تحديث الحالة" onClick={() => void st.refetch()}><RefreshCw className="size-4" /></Button>
            </span>
          </div>
          {s?.instance && <p className="text-xs text-muted-foreground">اسم الجلسة: <b dir="ltr">{s.instance}</b></p>}
          <div className="flex flex-wrap justify-between gap-2 border-b pb-3 text-sm"><span className="text-muted-foreground">رقم واتساب المربوط</span><b dir="ltr" className="num">{s?.number ?? (s?.state === 'open' ? 'تعذر قراءة الرقم' : 'لم يتم الربط')}</b></div>
          {st.error && <p role="alert" className="text-sm text-danger">{st.error.message}</p>}
          {s?.error && <p dir="ltr" className="break-all rounded-lg bg-danger-soft p-2 text-xs text-danger">{s.error}</p>}
          {!s?.configured && (
            <p className="text-sm text-muted-foreground">
              بيانات الخادم (الرابط، اسم الجلسة، المفتاح) تُحفظ بشكل آمن في إعدادات النظام السرية، ولا تظهر في المتصفح. بعد إضافتها اضغط «تحديث الحالة».
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button variant="gold" disabled={!s?.configured || busy} onClick={() => void getQr()}>{busy ? <Loader2 className="animate-spin" /> : <QrCode />} إنشاء رمز QR</Button>
            <Button variant="outline" disabled={s?.state !== 'open' || busy} onClick={() => setConfirmDisconnect(true)}><Unplug /> فك الربط وتغيير الرقم</Button>
          </div>
          <div className="grid gap-2 border-t pt-3 sm:grid-cols-[1fr_auto]">
            <div>
              <Label className="mb-1 block text-xs">رقم لتجربة الإرسال</Label>
              <Input dir="ltr" placeholder="9665xxxxxxxx" value={num} onChange={(e) => setNum(e.target.value)} />
            </div>
            <Button className="self-end" variant="outline" disabled={s?.state !== "open" || busy || !num} onClick={() => void test()}><Send /> إرسال رسالة اختبار</Button>
          </div>
          <p className="text-xs text-muted-foreground">لا تُرسل أي رسالة تلقائية قبل أن يكون الرقم «مربوط ويعمل» وتجرب رسالة الاختبار.</p>
        </div>
        <div className="grid place-items-center rounded-2xl border border-dashed p-4 text-center text-sm text-muted-foreground">
          {qr && s?.state !== "open" ? (
            <img src={qr} alt="رمز QR لربط واتساب" className="w-full max-w-[220px] rounded-xl bg-white p-2" />
          ) : (
            <>
              <QrCode className="mb-2 size-16 opacity-40" />
              {s?.state === "open" ? "الرقم مربوط ✅" : "رمز QR سيظهر هنا — امسحه من واتساب ← الأجهزة المرتبطة"}
            </>
          )}
        </div>
      </div>
      <AlertDialog open={confirmDisconnect} onOpenChange={setConfirmDisconnect}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader><AlertDialogTitle>فك ربط رقم واتساب؟</AlertDialogTitle><AlertDialogDescription>سيتوقف إرسال رسائل المهام والتذكيرات من الرقم الحالي {s?.number ?? ''} حتى تربط رقمًا جديدًا بمسح رمز QR. لن نحذف رقمك أو محادثاتك من هاتفك.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel disabled={busy}>إلغاء</AlertDialogCancel><Button variant="destructive" disabled={busy} onClick={() => void disconnect()}>{busy && <Loader2 className="animate-spin" />}تأكيد فك الربط</Button></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Panel>
  );
}
