import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Clock, Link2, Loader2, MapPin, Plus, RefreshCw, Satellite } from "lucide-react";
import { toast } from "sonner";
import { Badge, DataTable, Panel } from "@/components/darb/ui";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { db, type Row } from "@/lib/db";
import { damanSyncNow, damanVehicleStops } from "@/lib/daman-gps.functions";
import { DAMAN_GSM_LABEL, DAMAN_STATE_LABEL, DAMAN_TYPE_LABEL, damanAssetKind, isDamanTruck } from "@/lib/daman-gps";
import { errMsg, fmtDateTime, fmtNum, fmtTime, type Tone } from "@/lib/format";

const STATE_TONE: Record<string, Tone> = { moving: "success", stopped: "gold", disconnected: "danger" };

export function DamanStateBadge({ state }: { state: string | null | undefined }) {
  return <Badge tone={STATE_TONE[state ?? ""] ?? "neutral"}>{DAMAN_STATE_LABEL[state ?? ""] ?? state ?? "—"}</Badge>;
}

const riyadhDay = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Riyadh" }).format(new Date());
const today = () => new Date().toISOString().slice(0, 10);

/** Device subscription end: red once expired, gold within 30 days. */
export function SubscriptionBadge({ date }: { date: string | null | undefined }) {
  if (!date) return <span className="text-muted-foreground">—</span>;
  const days = Math.floor((Date.parse(date) - Date.parse(today())) / 86400000);
  if (days < 0) return <Badge tone="danger">منتهٍ {date}</Badge>;
  if (days <= 30) return <Badge tone="gold">ينتهي {date}</Badge>;
  return <span className="num text-xs">{date}</span>;
}

function deviceLine(r: Row) {
  const bits = [r.battery_pct != null ? `بطارية ${r.battery_pct}%` : null, r.gsm_state ? `شبكة ${DAMAN_GSM_LABEL[r.gsm_state] ?? r.gsm_state}` : null, r.satellites ? `أقمار ${r.satellites}` : null].filter(Boolean);
  return bits.length ? bits.join(" • ") : "—";
}

/** Stops and movements of one device for a chosen day, read live from the provider. */
function StopsDialog({ row, onClose }: { row: Row | null; onClose: () => void }) {
  const fetchStops = useServerFn(damanVehicleStops);
  const [day, setDay] = useState(riyadhDay());
  const q = useQuery({ queryKey: ["daman-stops", row?.provider_vehicle_id, day], queryFn: () => fetchStops({ data: { id: row!.provider_vehicle_id, day } }), enabled: !!row, staleTime: 60000 });
  const stops = (q.data ?? []).filter((x) => !x.moving);
  const total = stops.reduce((m, x) => m + (x.minutes ?? 0), 0);
  return (
    <Dialog open={!!row} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader><DialogTitle>توقفات المركبة {row?.plate ?? ""}</DialogTitle></DialogHeader>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Input type="date" aria-label="اليوم" className="w-44" value={day} max={riyadhDay()} onChange={(e) => e.target.value && setDay(e.target.value)} />
          {q.data && <span className="num text-muted-foreground">{fmtNum(stops.length)} توقف • مجموع {fmtNum(Math.floor(total / 60))} س {fmtNum(total % 60)} د</span>}
        </div>
        {q.isLoading ? <div className="flex h-24 items-center justify-center text-muted-foreground"><Loader2 className="animate-spin" /></div>
          : q.error ? <p role="alert" className="text-sm text-danger">{errMsg(q.error)}</p>
          : !stops.length ? <p className="text-sm text-muted-foreground">لا توجد توقفات مسجلة في هذا اليوم.</p>
          : <ul className="space-y-2">{stops.map((x, i) => (
            <li key={i} className="flex items-center justify-between gap-2 rounded-2xl border p-2.5 text-sm">
              <span className="num inline-flex items-center gap-1.5"><Clock className="size-4 text-muted-foreground" /> {fmtTime(x.from)} ← {fmtTime(x.to)}</span>
              <span className="num font-semibold">{x.minutes != null ? `${fmtNum(x.minutes)} د` : "—"}</span>
              <span className="text-xs text-muted-foreground">{x.ignition ? "المحرك يعمل" : "المحرك مطفأ"}</span>
              {x.lat != null && <a className="inline-flex items-center gap-1 text-xs text-primary underline" href={`https://maps.google.com/?q=${x.lat},${x.lng}`} target="_blank" rel="noreferrer"><MapPin className="size-3" /> الموقع</a>}
            </li>))}</ul>}
      </DialogContent>
    </Dialog>
  );
}

