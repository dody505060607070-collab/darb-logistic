import { lazy, Suspense, useMemo, useState } from "react";
import { ClientOnly, createFileRoute } from "@tanstack/react-router";
import { MapPin, Radio, Truck, WifiOff } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { integrationHealth } from "@/lib/integration-health.functions";
import { AppShell } from "@/components/darb/AppShell";
import { Badge, DataTable, KV, Loading, PageHeader, Panel, Status } from "@/components/darb/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { db, useRows, type Row } from "@/lib/db";
import { fetchAssets, fetchTrips } from "@/lib/queries";
import { useAuth } from "@/lib/auth";
import { CITY_COORDS, errMsg, fmtDateTime } from "@/lib/format";

const MapView = lazy(() => import("@/components/darb/MapView"));

export const Route = createFileRoute("/tracking")({
  head: () => ({
    meta: [
      { title: "التتبع المباشر — Shata" },
      { name: "description", content: "مواقع الرؤوس على خريطة المملكة وحالة الاتصال وآخر تحديث." },
      { property: "og:title", content: "التتبع المباشر — Shata" },
      { property: "og:description", content: "مواقع الرؤوس وحالة الاتصال وآخر تحديث." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <AppShell>
      <Tracking />
    </AppShell>
  ),
});

function freshness(at?: string | null): ["success" | "warning" | "danger", string] {
  if (!at) return ["danger", "لا توجد قراءة"];
  const m = (Date.now() - new Date(at).getTime()) / 60000;
  if (m < 15) return ["success", "حديث"];
  if (m < 120) return ["warning", "فجوة"];
  return ["danger", "منقطع"];
}

function Tracking() {
  const qc = useQueryClient();
  const { can } = useAuth();
  const checkHealth = useServerFn(integrationHealth);
  const health = useQuery({ queryKey: ['integration-health'], queryFn: () => checkHealth(), enabled: can('owner'), staleTime: 60000 });
  const assets = useRows(["assets"], fetchAssets);
  const trips = useRows(["trips"], fetchTrips);
  const [sel, setSel] = useState<string | null>(null);
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");
  const history = useRows(["gps", sel], () => db.from("gps_readings").select("*").eq("asset_id", sel).order("event_time", { ascending: false }).limit(50), !!sel);

  const tractors = (assets.data ?? []).filter((a) => a.kind !== "trailer");
  const tripOf = (id: string) => (trips.data ?? []).find((t) => t.tractor_id === id && t.status === "in_progress");
  const markers = useMemo(() => tractors.filter((a) => a.last_lat).map((a) => ({
    id: a.id, lat: a.last_lat, lng: a.last_lng, label: a.code,
    color: (a.id === sel ? "gold" : a.status === "active" ? "green" : a.status === "stopped" ? "red" : "blue") as "green",
  })), [tractors, sel]);
  const lines = useMemo(() => {
    const out: { id: string; points: [number, number][]; color?: string; dashed?: boolean }[] = [];
    (trips.data ?? []).filter((t) => t.status === "in_progress").forEach((t) => {
      const o = CITY_COORDS[t.origin_city], d = CITY_COORDS[t.dest_city];
      if (o && d) out.push({ id: t.id, points: [o, d], dashed: true });
    });
    if (sel && history.data?.length) out.push({ id: "h", points: [...history.data].reverse().map((h) => [h.lat, h.lng] as [number, number]), color: "#C5A574" });
    return out;
  }, [trips.data, history.data, sel]);
  const s: Row | undefined = tractors.find((a) => a.id === sel);
  const st = s ? tripOf(s.id) : null;

  async function manualReading() {
    if (!s) return;
    const la = Number(lat), lo = Number(lng);
    if (!(la > 15 && la < 33 && lo > 34 && lo < 56)) return void toast.error("الإحداثيات خارج نطاق المملكة");
    const { error } = await db.from("gps_readings").insert({ asset_id: s.id, reading_id: `manual-${crypto.randomUUID()}`, event_time: new Date().toISOString(), lat: la, lng: lo, source: "manual" });
    if (error) return void toast.error(errMsg(error));
    toast.success("سُجلت قراءة يدوية");
    setLat(""); setLng("");
    void qc.invalidateQueries({ queryKey: ["assets"] });
    void qc.invalidateQueries({ queryKey: ["gps"] });
  }

  return (
    <>
      <PageHeader title="التتبع المباشر" subtitle="آخر موقع معروف لكل رأس ومصدره ووقت تحديثه" icon={<MapPin />} />
      <div className="mb-5 flex items-start gap-3 rounded-lg border border-warning/40 bg-warning-soft p-3 text-sm">
        <WifiOff className="mt-0.5 size-5 text-warning" />
        <div>
          <b>ضمان المهندس — Eco5 Lite: لم يتم الربط</b>
          <p className="mt-1">المواقع المعروضة آخر قراءات محفوظة مع مصدرها ووقتها، وليست تتبعًا حيًا من ضمان المهندس.</p>
        </div>
      </div>
      <div className="grid gap-5 xl:grid-cols-[1fr_360px]">
        <Panel title="خريطة المملكة" icon={<Radio />}>
          <ClientOnly fallback={<Loading />}>
            <Suspense fallback={<Loading />}>
              <MapView markers={markers} lines={lines} height={520} onMarkerClick={setSel} />
            </Suspense>
          </ClientOnly>
        </Panel>
        <Panel title={s ? `الرأس ${s.code}` : "اختر رأسًا"} icon={<Truck />} actions={s && <Status kind="asset" value={s.status} />}>
          {!s ? <p className="text-sm text-muted-foreground">اضغط على رأس في الخريطة أو الجدول.</p> : (
            <>
              <KV items={[
                ["الرحلة الحالية", st?.number ?? "—"],
                ["المسار", st ? `${st.origin_city} ← ${st.dest_city}` : "—"],
                ["السائق", st?.driver?.full_name ?? "—"],
                ["آخر تحديث", <span className="num">{fmtDateTime(s.last_position_at)}</span>],
                ["المصدر", s.last_position_source ?? "—"],
                ["حالة الاتصال", <Badge tone={freshness(s.last_position_at)[0]}>{freshness(s.last_position_at)[1]}</Badge>],
                ["الوصول المتوقع", st ? <span className="num">{fmtDateTime(st.planned_end)} (تقديري)</span> : "—"],
              ]} />
              {can("ops_manager", "dispatcher") && (
                <div className="mt-4 space-y-2 border-t pt-4">
                  <p className="text-xs font-semibold">تسجيل قراءة يدوية</p>
                  <div className="flex gap-2">
                    <Input placeholder="خط العرض" value={lat} onChange={(e) => setLat(e.target.value)} />
                    <Input placeholder="خط الطول" value={lng} onChange={(e) => setLng(e.target.value)} />
                  </div>
                  <Button variant="soft" className="w-full" onClick={() => void manualReading()}>تسجيل</Button>
                  <p className="text-[11px] text-muted-foreground">القراءة الأقدم من الأحدث لا تستبدل آخر موقع (تُحفظ في التاريخ فقط).</p>
                </div>
              )}
              <p className="mt-4 mb-2 text-xs font-semibold">سجل القراءات</p>
              <div className="max-h-48 overflow-y-auto text-xs">
                {(history.data ?? []).map((h) => (
                  <div key={h.id} className="num flex justify-between border-b py-1"><span>{fmtDateTime(h.event_time)}</span><span>{h.source}</span></div>
                ))}
              </div>
            </>
          )}
        </Panel>
      </div>
      <Panel title="حالة الرؤوس" icon={<Truck />} className="mt-5">
        <DataTable rows={tractors} loading={assets.isLoading} onRowClick={(r) => setSel(r.id)} selectedId={sel} searchKeys={["code", "location_text"]} cols={[
          { key: "code", label: "الرأس", render: (r) => <span className="num font-semibold text-primary">{r.code}</span> },
          { key: "status", label: "الحالة", render: (r) => <Status kind="asset" value={r.status} /> },
          { key: "trip", label: "الرحلة", render: (r) => tripOf(r.id)?.number ?? "—" },
          { key: "loc", label: "الموقع", render: (r) => r.location_text ?? "—" },
          { key: "upd", label: "آخر تحديث", render: (r) => <span className="num">{fmtDateTime(r.last_position_at)}</span> },
          { key: "conn", label: "الاتصال", render: (r) => <Badge tone={freshness(r.last_position_at)[0]}>{freshness(r.last_position_at)[1]}</Badge> },
        ]} />
      </Panel>
    </>
  );
}
