import { useMemo, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { AlertTriangle, CalendarRange, Cog, Plus, RefreshCw, Truck, Users } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/darb/AppShell";
import { AssignForm } from "@/components/darb/AssignForm";
import { Badge, DataTable, Kpi, PageHeader, Panel, Status } from "@/components/darb/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { db, useRows, type Row } from "@/lib/db";
import { fetchAssets, fetchDrivers, fetchTrips } from "@/lib/queries";
import { fmtTime } from "@/lib/format";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/operations")({
  head: () => ({
    meta: [
      { title: "غرفة العمليات وجدول تخصيص الموارد — Shata" },
      { name: "description", content: "متابعة العمليات لحظيًا وتخصيص السائقين والرؤوس والمقطورات للرحلات." },
      { property: "og:title", content: "غرفة العمليات — Shata" },
      { property: "og:description", content: "متابعة العمليات وتخصيص الموارد." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <AppShell>
      <Ops />
    </AppShell>
  ),
});

function parseRange(p: string): [number, number] {
  const [a, b] = String(p).replace(/[[)"]/g, "").split(",");
  return [new Date(a!.trim()).getTime(), new Date(b!.trim()).getTime()];
}

function Ops() {
  const nav = useNavigate();
  const qc = useQueryClient();
  const trips = useRows(["trips"], fetchTrips);
  const assets = useRows(["assets"], fetchAssets);
  const drivers = useRows(["drivers"], fetchDrivers);
  const [day, setDay] = useState(() => new Date().toISOString().slice(0, 10));
  const bookings = useRows(["bookings", "all"], () => db.from("resource_bookings").select("*, trip:trips(number,status)").eq("active", true));

  const t = trips.data ?? [];
  const a = assets.data ?? [];
  const tractors = a.filter((x) => x.kind !== "trailer");
  const trailers = a.filter((x) => x.kind === "trailer");
  const late = t.filter((x) => x.status === "in_progress" && x.planned_end && new Date(x.planned_end) < new Date());
  const notReady = (x: Row) => {
    const r: string[] = [];
    if (!x.driver_id) r.push("بدون سائق");
    if (!x.tractor_id) r.push("بدون رأس");
    if (!x.trailer_id && !x.is_empty) r.push("بدون مقطورة");
    return r;
  };
  const pending = t.filter((x) => ["draft", "planned", "ready"].includes(x.status));

  // timeline window for selected day (Riyadh)
  const dayStart = new Date(`${day}T00:00:00+03:00`).getTime();
  const dayEnd = dayStart + 864e5;
  const rows = useMemo(() => {
    const b = bookings.data ?? [];
    const res: { key: string; label: string; type: string; items: { from: number; to: number; num: string; status: string }[] }[] = [];
    const add = (type: string, list: Row[], label: (r: Row) => string) =>
      list.forEach((r) =>
        res.push({
          key: r.id,
          type,
          label: label(r),
          items: b.filter((x) => x.resource_id === r.id && x.resource_type === type).map((x) => {
            const [f, to] = parseRange(x.period);
            return { from: f, to, num: x.trip?.number, status: x.trip?.status };
          }).filter((i) => i.to > dayStart && i.from < dayEnd),
        }),
      );
    add("driver", drivers.data ?? [], (r) => r.full_name);
    add("tractor", tractors, (r) => r.code);
    add("trailer", trailers, (r) => r.code);
    return res;
  }, [bookings.data, drivers.data, tractors, trailers, dayStart, dayEnd]);

  const avail = (list: Row[], key: string) => {
    const booked = new Set((bookings.data ?? []).filter((x) => x.resource_type === key).map((x) => x.resource_id));
    return [list.length, booked.size, list.filter((x) => !booked.has(x.id) && !["maintenance", "stopped", "suspended", "off"].includes(x.status)).length];
  };

  return (
    <>
      <PageHeader title="غرفة العمليات وجدول تخصيص الموارد" subtitle="متابعة العمليات لحظيًا وتخطيط الرحلات وتخصيص الشاحنات والمقطورات والسائقين" icon={<Cog />}
        actions={<>
          <Button variant="outline" onClick={() => void qc.invalidateQueries()}><RefreshCw /> تحديث</Button>
          <Button variant="gold" asChild><Link to="/orders/new"><Plus /> إنشاء رحلة جديدة</Link></Button>
        </>} />
      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-6">
        <Kpi label="رحلات مجدولة" value={t.filter((x) => x.status === "planned").length} tone="info" />
        <Kpi label="قيد التنفيذ" value={t.filter((x) => x.status === "in_progress").length} tone="success" />
        <Kpi label="مكتملة" value={t.filter((x) => ["delivered", "closed"].includes(x.status)).length} tone="gold" />
        <Kpi label="متأخرة" value={late.length} tone={late.length ? "danger" : undefined} />
        <Kpi label="رؤوس متاحة" value={tractors.filter((x) => x.status === "available").length} />
        <Kpi label="مقطورات متاحة" value={trailers.filter((x) => x.status === "available").length} />
      </div>

      <div className="operations-layout grid items-start gap-5">
      <div className="min-w-0 space-y-5">
      <Panel title="جدول تخصيص الموارد" icon={<CalendarRange />} actions={<Input type="date" value={day} onChange={(e) => setDay(e.target.value)} className="w-40" />} bodyClass="resource-timeline">
        <div className="overflow-x-auto">
          <div className="min-w-[900px]">
            <div className="mb-1 grid grid-cols-[160px_1fr] text-[10px] text-muted-foreground">
              <span />
              <div className="grid grid-cols-12">{Array.from({ length: 12 }, (_, i) => <span key={i} className="num border-r pr-1">{String(i * 2).padStart(2, "0")}:00</span>)}</div>
            </div>
            {rows.map((r) => (
              <div key={r.type + r.key} className="grid grid-cols-[160px_1fr] items-center border-t py-1 text-xs">
                <span className="flex items-center gap-1 truncate">
                  {r.type === "driver" ? <Users className="size-3 text-gold" /> : <Truck className="size-3 text-gold" />}
                  <span className="num">{r.label}</span>
                </span>
                <div className="relative h-6 rounded bg-muted/60">
                  {r.items.map((i, k) => {
                    const l = Math.max(0, (i.from - dayStart) / 864e5) * 100;
                    const w = (Math.min(dayEnd, i.to) - Math.max(dayStart, i.from)) / 864e5 * 100;
                    return (
                      <div key={k} title={`${i.num} ${fmtTime(new Date(i.from).toISOString())}–${fmtTime(new Date(i.to).toISOString())}`}
                        className={cn("num absolute top-0.5 bottom-0.5 truncate rounded px-1.5 text-[10px] leading-5 font-semibold", i.status === "in_progress" ? "bg-success text-primary-foreground" : "bg-gold text-gold-foreground")}
                        style={{ right: `${l}%`, width: `${Math.max(w, 2)}%` }}>{i.num}</div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      </Panel>

        <Panel title="رحلات تحتاج تخطيطًا" icon={<AlertTriangle />}>
          <DataTable rows={pending} loading={trips.isLoading} onRowClick={(r) => void nav({ to: "/trips/$id", params: { id: r.id } })} cols={[
            { key: "number", label: "الرحلة", render: (r) => <span className="num font-semibold text-primary">{r.number}</span> },
            { key: "route", label: "المسار", render: (r) => `${r.origin_city} ← ${r.dest_city}` },
            { key: "customer", label: "العميل", render: (r) => r.order?.customer?.name ?? "—" },
            { key: "start", label: "الانطلاق", render: (r) => <span className="num">{fmtTime(r.planned_start)}</span> },
            { key: "status", label: "الحالة", render: (r) => <Status kind="trip" value={r.status} /> },
            { key: "why", label: "سبب عدم الجاهزية", render: (r) => { const n = notReady(r); return n.length ? n.map((x) => <Badge key={x} tone="warning">{x}</Badge>) : <Badge tone="success">جاهزة</Badge>; } },
          ]} />
        </Panel>
        <Panel title="توافر الموارد الحالي" icon={<Truck />}>
          <table className="w-full text-sm">
            <thead className="text-xs text-muted-foreground"><tr><th className="py-1 text-right">النوع</th><th>الإجمالي</th><th>محجوز</th><th>متاح</th></tr></thead>
            <tbody>
              {([["رؤوس", tractors, "tractor"], ["مقطورات", trailers, "trailer"], ["سائقون", drivers.data ?? [], "driver"]] as const).map(([l, list, k]) => {
                const [tot, bk, av] = avail(list as Row[], k);
                return <tr key={k} className="border-t"><td className="py-2">{l}</td><td className="num text-center">{tot}</td><td className="num text-center"><Badge tone="gold" dot={false}>{bk}</Badge></td><td className="num text-center"><Badge tone="success" dot={false}>{av}</Badge></td></tr>;
              })}
            </tbody>
          </table>
        </Panel>
        </div>
      <Panel title="تخصيص موارد لرحلة" icon={<Truck />} className="allocation-panel">
        <AssignForm trips={t} />
      </Panel>
      </div>
    </>
  );
}
