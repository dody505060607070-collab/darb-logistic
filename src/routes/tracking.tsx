import { useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Clock, PauseCircle, MapPin, Radio, Truck, WifiOff } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { integrationHealth } from "@/lib/integration-health.functions";
import { AppShell } from "@/components/darb/AppShell";
import { Badge, DataTable, KV, Kpi, PageHeader, Panel, Status } from "@/components/darb/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { db, useRows, type Row } from "@/lib/db";
import { fetchAssets, fetchTrips } from "@/lib/queries";
import { useAuth } from "@/lib/auth";
import { errMsg, fmtDateTime } from "@/lib/format";
import { DamanFleet, DamanStateBadge } from "@/components/darb/DamanFleet";
import { isDamanTruck } from "@/lib/daman-gps";
import { FleetLiveMap } from "@/components/darb/FleetLiveMap";

export const Route = createFileRoute("/tracking")({
  validateSearch: (s: Record<string, unknown>): { v?: string } => (typeof s.v === "string" && s.v ? { v: s.v } : {}),
  head: () => ({
    meta: [
      { title: "التتبع وآخر المواقع | Shata" },
      { name: "description", content: "مواقع الرؤوس على خريطة المملكة وحالة الاتصال وآخر تحديث." },
      { property: "og:title", content: "التتبع وآخر المواقع | Shata" },
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
  const { v } = Route.useSearch();
  const [sel, setSel] = useState<string | null>(v ?? null);
  const mapBox = useRef<HTMLDivElement>(null);
  const pick = (id: string | null) => { setSel(id); if (id) mapBox.current?.scrollIntoView({ behavior: "smooth", block: "start" }); };
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");
  const provider = useRows(["gps-provider"], () => db.from("gps_provider_vehicles").select("*").order("plate"), can("ops_manager", "dispatcher", "fleet_supervisor"));
  const providerRows = provider.data ?? [];
  const providerOf = (assetId: string) => providerRows.find((p) => p.asset_id === assetId);
  const gpsLive = providerRows.length > 0;
  const history = useRows(["gps", sel], () => db.from("gps_readings").select("*").eq("asset_id", sel).order("event_time", { ascending: false }).limit(50), !!sel && !sel.startsWith("gps:"));

  const tractors = (assets.data ?? []).filter((a) => a.kind !== "trailer");
  const tripOf = (id: string) => (trips.data ?? []).find((t) => t.tractor_id === id && t.status === "in_progress");
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
      <PageHeader title="التتبع" subtitle="آخر موقع معروف لكل رأس ومصدره ووقت تحديثه" icon={<MapPin />} />
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="إجمالي المركبات" value={tractors.length} icon={<Truck />} />
        <Kpi label="متوقفة" value={tractors.filter((a) => a.status === "stopped").length} icon={<PauseCircle />} tone="gold" />
        <Kpi label="بدون تحديث حديث" value={tractors.filter((a) => freshness(a.last_position_at)[0] !== "success").length} icon={<Clock />} tone="warning" />
        <Kpi label="بدون قراءة محفوظة" value={tractors.filter((a) => !a.last_position_at).length} icon={<WifiOff />} tone="neutral" />
      </div>
      {gpsLive ? (
        <div className="mb-5 flex items-start gap-3 rounded-lg border border-success/40 bg-success-soft p-3 text-sm">
          <Radio className="mt-0.5 size-5 text-success" />
          <div>
            <b>مربوط بأجهزة ضمان المهندس — {providerRows.length} مركبة</b>
            <p className="mt-1">تتحرك {providerRows.filter((p) => p.vehicle_state === "moving").length}، واقفة {providerRows.filter((p) => p.vehicle_state === "stopped").length}، منقطعة {providerRows.filter((p) => p.vehicle_state === "disconnected").length}. المواقع تتحدث كل دقيقة.</p>
            <p className="mt-1 text-xs text-muted-foreground">
              شاحنات: {providerRows.filter((p) => isDamanTruck(p)).length} (مربوطة بأسطول شتاء {providerRows.filter((p) => isDamanTruck(p) && p.asset_id).length}) • مربوطة بمنصة وصل {providerRows.filter((p) => p.wasl_linked).length}
              {providerRows.some((p) => p.subscription_expires && p.subscription_expires < new Date().toISOString().slice(0, 10)) && <> • <span className="text-danger">اشتراك جهاز منتهٍ: {providerRows.filter((p) => p.subscription_expires && p.subscription_expires < new Date().toISOString().slice(0, 10)).length}</span></>}
            </p>
          </div>
        </div>
      ) : (
        <div className="mb-5 flex items-start gap-3 rounded-lg border border-warning/40 bg-warning-soft p-3 text-sm">
          <WifiOff className="mt-0.5 size-5 text-warning" />
          <div>
            <b>GPS غير مربوط — آخر مواقع محفوظة، ليست بيانات حية</b>
            <p className="mt-1">المواقع المعروضة آخر قراءات محفوظة مع مصدرها ووقتها، وليست تتبعًا حيًا من ضمان المهندس.</p>
          </div>
        </div>
      )}
      <div ref={mapBox} className="scroll-mt-4">
        <FleetLiveMap height="max(600px, calc(100vh - 160px))" selected={sel} onSelect={setSel} />
      </div>
      <div className="mt-4">
        <Panel title={s ? `المركبة ${s.code}` : "تفاصيل المركبة"} icon={<Truck />} actions={s && <Status kind="asset" value={s.status} />}>
          {!s ? <p className="text-sm text-muted-foreground">{sel?.startsWith("gps:") ? "هذه المركبة من أجهزة ضمان المهندس وغير مربوطة بأسطول شتاء — اربطها من جدول ضمان المهندس بالأسفل." : "اضغط على مركبة في الخريطة أو القائمة."}</p> : (
            <>
              <KV items={[
                ["الرأس", s.code],
                ["المقطورة", st?.trailer?.code ?? "—"],
                ["آخر قراءة", s.location_text ?? "—"],
                ["الرحلة الحالية", st?.number ?? "—"],
                ["المسار", st ? `${st.origin_city} ← ${st.dest_city}` : "—"],
                ["السائق", st?.driver?.full_name ?? "—"],
                ["آخر تحديث", <span className="num">{fmtDateTime(s.last_position_at)}</span>],
                ["المصدر", s.last_position_source ?? "—"],
                ["حالة الربط", providerOf(s.id) ? <span className="inline-flex items-center gap-2"><Badge tone="success">ضمان المهندس</Badge><DamanStateBadge state={providerOf(s.id)?.vehicle_state} /></span> : <Badge tone="warning">GPS غير مربوط</Badge>],
                ["حداثة القراءة", <Badge tone={freshness(s.last_position_at)[0]}>{freshness(s.last_position_at)[1]}</Badge>],
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
      {(gpsLive || can("owner")) && (
        <DamanFleet rows={providerRows} assets={assets.data ?? []} loading={provider.isLoading} canLink={can("ops_manager", "fleet_supervisor")} onSelect={(id) => { if (id) pick(id); }} />
      )}
      <Panel title="حالة الرؤوس" icon={<Truck />} className="mt-5">
        <DataTable rows={tractors} loading={assets.isLoading} onRowClick={(r) => pick(r.id)} selectedId={sel} searchKeys={["code", "location_text"]} cols={[
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
