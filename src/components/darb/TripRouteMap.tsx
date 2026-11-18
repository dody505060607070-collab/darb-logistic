import { lazy, Suspense, useMemo, useState } from "react";
import { ClientOnly } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, ArrowDownWideNarrow, Check, ExternalLink, Loader2, MapPin, Navigation, Plus, RefreshCw, Send, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "./ui";
import { db, type Row } from "@/lib/db";
import { CITY_COORDS, errMsg, fmtDateTime, fmtNum } from "@/lib/format";
import { googleMapsDirections, orderNearestFirst, type LatLng } from "@/lib/route-plan";
import { planTripRoute } from "@/lib/trip-route.functions";
import { flushWa } from "@/lib/wa-flush";
import type { MapLine, MapMarker } from "./MapView";

const MapView = lazy(() => import("./MapView"));

type Place = { name?: string | null; city?: string | null; lat: number | null; lng: number | null } | null;
export type TripStop = { id: string; seq: number; name: string; city: string | null; lat: number; lng: number; notes: string | null; status: "pending" | "arrived" | "done" | "skipped"; done_at: string | null };
type TripAlert = { id: string; kind: "off_route" | "stopped" | "gps_lost"; opened_at: string; reason: string | null; minutes: number | null; distance_m: number | null };
export type TripPlan = { origin: Place; dest: Place; origin_city: string | null; dest_city: string | null; stops: TripStop[]; route: { points: [number, number][]; distance_km: number | null; duration_min: number | null; provider: "ors" | "straight"; computed_at: string } | null; alerts: TripAlert[] };

const STOP_LABEL: Record<TripStop["status"], [string, "neutral" | "info" | "success" | "warning"]> = {
  pending: ["لم يصل", "neutral"], arrived: ["وصل", "info"], done: ["تم التنزيل", "success"], skipped: ["تم التخطي", "warning"],
};

function point(p: Place, city: string | null | undefined): (LatLng & { label: string }) | null {
  if (p?.lat != null && p?.lng != null) return { lat: p.lat, lng: p.lng, label: p.name ?? p.city ?? city ?? "" };
  const c = city ? CITY_COORDS[city] : undefined;
  return c ? { lat: c[0], lng: c[1], label: city! } : null;
}

export function useTripPlan(tripId: string | null | undefined, enabled = true) {
  return useQuery({
    queryKey: ["trip_plan", tripId],
    enabled: !!tripId && enabled,
    refetchInterval: 60000,
    queryFn: async () => {
      const { data, error } = await db.rpc("driver_trip_plan", { p_trip_id: tripId });
      if (error) throw error;
      return data as TripPlan;
    },
  });
}

/**
 * Trip map with ordered drop-off points, the planned road and tracking alerts.
 * Drivers mark stops and explain alerts; dispatch adds, removes and re-orders stops.
 */
