import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { FileText, Plus } from "lucide-react";
import { AppShell } from "@/components/darb/AppShell";
import { DataTable, Kpi, KV, PageHeader, Panel, Select, Status } from "@/components/darb/ui";
import { Button } from "@/components/ui/button";
import { db, useRows, type Row } from "@/lib/db";
import { useAuth } from "@/lib/auth";
import { fmtDateTime, fmtNum, fmtSAR, STATUS } from "@/lib/format";

export const Route = createFileRoute("/orders/")({
  head: () => ({
    meta: [
      { title: "أوامر النقل — شركة شتاء" },
      { name: "description", content: "قائمة أوامر النقل والعملاء والبضائع والمواعيد." },
      { property: "og:title", content: "أوامر النقل — شركة شتاء" },
      { property: "og:description", content: "قائمة أوامر النقل والبضائع والمواعيد." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <AppShell>
      <OrdersPage />
    </AppShell>
  ),
});

function OrdersPage() {
  const { can } = useAuth();
  const [status, setStatus] = useState("");
  const [selected, setSelected] = useState<Row | null>(null);
  const orders = useRows(["orders"], () =>
    db.from("transport_orders").select("*, customer:customers(name), pickup:locations!transport_orders_pickup_location_id_fkey(name,city), delivery:locations!transport_orders_delivery_location_id_fkey(name,city), trips(id,number,status)").order("created_at", { ascending: false }),
  );
  const all = orders.data ?? [];
  const c = (s: string) => all.filter((o) => o.status === s).length;
  const showPrice = can("ops_manager", "accountant", "dispatcher");
  return (
    <>
      <PageHeader title="أوامر النقل" subtitle="أمر واحد قد يتضمن عدة رحلات" icon={<FileText />}
        actions={can("ops_manager", "dispatcher") && <Button variant="gold" asChild><Link to="/orders/new"><Plus /> إنشاء أمر نقل</Link></Button>} />
      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-5">
        <Kpi label="الإجمالي" value={all.length} />
        <Kpi label="مسودة" value={c("draft")} />
        <Kpi label="مؤكد" value={c("confirmed")} tone="info" />
        <Kpi label="قيد التنفيذ" value={c("in_progress")} tone="success" />
        <Kpi label="مكتمل" value={c("completed")} tone="gold" />
      </div>
      <Panel title="الأوامر" icon={<FileText />}>
        <DataTable rows={all.filter((o) => !status || o.status === status)} loading={orders.isLoading} error={orders.error} selectedId={selected?.id} onRowClick={setSelected}
          searchKeys={["number", "customer.name", "cargo_type", "consignee"]}
          filters={<Select value={status} onChange={setStatus} placeholder="كل الحالات" options={Object.entries(STATUS["order"]!).map(([k, v]) => [k, v[0]])} />}
          cols={[
            { key: "number", label: "رقم الأمر", render: (r) => <span className="num font-semibold text-primary">{r.number}</span> },
            { key: "customer", label: "العميل", render: (r) => r.customer?.name },
            { key: "route", label: "المسار", render: (r) => `${r.pickup?.city ?? "—"} ← ${r.delivery?.city ?? "—"}` },
            { key: "cargo", label: "البضاعة", render: (r) => `${r.cargo_type} • ${fmtNum(r.quantity)} ${r.unit}` },
            { key: "due", label: "موعد التسليم", render: (r) => <span className="num">{fmtDateTime(r.delivery_due_at)}</span> },
            ...(showPrice ? [{ key: "price", label: "السعر", render: (r: Record<string, unknown>) => <span className="num">{fmtSAR(r["price"] as number)}</span> }] : []),
            { key: "trips", label: "الرحلات", render: (r) => (r.trips ?? []).map((t: { id: string; number: string }) => <Link key={t.id} to="/trips/$id" params={{ id: t.id }} className="num ml-2 text-gold underline">{t.number}</Link>) },
            { key: "status", label: "الحالة", render: (r) => <Status kind="order" value={r.status} /> },
          ]} />
      </Panel>
      {selected && <Panel className="mt-5" title={`الأمر ${selected.number}`} icon={<FileText />} actions={<Status kind="order" value={selected.status} />}>
        <div className="grid gap-5 md:grid-cols-2">
          <KV items={[["العميل", selected.customer?.name], ["المسار", `${selected.pickup?.city ?? '—'} ← ${selected.delivery?.city ?? '—'}`], ["البضاعة", `${selected.cargo_type} • ${fmtNum(selected.quantity)} ${selected.unit}`]]} />
          <div><KV items={[["موعد التسليم", fmtDateTime(selected.delivery_due_at)], ["الرحلات", (selected.trips ?? []).map((t: { id: string; number: string }) => <Link key={t.id} to="/trips/$id" params={{ id: t.id }} className="num ml-3 text-primary underline">{t.number}</Link>)]]} />{showPrice && <KV items={[["السعر", fmtSAR(selected.price)]]} />}</div>
        </div>
      </Panel>}
    </>
  );
}
