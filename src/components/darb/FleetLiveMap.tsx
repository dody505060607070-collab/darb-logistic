import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { ClientOnly, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Car, Crosshair, ExternalLink, Gauge, MapPin, Navigation, Radio, Route as RouteIcon, Search, Truck, User, X } from "lucide-react";
import { useScreenSearch } from "@/lib/screen-navigation";
import { Button } from "@/components/ui/button";
import { Badge, Loading, Status } from "./ui";
import { Input } from "@/components/ui/input";
import { db, type Row } from "@/lib/db";
import { fetchAssets, fetchTrips } from "@/lib/queries";
import { useAuth } from "@/lib/auth";
import { CITY_COORDS, fmtDateTime, fmtNum } from "@/lib/format";
import { agoLabel, freshReading, buildFleetVehicles, hasInsight, INSIGHT_LABEL, nearestVehicles, type FleetVehicle, type Insight, type VehicleState } from "@/lib/fleet-map";
import { useTripPlan } from "./TripRouteMap";
import type { MapLine, MapMarker } from "./MapView";

const MapView = lazy(() => import("./MapView"));

const STATE: Record<VehicleState, { label: string; color: MapMarker["color"]; tone: "success" | "gold" | "danger" | "neutral" }> = {
  moving: { label: "تتحرك", color: "green", tone: "success" },
  stopped: { label: "واقفة", color: "gold", tone: "gold" },
  disconnected: { label: "منقطعة", color: "red", tone: "danger" },
  unknown: { label: "غير معروفة", color: "gray", tone: "neutral" },
};

const DOT: Record<VehicleState, string> = { moving: "var(--success)", stopped: "var(--gold)", disconnected: "var(--danger)", unknown: "var(--muted-foreground)" };

async function rows(q: PromiseLike<{ data: unknown; error: unknown }>) {
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as Row[];
}

type Props = {
  height?: number | string;
  /** Small dashboard version: no side list or nearest-vehicle tool. */
  compact?: boolean;
  selected?: string | null;
  onSelect?: (key: string | null) => void;
};

/** Live map of every tracked vehicle (ضمان المهندس + Shata fleet), refreshed automatically. */
export function FleetLiveMap(props: Props) {
  return (
    <ClientOnly fallback={<div style={{ height: props.height ?? 420 }}><Loading /></div>}>
      <LiveMap {...props} />
    </ClientOnly>
  );
}