/** All vehicles reported by ضمان المهندس, with linking to Shata vehicles. */
export function DamanFleet({ rows, assets, loading, canLink, onSelect }: { rows: Row[]; assets: Row[]; loading: boolean; canLink: boolean; onSelect: (assetId: string | null, lat?: number, lng?: number) => void }) {
  const qc = useQueryClient();
  const sync = useServerFn(damanSyncNow);
  const [busy, setBusy] = useState<string | null>(null);
  const [kind, setKind] = useState<"all" | "truck" | "car">("all");
  const [stopsOf, setStopsOf] = useState<Row | null>(null);
  const shown = rows.filter((r) => kind === "all" || (kind === "truck") === isDamanTruck(r));
  const linkedIds = new Set(rows.map((r) => r.asset_id).filter(Boolean));
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["gps-provider"] });
    void qc.invalidateQueries({ queryKey: ["assets"] });
    void qc.invalidateQueries({ queryKey: ["gps"] });
  };

  async function syncNow() {
    setBusy("sync");
    try {
      const r = await sync();
      if (r.state === "connected") toast.success(r.detail); else toast.error(r.detail);
      refresh();
    } catch (e) { toast.error(errMsg(e)); } finally { setBusy(null); }
  }
  async function link(id: string, assetId: string) {
    setBusy(id);
    const { error } = await db.rpc("gps_link_vehicle", { p_id: id, p_asset_id: assetId || null });
    setBusy(null);
    if (error) return void toast.error(errMsg(error));
    toast.success(assetId ? "تم ربط جهاز التتبع بالمركبة" : "تم فك الربط");
    refresh();
  }
  async function addToFleet(r: Row) {
    const id = r.id;
    setBusy(id);
    const { error } = await db.rpc("gps_add_vehicle_to_fleet", { p_id: id, p_kind: damanAssetKind(r.vehicle_type) });
    setBusy(null);
    if (error) return void toast.error(errMsg(error));
    toast.success("أُضيفت المركبة إلى أسطول شتاء ورُبطت بجهازها");
    refresh();
  }

  const linkControl = (r: Row) => canLink ? (
    <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
      <select aria-label="ربط بمركبة" className="h-8 max-w-40 rounded-full border bg-background px-2 text-xs text-foreground" disabled={busy === r.id} value={r.asset_id ?? ""} onChange={(e) => void link(r.id, e.target.value)}>
        <option value="">غير مربوطة</option>
        {assets.filter((a) => a.kind !== "trailer" && (a.id === r.asset_id || !linkedIds.has(a.id))).map((a) => <option key={a.id} value={a.id}>{a.code}</option>)}
      </select>
      {!r.asset_id && <Button size="sm" variant="ghost" disabled={busy === r.id} title="إضافة إلى أسطول شتاء" onClick={() => void addToFleet(r)}><Plus /> إضافة</Button>}
    </div>
  ) : (r.asset_id ? <Badge tone="success"><Link2 className="size-3" /> مربوطة</Badge> : <Badge>غير مربوطة</Badge>);

  const last = rows.reduce<string | null>((m, r) => (!m || r.synced_at > m ? r.synced_at : m), null);
  return (
    <Panel
      title={`مركبات ضمان المهندس (${rows.length})`}
      icon={<Satellite />}
      className="mt-5"
      actions={<div className="flex items-center gap-2">
        {last && <span className="num text-xs text-muted-foreground">آخر مزامنة {fmtDateTime(last)}</span>}
        <Button size="sm" variant="soft" disabled={busy === "sync"} onClick={() => void syncNow()}><RefreshCw className={busy === "sync" ? "animate-spin" : ""} /> تحديث الآن</Button>
      </div>}
    >
      <p className="mb-3 text-xs text-muted-foreground">تتحدث المواقع تلقائيًا كل دقيقة، وبيانات الجهاز (السائق والعداد والبطارية والاشتراك) كل نصف ساعة. الشاحنات تُضاف لأسطول شتاء تلقائيًا، والسيارات الصغيرة تظهر على الخريطة ويمكن ربطها يدويًا. المركبة المربوطة تدخل مواقعها في سجلها وتنبيهات الرحلات.</p>
      <div className="mb-3 flex flex-wrap gap-2" role="group" aria-label="تصفية حسب النوع">
        {([["all", "الكل"], ["truck", "الشاحنات"], ["car", "السيارات"]] as const).map(([k, l]) => (
          <Button key={k} size="sm" variant={kind === k ? "default" : "soft"} aria-pressed={kind === k} onClick={() => setKind(k)}>
            {l} ({k === "all" ? rows.length : rows.filter((r) => (k === "truck") === isDamanTruck(r)).length})
          </Button>
        ))}
      </div>
      {/* Phone: one card per vehicle so the link controls stay visible without sideways scrolling. */}
      <div className="space-y-2 sm:hidden">
        {shown.map((r) => (
          <div key={r.id} className="rounded-2xl border p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="num font-semibold text-primary">{r.plate ?? "—"}</span>
              <DamanStateBadge state={r.vehicle_state} />
            </div>
            <div className="num mt-1 flex flex-wrap gap-x-3 text-xs text-muted-foreground">
              <span>{r.car_name ?? "—"}</span>
              <span>{r.speed_kmh != null ? `${Math.round(r.speed_kmh)} كم/س` : "—"}</span>
              <span>{fmtDateTime(r.gps_time)}</span>
            </div>
            <div className="num mt-1 flex flex-wrap gap-x-3 text-xs text-muted-foreground">
              {r.driver_name && <span>السائق: {r.driver_name}</span>}
              {r.odometer_km != null && <span>العداد {fmtNum(r.odometer_km)} كم</span>}
              <span>{deviceLine(r)}</span>
              {r.subscription_expires && <SubscriptionBadge date={r.subscription_expires} />}
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2">{linkControl(r)}<Button size="sm" variant="ghost" onClick={() => setStopsOf(r)}><Clock /> التوقفات</Button></div>
          </div>
        ))}
      </div>
      <div className="hidden sm:block">
      <DataTable rows={shown} loading={loading} searchKeys={["plate", "car_name", "driver_name"]} onRowClick={(r) => onSelect(r.asset_id ?? null, r.lat, r.lng)} cols={[
        { key: "plate", label: "اللوحة", render: (r) => <span className="num font-semibold text-primary">{r.plate ?? "—"}</span> },
        { key: "car_name", label: "النوع", render: (r) => <span>{r.car_name ?? "—"}{r.vehicle_type && <span className="block text-xs text-muted-foreground">{DAMAN_TYPE_LABEL[r.vehicle_type] ?? r.vehicle_type}</span>}</span> },
        { key: "driver_name", label: "السائق في الجهاز", render: (r) => r.driver_name ?? "—" },
        { key: "state", label: "الحالة", render: (r) => <DamanStateBadge state={r.vehicle_state} /> },
        { key: "speed", label: "السرعة", render: (r) => <span className="num">{r.speed_kmh != null ? `${Math.round(r.speed_kmh)} كم/س` : "—"}</span> },
        { key: "gps_time", label: "آخر إشارة", render: (r) => <span className="num text-xs">{fmtDateTime(r.gps_time)}</span> },
        { key: "odometer_km", label: "العداد", render: (r) => <span className="num text-xs">{r.odometer_km != null ? `${fmtNum(r.odometer_km)} كم` : "—"}</span> },
        { key: "device", label: "الجهاز", render: (r) => <span className="num text-xs">{deviceLine(r)}{r.wasl_linked && <span className="ms-1"><Badge tone="success">وصل</Badge></span>}</span> },
        { key: "subscription", label: "اشتراك الجهاز", render: (r) => <SubscriptionBadge date={r.subscription_expires} /> },
        { key: "asset", label: "مركبة شتاء", render: (r) => linkControl(r) },
        { key: "stops", label: "", render: (r) => <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); setStopsOf(r); }}><Clock /> التوقفات</Button> },
      ]} />
      </div>
      <StopsDialog row={stopsOf} onClose={() => setStopsOf(null)} />
    </Panel>
  );
}
