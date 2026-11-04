import { useState } from "react";
import { MessageCircle, QrCode } from "lucide-react";
import { Badge, Panel } from "@/components/darb/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/** WhatsApp gateway (self-hosted on the company's Ubuntu server). UI only until the server details are provided. */
export function WhatsAppGatewayPanel() {
  const [url, setUrl] = useState("");
  const [name, setName] = useState("");
  const [key, setKey] = useState("");
  return (
    <Panel title="ربط واتساب (خادم الشركة)" icon={<MessageCircle />}>
      <div className="grid gap-5 lg:grid-cols-[1fr_220px]">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex items-center justify-between sm:col-span-2"><span className="text-sm text-muted-foreground">الحالة</span><Badge>لم يتم الربط</Badge></div>
          <div className="sm:col-span-2"><Label className="mb-1 block text-xs">رابط الخادم (Server URL)</Label><Input dir="ltr" placeholder="https://wa.example.com" value={url} onChange={(e) => setUrl(e.target.value)} /></div>
          <div><Label className="mb-1 block text-xs">اسم الجلسة (Name)</Label><Input dir="ltr" placeholder="darb-main" value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div><Label className="mb-1 block text-xs">مفتاح الوصول (API Key)</Label><Input dir="ltr" type="password" placeholder="••••••••" value={key} onChange={(e) => setKey(e.target.value)} /></div>
          <p className="text-xs text-muted-foreground sm:col-span-2">المفتاح سيُحفظ بشكل آمن على الخادم عند تفعيل الربط، ولن يُرسل أي رسالة تلقائياً قبل موافقتك.</p>
          <div className="flex gap-2 sm:col-span-2">
            <Button variant="gold" disabled title="بانتظار بيانات الخادم">حفظ واختبار الاتصال</Button>
            <Button variant="outline" disabled>إنشاء رمز QR</Button>
          </div>
        </div>
        <div className="grid place-items-center rounded-2xl border border-dashed p-4 text-center text-sm text-muted-foreground">
          <QrCode className="mb-2 size-16 opacity-40" />
          رمز QR سيظهر هنا بعد الربط — امسحه من واتساب ← الأجهزة المرتبطة
        </div>
      </div>
    </Panel>
  );
}
