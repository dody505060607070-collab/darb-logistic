import { flushWa } from "@/lib/wa-flush";
import { lazy, Suspense, useMemo, useState } from "react";
import { ClientOnly, createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Ban, CheckCircle2, ClipboardList, Coins, FileCheck2, Lock, MapPin, Package, Truck } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/darb/AppShell";
import { AssignForm } from "@/components/darb/AssignForm";
import { Badge, DataTable, KV, Loading, PageHeader, Panel, Status } from "@/components/darb/ui";
import { openFile } from "@/components/darb/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { db, useOne, useRows } from "@/lib/db";
import { TRIP_SELECT } from "@/lib/queries";
import { useAuth } from "@/lib/auth";
import { CITY_COORDS, errMsg, EVENT_LABELS, fmtDateTime, fmtNum, fmtSAR } from "@/lib/format";

const MapView = lazy(() => import("@/components/darb/MapView"));

export const Route = createFileRoute("/trips/$id")({
  head: () => ({
    meta: [
      { title: "تفاصيل الرحلة | Shata" },
      { name: "description", content: "تفاصيل الرحلة وخط الأحداث والمحطات وإثبات التسليم." },
      { property: "og:title", content: "تفاصيل الرحلة | Shata" },
      { property: "og:description", content: "خط الأحداث والمحطات وإثبات التسليم." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <AppShell>
      <TripDetails />
    </AppShell>
  ),
});

const OPS_EVENTS = ["arrived_pickup", "loading_start", "loading_end", "departed", "fuel_stop", "rest_stop", "arrived_delivery", "unloading_start", "unloading_end", "suspended", "breakdown", "resumed", "note"];

function TripDetails() {
  const { id } = Route.useParams();
  const { can } = useAuth();
  const qc = useQueryClient();
  const trip = useOne(["trips", id], () => db.from("trips").select(TRIP_SELECT).eq("id", id).maybeSingle());
  const events = useRows(["trip_events", id], () => db.from("trip_events").select("*").eq("trip_id", id).order("occurred_at"));
  const pods = useRows(["pods", id], () => db.from("pods").select("*").eq("trip_id", id));
  const bookings = useRows(["bookings", id], () => db.from("resource_bookings").select("*").eq("trip_id", id));
  const expenses = useRows(["expenses", "trip", id], () => db.from("expenses").select("*").eq("trip_id", id));
  const fuel = useRows(["fuel", "trip", id], () => db.from("fuel_entries").select("*").eq("trip_id", id));
  const showFin = can("ops_manager", "accountant");
  const fin = useOne(["trip_financials", id], () => db.from("trip_financials").select("*").eq("trip_id", id).maybeSingle(), showFin);
  const [ev, setEv] = useState("arrived_pickup");
  const [evLoc, setEvLoc] = useState("");
  const [cancelReason, setCancelReason] = useState("");

  const t = trip.data;
  const lines = useMemo(() => {
    if (!t) return [];
    const o = CITY_COORDS[t.origin_city], d = CITY_COORDS[t.dest_city];
    return o && d ? [{ id: "r", points: [o, d] as [number, number][], dashed: true }] : [];
  }, [t]);
  const markers = useMemo(() => {
    if (!t) return [];
    const m = [];
    const o = CITY_COORDS[t.origin_city], d = CITY_COORDS[t.dest_city];
    if (o) m.push({ id: "o", lat: o[0], lng: o[1], label: t.origin_city, color: "green" as const });
    if (d) m.push({ id: "d", lat: d[0], lng: d[1], label: t.dest_city, color: "red" as const });
    if (t.tractor?.last_lat) m.push({ id: "t", lat: t.tractor.last_lat, lng: t.tractor.last_lng, label: t.tractor.code, color: "gold" as const });
    return m;
  }, [t]);

  if (trip.isLoading) return <Loading />;
  if (!t) return <p className="text-muted-foreground">الرحلة غير موجودة أو لا تملك صلاحية عرضها.</p>;
  const ops = can("ops_manager", "dispatcher");
  const refresh = () => void qc.invalidateQueries();

  async function addEvent() {
    const { error } = await db.rpc("record_trip_event", { p_trip_id: id, p_event_type: ev, p_location: evLoc || null, p_client_event_id: crypto.randomUUID() });
    if (error) return void toast.error(errMsg(error));
    toast.success("تم تسجيل الحدث"); flushWa();
    setEvLoc("");
    refresh();
  }
  async function closeTrip() {
    const { error } = await db.rpc("close_trip", { p_trip_id: id });
    if (error) return void toast.error(errMsg(error));
    toast.success("أُغلقت الرحلة تشغيليًا (مستقل عن الإغلاق المالي)"); flushWa();
    refresh();
  }
  async function cancelTrip() {
    const { error } = await db.rpc("cancel_trip", { p_trip_id: id, p_reason: cancelReason });
    if (error) return void toast.error(errMsg(error));
    toast.success("أُلغيت الرحلة وحُررت الحجوزات"); flushWa();
    refresh();
  }
  const late = t.status === "in_progress" && t.planned_end && new Date(t.planned_end) < new Date();
  const totalExp = (expenses.data ?? []).filter((e) => e.status === "approved").reduce((s, e) => s + Number(e.amount), 0) + (fuel.data ?? []).filter((f) => f.status === "approved").reduce((s, f) => s + Number(f.amount), 0);

  return (
    <>
      <Link to="/trips" className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-primary"><ArrowRight className="size-4" /> الرحلات</Link>
      <PageHeader title={`الرحلة ${t.number}`} subtitle={`${t.origin_city} ← ${t.dest_city}${t.is_empty ? ` • رحلة فارغة (${t.empty_reason ?? ""})` : ""}`} icon={<Truck />}
        actions={<div className="flex items-center gap-2">
          <Status kind="trip" value={t.status} />
          {t.exception && <Badge tone="danger">{EVENT_LABELS[t.exception]}</Badge>}
          {late && <Badge tone="warning">متأخرة</Badge>}
          {ops && t.status === "delivered" && <Button onClick={() => void closeTrip()}><Lock /> إغلاق تشغيلي</Button>}
        </div>} />

      <div className="grid gap-5 xl:grid-cols-3">
        <Panel title="بيانات الرحلة" icon={<ClipboardList />}>
          <KV items={[
            ["أمر النقل", t.order?.number],
            ["العميل", t.order?.customer?.name],
            ["الرأس", t.tractor?.code],
            ["المقطورة", t.trailer?.code],
            ["السائق", t.driver?.full_name],
            ["الانطلاق المخطط", <span className="num">{fmtDateTime(t.planned_start)}</span>],
            ["الوصول المخطط", <span className="num">{fmtDateTime(t.planned_end)}</span>],
            ["موعد التسليم المتفق", <span className="num">{fmtDateTime(t.order?.delivery_due_at)}</span>],
            ["الانطلاق الفعلي", <span className="num">{fmtDateTime(t.actual_start)}</span>],
            ["التسليم الفعلي", <span className="num">{fmtDateTime(t.actual_end)}</span>],
            ["المسافة", t.distance_km ? `${fmtNum(t.distance_km)} كم` : "—"],
            ["الحمولة", t.order ? `${t.order.cargo_type} • ${fmtNum(t.order.quantity)} ${t.order.unit}` : "—"],
          ]} />
        </Panel>
        <Panel title="المسار" icon={<MapPin />} className="xl:col-span-2" actions={<span className="text-xs text-muted-foreground">آخر موقع للرأس: {fmtDateTime(t.tractor?.last_position_at)} ({t.tractor?.last_position_source ?? "—"})</span>}>
          <ClientOnly fallback={<Loading />}>
            <Suspense fallback={<Loading />}>
              <MapView markers={markers} lines={lines} height={330} />
            </Suspense>
          </ClientOnly>
        </Panel>
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-3">
        <Panel title="خط الأحداث" icon={<CheckCircle2 />} className="xl:col-span-2">
          {(events.data ?? []).length === 0 ? <p className="text-sm text-muted-foreground">لم تُسجل أحداث بعد.</p> : (
            <ol className="relative space-y-3 border-r-2 border-gold/40 pr-5">
              {events.data!.map((e) => (
                <li key={e.id} className="relative">
                  <span className="absolute top-1.5 -right-[27px] size-3 rounded-full border-2 border-card bg-gold" />
                  <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                    <b>{EVENT_LABELS[e.event_type] ?? e.event_type}</b>
                    <span className="num text-xs text-muted-foreground">{fmtDateTime(e.occurred_at)}{e.received_at && Math.abs(new Date(e.received_at).getTime() - new Date(e.occurred_at).getTime()) > 120000 ? ` • استُلم ${fmtDateTime(e.received_at)}` : ""}</span>
                  </div>
                  {(e.location_text || e.notes) && <p className="text-xs text-muted-foreground">{[e.location_text, e.notes].filter(Boolean).join(" — ")}</p>}
                </li>
              ))}
            </ol>
          )}
          {ops && !["closed", "cancelled", "delivered"].includes(t.status) && (
            <div className="mt-4 flex flex-wrap gap-2 border-t pt-4">
              <select value={ev} onChange={(e) => setEv(e.target.value)} className="h-9 rounded-md border border-input bg-card px-3 text-sm">
                {OPS_EVENTS.map((x) => <option key={x} value={x}>{EVENT_LABELS[x]}</option>)}
              </select>
              <Input className="w-48" placeholder="الموقع" value={evLoc} onChange={(e) => setEvLoc(e.target.value)} />
              <Button variant="soft" onClick={() => void addEvent()}>تسجيل حدث</Button>
            </div>
          )}
        </Panel>
        <Panel title="إثبات التسليم (POD)" icon={<FileCheck2 />}>
          {(pods.data ?? []).length === 0 ? <p className="text-sm text-muted-foreground">لا يوجد إثبات تسليم. يُسجل من تطبيق السائق عند التسليم.</p> : pods.data!.map((p) => (
            <div key={p.id} className="space-y-1 text-sm">
              <KV items={[
                ["المستلم", p.receiver_name],
                ["وقت الاستلام", <span className="num">{fmtDateTime(p.received_at)}</span>],
                ["الكمية المسلّمة", <span className="num">{fmtNum(p.qty_delivered)}</span>],
                ["نقص / تلف", <span className="num">{fmtNum(p.qty_short)} / {fmtNum(p.qty_damaged)}</span>],
                ["مصدر الموقع", p.location_source ?? "—"],
                ["الحالة", <Status kind="review" value={p.status === "submitted" ? "pending" : p.status === "accepted" ? "approved" : "rejected"} />],
              ]} />
              {p.notes && <p className="text-xs text-muted-foreground">{p.notes}</p>}
              {p.signature && <img src={p.signature} alt="توقيع المستلم" className="h-20 rounded border bg-card" />}
              <div className="flex flex-wrap gap-2">{p.photo_paths?.map((ph: string, i: number) => <button key={ph} className="text-xs text-gold underline" onClick={() => void openFile(ph)}>صورة {i + 1}</button>)}</div>
              {ops && p.status === "submitted" && (
                <div className="flex gap-2 pt-2">
                  <Button size="sm" onClick={async () => { const { error } = await db.from("pods").update({ status: "accepted" }).eq("id", p.id); if (error) toast.error(errMsg(error)); else refresh(); }}>قبول</Button>
                  <Button size="sm" variant="outline" onClick={async () => { const { error } = await db.from("pods").update({ status: "rejected" }).eq("id", p.id); if (error) toast.error(errMsg(error)); else refresh(); }}>رفض</Button>
                </div>
              )}
            </div>
          ))}
        </Panel>
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-3">
        {ops && !["delivered", "closed", "cancelled", "in_progress"].includes(t.status) && (
          <Panel title="تخصيص الموارد" icon={<Truck />} className="xl:col-span-2">
            <AssignForm trip={t} onDone={refresh} />
          </Panel>
        )}
        <Panel title="الحجوزات الزمنية" icon={<Package />}>
          <DataTable rows={bookings.data} loading={bookings.isLoading} cols={[
            { key: "resource_type", label: "المورد", render: (b) => ({ driver: "سائق", tractor: "رأس", trailer: "مقطورة" })[b.resource_type as "driver"] },
            { key: "period", label: "الفترة", render: (b) => <span className="num text-xs">{String(b.period).replace(/[[)"]/g, "").split(",").map((x) => fmtDateTime(x.trim())).join(" ← ")}</span> },
            { key: "active", label: "الحالة", render: (b) => (b.active ? <Badge tone="success">نشط</Badge> : <Badge>محرر</Badge>) },
          ]} />
        </Panel>
        {showFin && (
          <Panel title="الملخص المالي" icon={<Coins />}>
            <KV items={[
              ["الإيراد", <span className="num">{fmtSAR(fin.data?.revenue)}</span>],
              ["التكلفة التقديرية", <span className="num">{fmtSAR(fin.data?.est_cost)}</span>],
              ["تكلفة الناقل الخارجي", <span className="num">{fmtSAR(fin.data?.carrier_cost)}</span>],
              ["مصروفات ووقود معتمدة", <span className="num">{fmtSAR(totalExp)}</span>],
              ["الهامش المباشر الفعلي", <b className="num text-success">{fin.data ? fmtSAR(Number(fin.data.revenue) - Number(fin.data.carrier_cost) - totalExp) : "—"}</b>],
            ]} />
          </Panel>
        )}
        {ops && !["delivered", "closed", "cancelled"].includes(t.status) && (
          <Panel title="إلغاء الرحلة" icon={<Ban />}>
            <div className="flex gap-2">
              <Input placeholder="سبب الإلغاء (إلزامي)" value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} />
              <Button variant="destructive" onClick={() => void cancelTrip()}>إلغاء</Button>
            </div>
          </Panel>
        )}
      </div>
    </>
  );
}
