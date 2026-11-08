import { useMemo } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { BarChart3, Download } from "lucide-react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AppShell } from "@/components/darb/AppShell";
import { DataTable, Kpi, PageHeader, Panel } from "@/components/darb/ui";
import { Button } from "@/components/ui/button";
import { db, useRows, type Row } from "@/lib/db";
import { fetchFinancials } from "@/lib/queries";
import { fmtNum, fmtSAR } from "@/lib/format";

export const Route = createFileRoute("/reports")({
  head: () => ({
    meta: [
      { title: "التقارير — دَرب" },
      { name: "description", content: "تقارير الكيلومترات المحملة والفارغة والانتظار والالتزام والهامش والتحصيل." },
      { property: "og:title", content: "التقارير — دَرب" },
      { property: "og:description", content: "تقارير التشغيل والمالية." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <AppShell>
      <Reports />
    </AppShell>
  ),
});

function csv(rows: Row[], name: string) {
  if (!rows.length) return;
  const keys = Object.keys(rows[0]!);
  const body = [keys.join(","), ...rows.map((r) => keys.map((k) => `"${String(r[k] ?? "").replace(/"/g, '""')}"`).join(","))].join("\n");
  const url = URL.createObjectURL(new Blob(["\ufeff" + body], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `${name}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function Reports() {
  const trips = useRows(["trips", "report"], () =>
    db.from("trips").select("id,number,status,is_empty,distance_km,actual_start,actual_end,planned_end,tractor_id, tractor:assets!trips_tractor_id_fkey(code), order:transport_orders(delivery_due_at, customer:customers(name)), events:trip_events(event_type,occurred_at)").in("status", ["in_progress", "delivered", "closed"]),
  );
  const fin = useRows(["trip_financials"], fetchFinancials);
  const fuel = useRows(["fuel", "approved"], () => db.from("fuel_entries").select("asset_id,liters,amount,odometer,full_tank,filled_at").eq("status", "approved").order("filled_at"));
  const exp = useRows(["expenses", "approved"], () => db.from("expenses").select("trip_id,amount").eq("status", "approved"));
  const wo = useRows(["work_orders"], () => db.from("work_orders").select("asset_id,labor_cost,parts_cost,opened_at,closed_at"));
  const invs = useRows(["invoices"], () => db.from("invoices").select("*, customer:customers(name), allocs:payment_allocations(amount)"));

  const r = useMemo(() => {
    const t = trips.data ?? [];
    const finMap = new Map((fin.data ?? []).map((f) => [f.trip_id, f]));
    const loadedKm = t.filter((x) => !x.is_empty).reduce((s, x) => s + Number(x.distance_km ?? 0), 0);
    const emptyKm = t.filter((x) => x.is_empty).reduce((s, x) => s + Number(x.distance_km ?? 0), 0);
    const totalKm = loadedKm + emptyKm;
    const done = t.filter((x) => !x.is_empty && x.actual_end && x.order?.delivery_due_at);
    const onTime = done.filter((x) => new Date(x.actual_end) <= new Date(x.order.delivery_due_at)).length;
    // waiting = arrival → unloading_start at delivery
    let waitH = 0, waitN = 0;
    t.forEach((x) => {
      const ev = x.events ?? [];
      const a = ev.find((e: Row) => e.event_type === "arrived_delivery");
      const u = ev.find((e: Row) => e.event_type === "unloading_start");
      if (a && u) { waitH += (new Date(u.occurred_at).getTime() - new Date(a.occurred_at).getTime()) / 36e5; waitN++; }
    });
    const rev = t.reduce((s, x) => s + Number(finMap.get(x.id)?.revenue ?? 0), 0);
    const expSum = (exp.data ?? []).reduce((s, e) => s + Number(e.amount), 0);
    const fuelSum = (fuel.data ?? []).reduce((s, f) => s + Number(f.amount), 0);
    const carrier = t.reduce((s, x) => s + Number(finMap.get(x.id)?.carrier_cost ?? 0), 0);
    const maint = (wo.data ?? []).reduce((s, w) => s + Number(w.labor_cost) + Number(w.parts_cost), 0);
    const direct = expSum + fuelSum + carrier;
    // fuel efficiency only between consecutive full-tank fills per asset
    const byAsset = new Map<string, Row[]>();
    (fuel.data ?? []).forEach((f) => byAsset.set(f.asset_id, [...(byAsset.get(f.asset_id) ?? []), f]));
    let fl = 0, fk = 0;
    byAsset.forEach((list) => {
      for (let i = 1; i < list.length; i++) {
        const p = list[i - 1]!, c = list[i]!;
        if (p.full_tank && c.full_tank && p.odometer && c.odometer && c.odometer > p.odometer) { fl += Number(c.liters); fk += c.odometer - p.odometer; }
      }
    });
    const perAsset = new Map<string, { code: string; km: number; trips: number }>();
    t.forEach((x) => {
      if (!x.tractor_id) return;
      const c = perAsset.get(x.tractor_id) ?? { code: x.tractor?.code, km: 0, trips: 0 };
      c.km += Number(x.distance_km ?? 0); c.trips++;
      perAsset.set(x.tractor_id, c);
    });
    const debt = (invs.data ?? []).filter((i) => i.status === "approved").map((i) => {
      const paid = (i.allocs ?? []).reduce((s: number, a: Row) => s + Number(a.amount), 0);
      return { id: i.id, number: i.number, customer: i.customer?.name, total: Number(i.total), paid, outstanding: Number(i.total) - paid, due_at: i.due_at };
    });
    return { loadedKm, emptyKm, totalKm, emptyPct: totalKm ? (emptyKm / totalKm) * 100 : null, onTimePct: done.length ? (onTime / done.length) * 100 : null, done: done.length,
      waitAvg: waitN ? waitH / waitN : null, rev, direct, margin: rev - direct, costPerKm: totalKm ? (direct + maint) / totalKm : null, maint,
      lPer100: fk > 0 ? (fl / fk) * 100 : null, perAsset: [...perAsset.entries()].map(([id, v]) => ({ id, ...v })), debt };
  }, [trips.data, fin.data, fuel.data, exp.data, wo.data, invs.data]);

  const na = "غير متاح";
  return (
    <>
      <PageHeader title="التقارير" subtitle="كل مؤشر بتعريفه ووحدته؛ «غير متاح» عند نقص البيانات أو القسمة على صفر. الفعلي منفصل عن التقديري." icon={<BarChart3 />} />
      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label="كم محملة (مخطط معتمد)" value={`${fmtNum(r.loadedKm)} كم`} />
        <Kpi label="كم فارغة" value={`${fmtNum(r.emptyKm)} كم`} />
        <Kpi label="نسبة الفارغ = فارغ ÷ إجمالي" value={r.emptyPct === null ? na : `${r.emptyPct.toFixed(1)}%`} tone="warning" />
        <Kpi label="الالتزام بالموعد المتفق" value={r.onTimePct === null ? na : `${r.onTimePct.toFixed(0)}%`} hint={`من ${r.done} رحلة مسلّمة`} tone="success" />
        <Kpi label="متوسط الانتظار عند التسليم" value={r.waitAvg === null ? na : `${r.waitAvg.toFixed(1)} ساعة`} hint="من الوصول حتى بداية التفريغ" />
        <Kpi label="استهلاك الوقود" value={r.lPer100 === null ? na : `${r.lPer100.toFixed(1)} L/100كم`} hint="بين تعبئتين كاملتين فقط" />
        <Kpi label="تكلفة الكيلومتر" value={r.costPerKm === null ? na : `${r.costPerKm.toFixed(2)} ر.س`} hint="مباشرة + صيانة ÷ كم" />
        <Kpi label="الهامش المباشر" value={fmtSAR(r.margin)} hint={`إيراد ${fmtSAR(r.rev)} − تكلفة مباشرة ${fmtSAR(r.direct)}`} tone="gold" />
      </div>
      <div className="grid gap-5 xl:grid-cols-2">
        <Panel title="الكيلومترات حسب الرأس" icon={<BarChart3 />}>
          {r.perAsset.length === 0 ? <p className="text-sm text-muted-foreground">لا توجد بيانات.</p> : (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={r.perAsset}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="code" fontSize={11} />
                <YAxis fontSize={11} orientation="right" />
                <Tooltip />
                <Bar dataKey="km" name="كم" fill="var(--chart-1)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </Panel>
        <Panel title="مديونية العملاء" icon={<BarChart3 />} actions={<Button size="sm" variant="outline" onClick={() => csv(r.debt, "debt")}><Download /> CSV</Button>}>
          <DataTable rows={r.debt} cols={[
            { key: "number", label: "الفاتورة", render: (x) => <span className="num">{x.number}</span> },
            { key: "customer", label: "العميل" },
            { key: "total", label: "الإجمالي", render: (x) => <span className="num">{fmtSAR(x.total)}</span> },
            { key: "paid", label: "المحصل", render: (x) => <span className="num">{fmtSAR(x.paid)}</span> },
            { key: "outstanding", label: "المتبقي", render: (x) => <b className="num">{fmtSAR(x.outstanding)}</b> },
          ]} empty={<p className="py-6 text-center text-sm text-muted-foreground">لا توجد فواتير معتمدة.</p>} />
        </Panel>
      </div>
      <Panel title="تشغيل الأصول" icon={<BarChart3 />} className="mt-5" actions={<Button size="sm" variant="outline" onClick={() => csv(r.perAsset, "assets")}><Download /> CSV</Button>}>
        <DataTable rows={r.perAsset} cols={[
          { key: "code", label: "الرأس", render: (x) => <span className="num">{x.code}</span> },
          { key: "trips", label: "الرحلات", render: (x) => <span className="num">{x.trips}</span> },
          { key: "km", label: "الكيلومترات", render: (x) => <span className="num">{fmtNum(x.km)} كم</span> },
        ]} />
      </Panel>
    </>
  );
}
