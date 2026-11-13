import { lazy, Suspense, useState } from "react";
import { ClientOnly } from "@tanstack/react-router";
import { Crosshair, MapPin, Plus, Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { db, type Row } from "@/lib/db";
import { CITY_COORDS, errMsg } from "@/lib/format";

const MapView = lazy(() => import("./MapView"));

/** Select an existing location or add a new one (by city, current GPS position or a map click). */
export function LocationPicker({ label, value, options, customerId, onChange, onCreated }: {
  label: string; value: string; options: Row[]; customerId?: string; onChange: (id: string) => void; onCreated: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [city, setCity] = useState("الرياض");
  const [pt, setPt] = useState<[number, number] | null>(null);
  const [busy, setBusy] = useState(false);
  const sel = "h-9 w-full rounded-md border border-input bg-card px-3 text-sm";
  const here = () => {
    if (!navigator.geolocation) return void toast.error("الجهاز لا يدعم تحديد الموقع");
    navigator.geolocation.getCurrentPosition((p) => setPt([p.coords.latitude, p.coords.longitude]), () => toast.error("تعذر قراءة موقعك — اسمح بالوصول للموقع"), { enableHighAccuracy: true, timeout: 10000 });
  };
  async function save() {
    if (name.trim().length < 2) return void toast.error("اكتب اسم الموقع");
    const c = pt ?? CITY_COORDS[city] ?? null;
    setBusy(true);
    const { data, error } = await db.from("locations").insert({ name: name.trim(), city, lat: c?.[0] ?? null, lng: c?.[1] ?? null, customer_id: customerId || null }).select().single();
    setBusy(false);
    if (error) return void toast.error(errMsg(error));
    onCreated(); onChange(data.id); setOpen(false); setName(""); setPt(null);
    toast.success("أُضيف الموقع");
  }
  return (
    <div className="flex gap-2">
      <select aria-label={label} className={sel} value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">{options.length ? "— اختر —" : "لا توجد مواقع — أضف موقعًا"}</option>
        {options.map((l) => <option key={l.id} value={l.id}>{l.name} — {l.city}</option>)}
      </select>
      <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)} aria-label={`إضافة ${label}`}><Plus /> جديد</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent dir="rtl" className="max-w-2xl">
          <DialogHeader><DialogTitle>إضافة {label}</DialogTitle></DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <div><Label className="mb-1 block text-xs">اسم الموقع</Label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="مثال: مستودع العميل — السلي" /></div>
            <div><Label className="mb-1 block text-xs">المدينة</Label>
              <select className={sel} value={city} onChange={(e) => { setCity(e.target.value); setPt(null); }}>{Object.keys(CITY_COORDS).map((c) => <option key={c}>{c}</option>)}</select></div>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <Button type="button" variant="soft" size="sm" onClick={here}><Crosshair /> موقعي الحالي</Button>
            <MapPin className="size-4" /> {pt ? `${pt[0].toFixed(5)}, ${pt[1].toFixed(5)}` : "اضغط على الخريطة لتحديد النقطة بدقة (وإلا يُستخدم مركز المدينة)"}
          </div>
          <ClientOnly fallback={<div className="h-[320px] rounded-lg border" />}>
            <Suspense fallback={<div className="h-[320px] rounded-lg border" />}>
              <MapView height={320} markers={pt ? [{ id: "p", lat: pt[0], lng: pt[1], label: name || "الموقع", color: "gold" }] : CITY_COORDS[city] ? [{ id: "c", lat: CITY_COORDS[city][0], lng: CITY_COORDS[city][1], label: city, color: "gray" }] : []} onMapClick={(lat, lng) => setPt([lat, lng])} />
            </Suspense>
          </ClientOnly>
          <Button disabled={busy} onClick={() => void save()}><Save /> حفظ الموقع</Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