function LiveMap({ height = 420, compact = false, selected: selProp, onSelect }: Props) {
  const { can } = useAuth();
  const search = useScreenSearch();
  const canGps = can("ops_manager", "dispatcher", "fleet_supervisor");
  const provider = useQuery({ queryKey: ["gps-provider"], enabled: canGps, refetchInterval: 30000, queryFn: () => rows(db.from("gps_provider_vehicles").select("*").order("plate")) });
  const assets = useQuery({ queryKey: ["assets"], refetchInterval: 60000, queryFn: () => rows(fetchAssets()) });
  const trips = useQuery({ queryKey: ["trips"], refetchInterval: 60000, queryFn: () => rows(fetchTrips()) });
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const i = setInterval(() => setNow(Date.now()), 30000); return () => clearInterval(i); }, []);

  const mapBox = useRef<HTMLDivElement>(null);
  const [selLocal, setSelLocal] = useState<string | null>(null);
  const sel = selProp !== undefined ? selProp : selLocal;
  const select = (k: string | null) => { setSelLocal(k); onSelect?.(k); };
  const [stateF, setStateF] = useState<VehicleState | "all">("all");
  const [kindF, setKindF] = useState<"all" | "truck" | "car">("all");
  const [insight, setInsight] = useState<Insight | null>(search.insight === "moving_without_trip" ? "moving_without_trip" : null);
  const [q, setQ] = useState("");
  const [pick, setPick] = useState<{ lat: number; lng: number } | null>(null);

  const vehicles = useMemo(() => buildFleetVehicles(provider.data ?? [], assets.data ?? [], trips.data ?? [], now), [provider.data, assets.data, trips.data, now]);
  const shown = useMemo(() => vehicles.filter((v) =>
    (stateF === "all" || v.state === stateF) && (kindF === "all" || (kindF === "truck") === v.truck) && (!insight || hasInsight(v, insight, now)) &&
    (!q.trim() || `${v.plate} ${v.code ?? ""} ${v.driver ?? ""} ${v.tripNumber ?? ""}`.toLowerCase().includes(q.trim().toLowerCase())),
  ), [vehicles, stateF, kindF, insight, q, now]);
  const cur = vehicles.find((v) => v.key === sel) ?? null;

  const track = useQuery({
    queryKey: ["gps-track", cur?.assetId], enabled: canGps && !!cur?.assetId, refetchInterval: 60000,
    queryFn: () => rows(db.from("gps_readings").select("lat,lng,event_time").eq("asset_id", cur?.assetId ?? "").gte("event_time", new Date(Date.now() - 12 * 3600e3).toISOString()).order("event_time").limit(1000)),
  });
  const plan = useTripPlan(cur?.tripId, !!cur?.tripId);

  const markers = useMemo<MapMarker[]>(() => {
    const list = cur && !shown.includes(cur) ? [...shown, cur] : shown;
    const m: MapMarker[] = list.map((v) => ({
      id: v.key, lat: v.lat, lng: v.lng, label: v.plate, color: STATE[v.state].color, moving: v.state === "moving", selected: v.key === sel,
      sub: v.state === "moving" && v.speed ? `${fmtNum(v.speed)} كم/س` : undefined,
    }));
    const d = plan.data?.dest;
    if (cur && d?.lat != null && d?.lng != null) m.push({ id: "trip-dest", lat: d.lat, lng: d.lng, label: `التسليم: ${d.name ?? plan.data?.dest_city ?? ""}`, color: "red" });
    if (pick) m.push({ id: "pick", lat: pick.lat, lng: pick.lng, label: "النقطة المختارة", color: "blue", dot: true });
    return m;
  }, [shown, cur, sel, plan.data, pick]);

  const lines = useMemo<MapLine[]>(() => {
    if (cur) {
      const out: MapLine[] = [];
      const r = plan.data?.route;
      if (r?.points?.length) out.push({ id: "plan", points: r.points, color: "--info", dashed: r.provider === "straight" });
      const tr = (track.data ?? []).filter((p) => p.lat != null).map((p) => [Number(p.lat), Number(p.lng)] as [number, number]);
      if (tr.length > 1) out.push({ id: "track", points: [...tr, [cur.lat, cur.lng]], color: "--gold", width: 5 });
      return out;
    }
    return (trips.data ?? []).filter((t) => t.status === "in_progress").flatMap((t) => {
      const o = CITY_COORDS[t.origin_city], d = CITY_COORDS[t.dest_city];
      return o && d ? [{ id: t.id, points: [o, d] as [number, number][], dashed: true, color: "--info" }] : [];
    });
  }, [cur, plan.data, track.data, trips.data]);

  const counts = (s: VehicleState) => vehicles.filter((v) => v.state === s).length;
  const insights = (["idling", "speeding", "lost", "on_trip", "moving_without_trip"] as Insight[]).map((i) => [i, vehicles.filter((v) => hasInsight(v, i, now)).length] as const).filter(([, n]) => n > 0);
  const near = pick ? nearestVehicles(vehicles, pick.lat, pick.lng) : [];
  const lastSync = (provider.data ?? []).reduce<string | null>((m, p) => (p.synced_at && (!m || p.synced_at > m) ? p.synced_at : m), null);
  const loading = assets.isLoading || (canGps && provider.isLoading);

  const map = (
    <Suspense fallback={<div style={{ height }}><Loading /></div>}>
      <MapView cluster markers={markers} lines={lines} height={height} focusId={sel} focusOffset={[-150, -70]} onMarkerClick={(id) => { if (id !== "pick" && id !== "trip-dest") select(id); }}
        onMapClick={compact ? undefined : (lat, lng) => setPick({ lat, lng })}>
        <div className="pointer-events-none absolute top-2.5 left-14 z-[2] flex flex-wrap gap-1.5" dir="rtl">
          <span className="pointer-events-auto inline-flex items-center gap-1.5 rounded-full border bg-card/95 px-2.5 py-1 text-[11px] font-semibold shadow-sm backdrop-blur">
            <span className={`size-2 rounded-full ${provider.data?.length ? "animate-pulse bg-success" : "bg-warning"}`} />
            {provider.data?.length ? `مباشر • ${agoLabel(lastSync, now)}` : canGps ? "لا توجد بيانات GPS" : "آخر مواقع محفوظة"}
          </span>
        </div>
        {compact && (
          <div className="absolute top-14 right-2.5 z-[2] flex flex-col items-end gap-1.5" dir="rtl">
            {(["moving", "stopped", "disconnected"] as VehicleState[]).map((s) => (
              <button key={s} type="button" onClick={() => setStateF(stateF === s ? "all" : s)} aria-pressed={stateF === s}
                className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold shadow-sm backdrop-blur ${stateF === s ? "bg-primary text-primary-foreground" : "bg-card/95"}`}>
                <span className="size-2 rounded-full" style={{ background: DOT[s] }} />
                {STATE[s].label} <b className="num">{counts(s)}</b>
              </button>
            ))}
          </div>
        )}
        {cur && <VehicleCard v={cur} now={now} compact={compact} trackPoints={track.data?.length ?? 0} onClose={() => select(null)} />}
        {!compact && pick && (
          <div className="absolute bottom-2.5 left-2.5 z-[3] w-72 max-w-[calc(100%-20px)] rounded-2xl border bg-card/95 p-3 text-sm shadow-lg backdrop-blur" dir="rtl">
            <div className="mb-2 flex items-center justify-between gap-2">
              <b className="inline-flex items-center gap-1.5"><Crosshair className="size-4 text-info" /> أقرب المركبات لهذه النقطة</b>
              <button type="button" aria-label="إغلاق" onClick={() => setPick(null)} className="rounded-full p-1 hover:bg-muted"><X className="size-4" /></button>
            </div>
            {near.length === 0 ? <p className="text-xs text-muted-foreground">لا توجد مركبات بإشارة حديثة.</p> : (
              <ul className="space-y-1">
                {near.map(({ v, km }) => (
                  <li key={v.key}>
                    <button type="button" onClick={() => select(v.key)} className="flex w-full items-center justify-between gap-2 rounded-xl px-2 py-1.5 text-start hover:bg-muted">
                      <span className="inline-flex items-center gap-1.5"><span className="size-2 rounded-full" style={{ background: DOT[v.state] }} /><b className="num">{v.plate}</b>{v.tripId && <span className="text-[10px] text-muted-foreground">في رحلة</span>}</span>
                      <span className="num text-xs text-muted-foreground">{fmtNum(km, km < 10 ? 1 : 0)} كم</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-2 text-[10px] text-muted-foreground">المسافة خط مستقيم وليست طريق القيادة.</p>
          </div>
        )}
      </MapView>
    </Suspense>
  );

  const unavailable = provider.isError || assets.isError || trips.isError;
  const scope = <div className="space-y-1 px-3 py-2 text-xs" aria-label="نطاق التتبع">
    {unavailable ? <p role="alert" className="text-danger">بيانات التتبع أو الربط غير متاحة؛ لا يمكن تأكيد الأعداد الآن.</p> : loading ? <p>جارٍ تحميل التتبع…</p> : <p>أجهزة التتبع: {provider.data?.length ?? 0} · رؤوس مسجلة بالأسطول: {(assets.data ?? []).filter(a => a.kind !== 'trailer').length} · رحلات جارية: {(trips.data ?? []).filter(t => t.status === 'in_progress').length}</p>}
    {canGps && !unavailable && <Button size="sm" variant="link" className="h-auto whitespace-normal p-0 text-start" asChild><Link to="/tracking" search={{ insight: 'moving_without_trip' }}>مركبات مرتبطة تتحرك بدون رحلة جارية ({vehicles.filter(v => hasInsight(v, 'moving_without_trip', now)).length})</Link></Button>}
    <p className="text-muted-foreground">نطاق المزوّد يشمل الأجهزة غير المربوطة؛ حركة GPS لا تعني جاهزية الأصل أو وجود رحلة.</p>
    <p className="num text-muted-foreground">مزامنة المزوّد: {fmtDateTime(lastSync)} · قراءة الأسطول: {assets.dataUpdatedAt ? fmtDateTime(new Date(assets.dataUpdatedAt).toISOString()) : '—'} · الرحلات: {trips.dataUpdatedAt ? fmtDateTime(new Date(trips.dataUpdatedAt).toISOString()) : '—'}</p>
  </div>;
  if (unavailable) return <div>{scope}<Button size="sm" variant="outline" onClick={() => { void provider.refetch(); void assets.refetch(); void trips.refetch(); }}>إعادة المحاولة</Button></div>;
  if (compact) return <>{scope}{map}</>;

  return (
    <div className="grid min-w-0 gap-4 xl:grid-cols-[340px_minmax(0,1fr)]">
      <div className="order-2 flex min-w-0 flex-col gap-3 rounded-[24px] border bg-card p-3 xl:order-none" style={{ maxHeight: height }}>
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input aria-label="البحث عن مركبة" placeholder="رقم اللوحة أو السائق أو الرحلة…" value={q} onChange={(e) => setQ(e.target.value)} className="pr-9" />
        </div>
        <div className="flex flex-wrap gap-1.5 text-xs">
          {([["all", `الكل ${vehicles.length}`], ["moving", `تتحرك ${counts("moving")}`], ["stopped", `واقفة ${counts("stopped")}`], ["disconnected", `منقطعة ${counts("disconnected")}`]] as const).map(([k, l]) => (
            <button key={k} type="button" aria-pressed={stateF === k} onClick={() => setStateF(k)} className={`num rounded-full border px-2.5 py-1 font-semibold ${stateF === k ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}>{l}</button>
          ))}
        </div>
        <div className="flex flex-wrap gap-1.5 text-xs">
          {([["all", "كل الأنواع", null], ["truck", "شاحنات", Truck], ["car", "سيارات", Car]] as const).map(([k, l, Icon]) => (
            <button key={k} type="button" aria-pressed={kindF === k} onClick={() => setKindF(k)} className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 font-semibold ${kindF === k ? "bg-secondary" : "hover:bg-muted"}`}>{Icon && <Icon className="size-3.5" />}{l}</button>
          ))}
        </div>
        {insights.length > 0 && (
          <div className="rounded-2xl bg-muted/60 p-2">
            <p className="mb-1.5 text-[11px] font-semibold text-muted-foreground">تنبيهات ذكية</p>
            <div className="flex flex-wrap gap-1.5">
              {insights.map(([i, n]) => (
                <button key={i} type="button" aria-pressed={insight === i} onClick={() => setInsight(insight === i ? null : i)}
                  className={`num rounded-full border px-2.5 py-1 text-[11px] font-semibold ${insight === i ? "bg-gold text-primary" : i === "lost" || i === "speeding" ? "border-danger/40 text-danger" : i === "idling" ? "border-warning/50 text-warning" : "text-primary"}`}>
                  {INSIGHT_LABEL[i]} ({n})
                </button>
              ))}
            </div>
          </div>
        )}
        <p className="text-xs text-muted-foreground">القائمة المفلترة: {shown.length} مركبة</p>
        <ul className="min-h-0 flex-1 space-y-1 overflow-y-auto">
          {loading && <li><Loading /></li>}
          {!loading && shown.length === 0 && <li className="p-3 text-center text-sm text-muted-foreground">لا توجد مركبات مطابقة.</li>}
          {shown.map((v) => (
            <li key={v.key}>
              <button type="button" onClick={() => { select(v.key === sel ? null : v.key); if (window.innerWidth < 1280) mapBox.current?.scrollIntoView({ behavior: "smooth", block: "start" }); }} aria-current={v.key === sel}
                className={`flex w-full items-center gap-2.5 rounded-2xl border px-2.5 py-2 text-start transition-colors ${v.key === sel ? "border-gold bg-gold-soft" : "border-transparent hover:bg-muted"}`}>
                <span className="relative flex size-8 shrink-0 items-center justify-center rounded-full bg-muted">
                  {v.truck ? <Truck className="size-4" /> : <Car className="size-4" />}
                  <span className="absolute -bottom-0.5 -left-0.5 size-3 rounded-full border-2 border-card" style={{ background: DOT[v.state] }} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="num block truncate text-sm font-bold">{v.plate}</span>
                  <span className="block truncate text-[11px] text-muted-foreground">{v.driver ?? (v.assetId ? "بدون سائق" : "غير مربوطة بأسطول شتاء")}{v.tripNumber ? ` • ${v.tripNumber}` : ""}</span>
                </span>
                <span className="shrink-0 text-end">
                  <span className="num block text-[11px] font-semibold">{v.state === "moving" && v.speed != null ? `${fmtNum(v.speed)} كم/س` : STATE[v.state].label}</span>
                  <span className="num block text-[10px] text-muted-foreground">{agoLabel(v.at, now)}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
        <p className="text-[10px] text-muted-foreground">اضغط على أي مكان في الخريطة لمعرفة أقرب المركبات إليه.</p>
      </div>
      <div ref={mapBox} className="order-1 min-w-0 scroll-mt-20 xl:order-none">{scope}{map}</div>
    </div>
  );
}

function VehicleCard({ v, now, compact, trackPoints, onClose }: { v: FleetVehicle; now: number; compact: boolean; trackPoints: number; onClose: () => void }) {
  const st = STATE[v.state];
  const { can, viewAs } = useAuth();
  return (
    <div className="absolute right-2.5 bottom-2.5 z-[3] w-80 max-w-[calc(100%-20px)] rounded-2xl border bg-card/95 p-3 text-sm shadow-lg backdrop-blur" dir="rtl">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            {v.truck ? <Truck className="size-4 text-primary" /> : <Car className="size-4 text-primary" />}
            <b className="num truncate text-base">{v.plate}</b>
            <Badge tone={st.tone}>{st.label}</Badge>
          </div>
          <p className="mt-0.5 text-[11px] text-muted-foreground">{v.live ? "ضمان المهندس — آخر قراءة" : "آخر موقع محفوظ"} • {agoLabel(v.at, now)}</p>
        </div>
        <button type="button" aria-label="إغلاق" onClick={onClose} className="rounded-full p-1 hover:bg-muted"><X className="size-4" /></button>
      </div>
      <p className="mt-1 text-xs">{v.assetId ? `مربوطة بملف الأصل · ${v.code ?? ''} · ${v.assetKind === 'tractor' ? 'رأس' : v.assetKind === 'trailer' ? 'مقطورة' : 'مركبة'}` : 'غير مربوطة بأصل موثوق'}</p>
      <p className="text-xs">الإشارة: {freshReading(v.at, now) ? 'قراءة حديثة' : 'قراءة قديمة أو غير متاحة — لا تثبت الحركة الآن'}</p>
      {v.assetStatus && <p className="flex items-center gap-1 text-xs">الجاهزية التشغيلية: <Status kind="asset" value={v.assetStatus} /></p>}
      {!v.tripId && <p className="text-xs">لا توجد رحلة جارية مسجلة</p>}
      <div className="mt-2 grid grid-cols-2 gap-1.5 text-xs">
        <span className="inline-flex items-center gap-1.5 rounded-xl bg-muted px-2 py-1.5"><Gauge className="size-3.5" /> <span className="num">{v.speed != null ? `${fmtNum(v.speed)} كم/س` : "—"}</span></span>
        <span className="inline-flex items-center gap-1.5 rounded-xl bg-muted px-2 py-1.5"><Radio className="size-3.5" /> {v.ignition == null ? "المحرك —" : v.ignition ? "المحرك يعمل" : "المحرك مطفأ"}</span>
        <span className="col-span-2 inline-flex items-center gap-1.5 rounded-xl bg-muted px-2 py-1.5"><User className="size-3.5" /> {v.driver ?? "لا يوجد سائق مسجل"}</span>
        {v.tripNumber && <span className="col-span-2 inline-flex items-center gap-1.5 rounded-xl bg-muted px-2 py-1.5"><RouteIcon className="size-3.5" /> <span className="num">{v.tripNumber}</span> • {v.tripRoute}</span>}
        <span className="col-span-2 num text-[11px] text-muted-foreground">آخر قراءة: {fmtDateTime(v.at)}{trackPoints > 1 ? ` • المسار الذهبي = آخر 12 ساعة` : ""}</span>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5 text-xs">
        {compact && <Link to="/tracking" search={{ v: v.key }} className="inline-flex items-center gap-1 rounded-full bg-primary px-3 py-1.5 font-semibold text-primary-foreground"><MapPin className="size-3.5" /> فتح في التتبع</Link>}
        {v.tripId && <Link to="/trips/$id" params={{ id: v.tripId }} className="inline-flex items-center gap-1 rounded-full border px-3 py-1.5 font-semibold hover:bg-muted"><RouteIcon className="size-3.5" /> الرحلة</Link>}
        {!v.assetId && v.providerId && !viewAs && can('ops_manager', 'fleet_supervisor') && <Button size="sm" variant="outline" asChild><Link to="/tracking" search={{ v: v.key }} hash="device-linking">مراجعة ربط الجهاز</Link></Button>}
        {v.assetId && <Link to="/fleet/$id" params={{ id: v.assetId }} className="inline-flex items-center gap-1 rounded-full border px-3 py-1.5 font-semibold hover:bg-muted"><Truck className="size-3.5" /> المركبة</Link>}
        <a href={`https://www.google.com/maps/dir/?api=1&destination=${v.lat},${v.lng}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-full border px-3 py-1.5 font-semibold hover:bg-muted"><Navigation className="size-3.5" /> الاتجاهات <ExternalLink className="size-3" /></a>
      </div>
    </div>
  );
}
