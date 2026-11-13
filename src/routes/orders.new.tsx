import { useMemo, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Box, FileText, Loader2, MapPin, Save, Truck, Coins } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/darb/AppShell";
import { PageHeader, Panel } from "@/components/darb/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { db, useRows, type Row } from "@/lib/db";
import { fetchAssets, fetchDrivers } from "@/lib/queries";
import { LocationPicker } from "@/components/darb/LocationPicker";
import { flushWa } from "@/lib/wa-flush";
import { CITY_COORDS, errMsg, fmtSAR, fromLocalInput } from "@/lib/format";

export const Route = createFileRoute("/orders/new")({
  head: () => ({
    meta: [
      { title: "معالج إنشاء أمر نقل ورحلة | Shata" },
      { name: "description", content: "إنشاء أمر نقل جديد وتخطيط الرحلة وتخصيص السائق والمركبة." },
      { property: "og:title", content: "إنشاء أمر نقل | Shata" },
      { property: "og:description", content: "إنشاء أمر نقل وتخطيط الرحلة." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <AppShell>
      <Wizard />
    </AppShell>
  ),
});

function haversine(a?: [number, number], b?: [number, number]) {
  if (!a || !b) return null;
  const R = 6371, r = Math.PI / 180;
  const dLat = (b[0] - a[0]) * r, dLng = (b[1] - a[1]) * r;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * r) * Math.cos(b[0] * r) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(x)) * 1.25); // road factor estimate
}

function F({ label, children, req }: { label: string; children: React.ReactNode; req?: boolean }) {
  return (
    <div><Label className="mb-1 block text-xs">{label} {req && <span className="text-danger">*</span>}</Label>{children}</div>
  );
}