export function TripRouteMap({ tripId, tripStatus, mode, readOnly, truck, locations = [], height = 320 }: {
  tripId: string; tripStatus: string; mode: "driver" | "staff"; readOnly?: boolean;
  truck?: { lat: number; lng: number; label: string } | null; locations?: Row[]; height?: number;
}) {
  const qc = useQueryClient();
  const plan = useTripPlan(tripId);
  const replan = useServerFn(planTripRoute);
  const [busy, setBusy] = useState<string | null>(null);
  const [newStop, setNewStop] = useState("");
  const [reason, setReason] = useState<Record<string, string>>({});
  const p = plan.data;
  const origin = p ? point(p.origin, p.origin_city) : null;
  const dest = p ? point(p.dest, p.dest_city) : null;
  const stops = useMemo(() => p?.stops ?? [], [p]);
  const remaining = stops.filter((s) => s.status === "pending" || s.status === "arrived");
  const lastStop = stops[stops.length - 1];
  const destIsLastStop = !!(dest && lastStop && Math.abs(lastStop.lat - dest.lat) < 1e-5 && Math.abs(lastStop.lng - dest.lng) < 1e-5);

  const markers = useMemo<MapMarker[]>(() => {
    const m: MapMarker[] = [];
    if (origin) m.push({ id: "o", lat: origin.lat, lng: origin.lng, label: `التحميل: ${origin.label}`, color: "green" });
    stops.forEach((s, i) => m.push({ id: s.id, lat: s.lat, lng: s.lng, label: `${i + 1}. ${s.name}`, color: s.status === "done" || s.status === "skipped" ? "gray" : "gold", popup: s.notes ?? undefined }));
    if (dest && !destIsLastStop) m.push({ id: "d", lat: dest.lat, lng: dest.lng, label: `التسليم: ${dest.label}`, color: "red" });
    if (truck) m.push({ id: "t", lat: truck.lat, lng: truck.lng, label: truck.label, color: "blue" });
    return m;
  }, [origin, dest, stops, truck, destIsLastStop]);
  const lines = useMemo<MapLine[]>(() => {
    if (p?.route?.points?.length) return [{ id: "r", points: p.route.points, dashed: p.route.provider === "straight" }];
    const pts: [number, number][] = [origin, ...stops, destIsLastStop ? null : dest].filter(Boolean).map((x) => [x!.lat, x!.lng]);
    return pts.length > 1 ? [{ id: "r", points: pts, dashed: true }] : [];
  }, [p, origin, dest, stops, destIsLastStop]);

  const navTargets: LatLng[] = [...remaining, ...(dest && !destIsLastStop ? [dest] : [])];
  const gmaps = googleMapsDirections(mode === "staff" ? origin : null, navTargets.length ? navTargets : dest ? [dest] : []);
  const editable = mode === "staff" && !readOnly && !["delivered", "closed", "cancelled"].includes(tripStatus);
  const refresh = () => void qc.invalidateQueries({ queryKey: ["trip_plan", tripId] });

  async function run(key: string, fn: () => Promise<unknown>, ok?: string) {
    setBusy(key);
    try { await fn(); if (ok) toast.success(ok); refresh(); } catch (e) { toast.error(errMsg(e)); } finally { setBusy(null); }
  }
  const plan_ = async () => { const r = await replan({ data: { tripId } }); if (!r.ok) throw new Error(r.reason); };
  const stopAction = (s: TripStop, status: "arrived" | "done" | "skipped") => run(s.id + status, async () => {
    const { error } = await db.rpc("driver_stop_update", { p_stop_id: s.id, p_status: status });
    if (error) throw error;
    flushWa();
  }, status === "done" ? `تم التنزيل في ${s.name}` : status === "arrived" ? "تم تسجيل الوصول" : "تم تخطي النقطة");
  const addStop = () => run("add", async () => {
    const loc = locations.find((l) => l.id === newStop);
    if (!loc) throw new Error("اختر الموقع");
    const c = loc.lat != null ? [loc.lat, loc.lng] : CITY_COORDS[loc.city];
    if (!c) throw new Error("هذا الموقع بلا نقطة على الخريطة؛ عدّله وحدد مكانه أولًا");
    const { error } = await db.from("trip_stops").insert({ trip_id: tripId, seq: (stops[stops.length - 1]?.seq ?? 0) + 1, name: loc.name, city: loc.city, lat: c[0], lng: c[1], location_id: loc.id });
    if (error) throw error;
    setNewStop("");
    await plan_().catch(() => undefined);
  }, "أُضيفت نقطة التنزيل");
  const removeStop = (s: TripStop) => run(s.id + "del", async () => {
    const { error } = await db.from("trip_stops").delete().eq("id", s.id);
    if (error) throw error;
    await plan_().catch(() => undefined);
  }, "حُذفت النقطة");
  const reorder = () => run("order", async () => {
    if (!origin) throw new Error("حدد موقع التحميل أولًا");
    const fixed = stops.filter((s) => s.status === "done" || s.status === "skipped");
    const ordered = [...fixed, ...orderNearestFirst(truck ?? origin, stops.filter((s) => !fixed.includes(s)))];
    for (const [i, s] of ordered.entries()) {
      const { error } = await db.from("trip_stops").update({ seq: i + 1 }).eq("id", s.id);
      if (error) throw error;
    }
    await plan_();
  }, "رُتبت النقاط من الأقرب للأبعد وحُدّث المسار");
  const explain = (a: TripAlert) => run(a.id, async () => {
    const text = (reason[a.id] ?? "").trim();
    if (!text) throw new Error("اكتب السبب");
    const { error } = await db.rpc("driver_explain_alert", { p_alert_id: a.id, p_reason: text });
    if (error) throw error;
    flushWa();
  }, "وصل السبب للإدارة");

  if (plan.isLoading) return <div className="flex h-24 items-center justify-center text-muted-foreground"><Loader2 className="animate-spin" /></div>;
  if (plan.error) return <p role="alert" className="text-sm text-danger">{errMsg(plan.error)}</p>;

  return (
    <div className="space-y-3">
      {(p?.alerts ?? []).map((a) => (
        <div key={a.id} role="alert" className="space-y-2 rounded-2xl border border-danger/40 bg-danger-soft p-3 text-sm">
          <div className="flex items-center gap-2 font-bold text-danger"><AlertTriangle className="size-4" />
            {a.kind === "gps_lost" ? "انقطعت إشارة جهاز التتبع في المركبة" : a.kind === "stopped" ? `المركبة متوقفة منذ ${fmtNum(a.minutes ?? 0)} دقيقة خارج نقاط الرحلة` : `خروج عن المسار المخطط بحوالي ${fmtNum(Math.round((a.distance_m ?? 0) / 100) / 10)} كم`}
          </div>
          <p className="text-xs text-muted-foreground">منذ {fmtDateTime(a.opened_at)} — وصل تنبيه لمشرف الأسطول وموظف الحركة مع رقم السائق.</p>
          {a.reason ? <p>السبب من السائق: <b>{a.reason}</b></p> : mode === "driver" && !readOnly ? (
            <div className="flex gap-2">
              <Textarea rows={2} maxLength={300} placeholder={a.kind === "gps_lost" ? "هل الجهاز مفصول؟ مثال: عطل كهرباء، فحص ورشة" : a.kind === "stopped" ? "لماذا توقفت؟ مثال: زحمة، نقطة تفتيش، استراحة" : "لماذا غيرت الطريق؟ مثال: تحويلة، إغلاق طريق"} value={reason[a.id] ?? ""} onChange={(e) => setReason((r) => ({ ...r, [a.id]: e.target.value }))} />
              <Button size="sm" disabled={busy === a.id} onClick={() => void explain(a)}>{busy === a.id ? <Loader2 className="animate-spin" /> : <Send />} إرسال</Button>
            </div>
          ) : <p className="text-xs">لم يكتب السائق سببًا بعد.</p>}
        </div>
      ))}

      <ClientOnly fallback={<div style={{ height }} className="rounded-lg border" />}>
        <Suspense fallback={<div style={{ height }} className="rounded-lg border" />}>
          <MapView markers={markers} lines={lines} height={height} />
        </Suspense>
      </ClientOnly>

      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        {p?.route ? (
          <span>{p.route.provider === "ors" ? "مسار طرق الشاحنات" : "مسار تقريبي بخط مستقيم (خدمة الطرق غير متاحة الآن)"}{p.route.distance_km ? ` • ${fmtNum(p.route.distance_km)} كم` : ""}{p.route.duration_min ? ` • حوالي ${fmtNum(Math.round(p.route.duration_min / 6) / 10)} ساعة` : ""}</span>
        ) : <span>لم يُخطط المسار بعد — الخط المتقطع تقريبي.</span>}
        <span className="ms-auto flex flex-wrap gap-2">
          {gmaps && <Button size="sm" variant={mode === "driver" ? "gold" : "outline"} asChild><a href={gmaps} target="_blank" rel="noreferrer"><Navigation /> {mode === "driver" ? "ابدأ الملاحة في خرائط Google" : "فتح في خرائط Google"} <ExternalLink className="size-3" /></a></Button>}
          {editable && <Button size="sm" variant="outline" disabled={busy === "plan"} onClick={() => void run("plan", plan_, "حُدّث المسار")}>{busy === "plan" ? <Loader2 className="animate-spin" /> : <RefreshCw />} تحديث المسار</Button>}
        </span>
      </div>

      <ol className="space-y-2">
        {origin && <li className="flex items-center gap-2 rounded-xl border p-2 text-sm"><MapPin className="size-4 text-success" /><span className="text-muted-foreground">التحميل:</span><b>{origin.label}</b></li>}
        {stops.map((s, i) => (
          <li key={s.id} className="flex flex-wrap items-center gap-2 rounded-xl border p-2 text-sm">
            <span className="num flex size-6 items-center justify-center rounded-full bg-gold-soft text-xs font-bold text-primary">{i + 1}</span>
            <b>{s.name}</b>{s.city && <span className="text-xs text-muted-foreground">{s.city}</span>}
            <Badge tone={STOP_LABEL[s.status][1]}>{STOP_LABEL[s.status][0]}</Badge>
            <span className="ms-auto flex gap-1">
              {mode === "driver" && !readOnly && tripStatus === "in_progress" && s.status === "pending" && <Button size="sm" variant="outline" disabled={!!busy} onClick={() => void stopAction(s, "arrived")}><MapPin /> وصلت</Button>}
              {mode === "driver" && !readOnly && tripStatus === "in_progress" && (s.status === "pending" || s.status === "arrived") && <Button size="sm" disabled={!!busy} onClick={() => void stopAction(s, "done")}><Check /> تم التنزيل</Button>}
              {editable && tripStatus === "in_progress" && (s.status === "pending" || s.status === "arrived") && <Button size="sm" variant="ghost" disabled={!!busy} onClick={() => void stopAction(s, "skipped")}>تخطي</Button>}
              {editable && s.status === "pending" && <Button size="icon" variant="ghost" aria-label={`حذف ${s.name}`} disabled={!!busy} onClick={() => void removeStop(s)}><Trash2 className="size-4 text-danger" /></Button>}
            </span>
          </li>
        ))}
        {dest && !destIsLastStop && <li className="flex items-center gap-2 rounded-xl border p-2 text-sm"><MapPin className="size-4 text-danger" /><span className="text-muted-foreground">التسليم النهائي:</span><b>{dest.label}</b></li>}
      </ol>

      {editable && (
        <div className="flex flex-wrap gap-2">
          <select aria-label="نقطة تنزيل جديدة" className="h-9 min-w-48 flex-1 rounded-md border border-input bg-card px-3 text-sm" value={newStop} onChange={(e) => setNewStop(e.target.value)}>
            <option value="">اختر موقع نقطة تنزيل إضافية</option>
            {locations.map((l) => <option key={l.id} value={l.id}>{l.name} — {l.city}</option>)}
          </select>
          <Button size="sm" variant="soft" disabled={!newStop || busy === "add"} onClick={() => void addStop()}><Plus /> إضافة نقطة</Button>
          {stops.length > 1 && <Button size="sm" variant="outline" disabled={busy === "order"} onClick={() => void reorder()}><ArrowDownWideNarrow /> رتب من الأقرب للأبعد</Button>}
        </div>
      )}
    </div>
  );
}