function Wizard() {
  const nav = useNavigate();
  const qc = useQueryClient();
  const customers = useRows(["customers"], () => db.from("customers").select("*").order("name"));
  const locations = useRows(["locations"], () => db.from("locations").select("*").order("name"));
  const contracts = useRows(["contracts"], () => db.from("contracts").select("*").eq("status", "active"));
  const assets = useRows(["assets"], fetchAssets);
  const drivers = useRows(["drivers"], fetchDrivers);
  const [v, setV] = useState<Row>({ unit: "طرد", cargo_type: "بضائع عامة" });
  const [busy, setBusy] = useState(false);
  const set = (k: string, x: unknown) => setV((s) => ({ ...s, [k]: x }));

  const custLocs = (locations.data ?? []).filter((l) => !v.customer_id || l.customer_id === v.customer_id || !l.customer_id);
  const pick = (locations.data ?? []).find((l) => l.id === v.pickup_location_id);
  const drop = (locations.data ?? []).find((l) => l.id === v.delivery_location_id);
  const contract = (contracts.data ?? []).find((c) => c.customer_id === v.customer_id);
  const km = useMemo(
    () => haversine(pick?.lat ? [pick.lat, pick.lng] : CITY_COORDS[pick?.city], drop?.lat ? [drop.lat, drop.lng] : CITY_COORDS[drop?.city]),
    [pick, drop],
  );
  const suggested = contract
    ? contract.pricing_model === "per_trip" ? Number(contract.rate)
      : contract.pricing_model === "per_ton" ? Number(contract.rate) * (Number(v.weight_kg ?? 0) / 1000)
      : contract.pricing_model === "per_km" ? Number(contract.rate) * (km ?? 0) : null
    : null;
  const price = Number(v.price ?? suggested ?? 0);
  const cost = Number(v.est_cost ?? 0);

  async function save(withTrip: boolean) {
    if (!v.customer_id || !v.pickup_location_id || !v.delivery_location_id) return void toast.error("أكمل العميل ومواقع التحميل والتسليم");
    if (!v.pickup_at || !v.delivery_due_at) return void toast.error("حدد مواعيد التحميل والتسليم");
    setBusy(true);
    try {
      const { data: order, error } = await db.from("transport_orders").insert({
        customer_id: v.customer_id,
        contract_id: contract?.id ?? null,
        contract_snapshot: contract ? { number: contract.number, version: contract.version, pricing_model: contract.pricing_model, rate: contract.rate, free_wait_hours: contract.free_wait_hours, wait_fee_per_hour: contract.wait_fee_per_hour } : null,
        shipper: v.shipper || null,
        consignee: v.consignee || null,
        cargo_type: v.cargo_type,
        quantity: v.quantity ? Number(v.quantity) : null,
        unit: v.unit,
        weight_kg: v.weight_kg ? Number(v.weight_kg) : null,
        pickup_location_id: v.pickup_location_id,
        delivery_location_id: v.delivery_location_id,
        pickup_at: fromLocalInput(v.pickup_at),
        delivery_due_at: fromLocalInput(v.delivery_due_at),
        requirements: v.requirements || null,
        price,
        notes: v.notes || null,
        status: withTrip ? "confirmed" : "draft",
      }).select().single();
      if (error) throw error;
      if (withTrip) {
        const { data: trip, error: e2 } = await db.from("trips").insert({
          order_id: order.id,
          origin_city: pick!.city,
          dest_city: drop!.city,
          origin_location_id: pick!.id,
          dest_location_id: drop!.id,
          planned_start: fromLocalInput(v.pickup_at),
          planned_end: fromLocalInput(v.delivery_due_at),
          distance_km: km,
          cargo_weight_tons: v.weight_kg ? Number(v.weight_kg) / 1000 : null,
        }).select().single();
        if (e2) throw e2;
        await db.from("trip_financials").insert({ trip_id: trip.id, revenue: price, est_cost: cost });
        if (v.driver_id && !v.tractor_id) toast.warning("اخترت سائقًا بدون شاحنة — لن يُكلَّف السائق ولن تصله رسالة حتى تختار رأس القاطرة");
        if (v.driver_id && v.tractor_id) {
          const { error: e3 } = await db.rpc("assign_trip_resources", {
            p_trip_id: trip.id, p_driver_id: v.driver_id, p_tractor_id: v.tractor_id, p_trailer_id: v.trailer_id || null,
            p_start: fromLocalInput(v.pickup_at), p_end: fromLocalInput(v.delivery_due_at), p_override_reason: null,
          });
          if (e3) toast.warning(`أُنشئت الرحلة لكن التخصيص لم يتم: ${errMsg(e3)}`);
        }
        flushWa();
        toast.success(`تم إنشاء الأمر ${order.number} والرحلة ${trip.number}`);
        void qc.invalidateQueries();
        void nav({ to: "/trips/$id", params: { id: trip.id } });
      } else {
        flushWa();
        toast.success(`تم حفظ الأمر ${order.number} كمسودة`);
        void qc.invalidateQueries();
        void nav({ to: "/orders" });
      }
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  }

  const sel = "h-9 w-full rounded-md border border-input bg-card px-3 text-sm";

  return (
    <>
      <PageHeader title="معالج إنشاء أمر نقل ورحلة" subtitle="إنشاء أمر نقل جديد وتخطيط الرحلة وتخصيص السائق والمركبة والتكلفة المتوقعة." icon={<FileText />}
        actions={<>
          <Button variant="outline" onClick={() => void nav({ to: "/orders" })}>إلغاء</Button>
          <Button variant="soft" disabled={busy} onClick={() => void save(false)}><Save /> حفظ كمسودة</Button>
          <Button variant="gold" disabled={busy} onClick={() => void save(true)}>{busy ? <Loader2 className="animate-spin" /> : <Truck />} حفظ وإنشاء الرحلة</Button>
        </>} />
      <div className="grid gap-5 xl:grid-cols-[1fr_320px]">
        <div className="space-y-5">
          <Panel title="1. بيانات أمر النقل" icon={<FileText />}>
            <div className="grid gap-3 sm:grid-cols-3">
              <F label="العميل" req>
                <select className={sel} value={v.customer_id ?? ""} onChange={(e) => set("customer_id", e.target.value)}>
                  <option value="">— اختر —</option>
                  {(customers.data ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </F>
              <F label="المرسل"><Input value={v.shipper ?? ""} onChange={(e) => set("shipper", e.target.value)} /></F>
              <F label="المستلم"><Input value={v.consignee ?? ""} onChange={(e) => set("consignee", e.target.value)} /></F>
            </div>
            {contract && <p className="mt-3 rounded-md bg-gold-soft px-3 py-2 text-xs">العقد {contract.number} (إصدار {contract.version}) — {contract.pricing_model === "per_trip" ? "سعر للرحلة" : contract.pricing_model === "per_ton" ? "سعر للطن" : contract.pricing_model === "per_km" ? "سعر للكيلومتر" : "اتفاقي"}: {fmtSAR(contract.rate)}. تُحفظ نسخة من الشروط مع الأمر.</p>}
          </Panel>
          <Panel title="2. تفاصيل الرحلة" icon={<MapPin />}>
            <div className="grid gap-3 sm:grid-cols-2">
              <F label="موقع التحميل" req>
                <LocationPicker label="موقع التحميل" value={v.pickup_location_id ?? ""} options={custLocs} customerId={v.customer_id} onChange={(id) => set("pickup_location_id", id)} onCreated={() => void locations.refetch()} />
              </F>
              <F label="موقع التسليم" req>
                <LocationPicker label="موقع التسليم" value={v.delivery_location_id ?? ""} options={custLocs} customerId={v.customer_id} onChange={(id) => set("delivery_location_id", id)} onCreated={() => void locations.refetch()} />
              </F>
              <F label="تاريخ ووقت التحميل" req><Input type="datetime-local" value={v.pickup_at ?? ""} onChange={(e) => set("pickup_at", e.target.value)} /></F>
              <F label="موعد التسليم المتفق عليه" req><Input type="datetime-local" value={v.delivery_due_at ?? ""} onChange={(e) => set("delivery_due_at", e.target.value)} /></F>
            </div>
          </Panel>
          <div className="grid gap-5 lg:grid-cols-2">
            <Panel title="3. تخصيص السائق والمركبة (اختياري)" icon={<Truck />}>
              <div className="grid gap-3">
                <F label="السائق">
                  <select className={sel} value={v.driver_id ?? ""} onChange={(e) => set("driver_id", e.target.value)}>
                    <option value="">لاحقًا</option>
                    {(drivers.data ?? []).filter((d) => d.status !== "suspended").map((d) => <option key={d.id} value={d.id}>{d.full_name}</option>)}
                  </select>
                </F>
                <F label="رأس القاطرة">
                  <select className={sel} value={v.tractor_id ?? ""} onChange={(e) => set("tractor_id", e.target.value)}>
                    <option value="">لاحقًا</option>
                    {(assets.data ?? []).filter((a) => a.kind !== "trailer").map((a) => <option key={a.id} value={a.id}>{a.code} — {a.make_model}</option>)}
                  </select>
                </F>
                <F label="المقطورة">
                  <select className={sel} value={v.trailer_id ?? ""} onChange={(e) => set("trailer_id", e.target.value)}>
                    <option value="">بدون</option>
                    {(assets.data ?? []).filter((a) => a.kind === "trailer").map((a) => <option key={a.id} value={a.id}>{a.code} — {a.trailer_type}</option>)}
                  </select>
                </F>
              </div>
            </Panel>
            <Panel title="4. تفاصيل الحمولة" icon={<Box />}>
              <div className="grid grid-cols-2 gap-3">
                <F label="وصف الحمولة" req><Input value={v.cargo_type ?? ""} onChange={(e) => set("cargo_type", e.target.value)} /></F>
                <F label="الوزن (كجم)"><Input type="number" value={v.weight_kg ?? ""} onChange={(e) => set("weight_kg", e.target.value)} /></F>
                <F label="الكمية"><Input type="number" value={v.quantity ?? ""} onChange={(e) => set("quantity", e.target.value)} /></F>
                <F label="الوحدة">
                  <select className={sel} value={v.unit} onChange={(e) => set("unit", e.target.value)}>
                    {["طرد", "منصة", "كرتون", "طن", "حاوية", "لتر"].map((u) => <option key={u}>{u}</option>)}
                  </select>
                </F>
              </div>
            </Panel>
          </div>
          <Panel title="5. التكلفة والإيراد (تقديري)" icon={<Coins />}>
            <div className="grid gap-3 sm:grid-cols-3">
              <F label="إيراد النقل (ر.س)" req><Input type="number" placeholder={suggested ? String(suggested) : ""} value={v.price ?? ""} onChange={(e) => set("price", e.target.value)} /></F>
              <F label="التكلفة التشغيلية التقديرية (ر.س)"><Input type="number" value={v.est_cost ?? ""} onChange={(e) => set("est_cost", e.target.value)} /></F>
              <F label="المتطلبات"><Input value={v.requirements ?? ""} onChange={(e) => set("requirements", e.target.value)} placeholder="تبريد، تصاريح…" /></F>
            </div>
            <div className="mt-3"><Label className="mb-1 block text-xs">ملاحظات</Label><Textarea value={v.notes ?? ""} onChange={(e) => set("notes", e.target.value)} maxLength={200} /></div>
          </Panel>
        </div>
        <div className="space-y-5">
          <Panel title="تفاصيل المسار" icon={<MapPin />}>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">من</span><b>{pick?.city ?? "—"}</b></div>
              <div className="flex justify-between"><span className="text-muted-foreground">إلى</span><b>{drop?.city ?? "—"}</b></div>
              <div className="flex justify-between"><span className="text-muted-foreground">المسافة التقديرية</span><b className="num">{km ? `${km} كم` : "—"}</b></div>
              <p className="text-xs text-muted-foreground">تقدير خط مستقيم × معامل طريق. مسار الشاحنات الفعلي يحتاج مزود توجيه يدعم قيود الشاحنات.</p>
            </div>
          </Panel>
          <Panel title="ملخص مالي تقديري" icon={<Coins />}>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between"><span>إيراد النقل</span><b className="num">{fmtSAR(price)}</b></div>
              <div className="flex justify-between"><span>تكلفة التشغيل</span><b className="num">{fmtSAR(cost)}</b></div>
              <div className="flex justify-between rounded-md bg-success-soft px-2 py-1.5 text-success"><span>الهامش المباشر المتوقع</span><b className="num">{fmtSAR(price - cost)}</b></div>
              <div className="flex justify-between"><span>نسبة الهامش</span><b className="num">{price ? `${(((price - cost) / price) * 100).toFixed(1)}%` : "—"}</b></div>
            </div>
          </Panel>
        </div>
      </div>
    </>
  );
}
