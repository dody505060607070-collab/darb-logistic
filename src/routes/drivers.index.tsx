import { RecordActions } from "@/components/darb/RecordActions";
import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { CalendarDays, CircleCheck, Plus, TriangleAlert, Truck, User, Users } from "lucide-react";
import { AppShell } from "@/components/darb/AppShell";
import { DataTable, Kpi, KV, PageHeader, Panel, Select, Status } from "@/components/darb/ui";
import { EntityDialog } from "@/components/darb/EntityDialog";
import { DocExpiry, DRIVER_FIELDS } from "@/components/darb/shared";
import { Button } from "@/components/ui/button";
import { useRows } from "@/lib/db";
import { fetchDrivers } from "@/lib/queries";
import { PersonIntake } from "@/components/darb/PersonIntake";
import { DriverMissingBadge, DriverMissingBox } from "@/components/darb/DriverMissing";
import { driverMissing } from "@/lib/driver-completeness";
import { useAuth } from "@/lib/auth";
import { daysUntil, STATUS } from "@/lib/format";

export const Route = createFileRoute("/drivers/")({
  head: () => ({
    meta: [
      { title: "السائقون | Shata" },
      { name: "description", content: "قائمة السائقين وحالتهم والرخص والعهد." },
      { property: "og:title", content: "السائقون | Shata" },
      { property: "og:description", content: "قائمة السائقين وحالتهم والرخص." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <AppShell>
      <DriversPage />
    </AppShell>
  ),
});


function DriversPage() {
  const nav = useNavigate();
  const { can } = useAuth();
  const drivers = useRows(["drivers"], fetchDrivers);
  const [status, setStatus] = useState("");
  const [open, setOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const all = drivers.data ?? [];
  const list = all.filter(d => !status || d.status === status);
  const selected = list.find(d => d.id === selectedId) ?? list[0];
  const licenseDays = daysUntil(selected?.license_expiry);
  const c = (s: string) => all.filter((d) => d.status === s).length;
  return (
    <>
      <PageHeader title="السائقون" subtitle="بيانات السائقين والرخص والعهد والرحلات" icon={<User />}
        actions={<div className="flex flex-wrap gap-2">{can("owner") && <PersonIntake />}{can("ops_manager", "fleet_supervisor") && <Button variant="gold" onClick={() => setOpen(true)}><Plus /> سائق جديد</Button>}</div>} />
      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-6">
        <Kpi label="إجمالي السائقين" value={all.length} icon={<Users />} />
        <Kpi label="متاح" value={c("available")} tone="info" icon={<CircleCheck />} />
        <Kpi label="في رحلة" value={c("on_trip")} tone="success" icon={<Truck />} />
        <Kpi label="إجازة" value={c("off")} icon={<CalendarDays />} />
        <Kpi label="ملفات ناقصة" value={all.filter(d => driverMissing(d).length > 0).length} tone="danger" icon={<TriangleAlert />} />
        <Kpi label="رخص منتهية" value={all.filter((d) => d.license_expiry && new Date(d.license_expiry) < new Date()).length} tone="danger" icon={<TriangleAlert />} />
      </div>
      <div className="split-layout min-w-0">
      <Panel className="min-w-0" title="قائمة السائقين" icon={<User />}>
        <DataTable entityTable="drivers" rows={list} loading={drivers.isLoading} error={drivers.error} selectedId={selected?.id}
          searchKeys={["code", "full_name", "phone", "license_no"]}
          filters={<Select value={status} onChange={setStatus} placeholder="كل الحالات" options={Object.entries(STATUS["driver"]!).map(([k, v]) => [k, v[0]])} />}
          onEdit={can("ops_manager", "fleet_supervisor") ? r => { void nav({ to: "/drivers/$id", params: { id: r.id } }); } : undefined}
          onRowClick={(r) => setSelectedId(r.id)}
          cols={[
            { key: "code", label: "الرقم", render: (r) => <Button variant="link" size="sm" className="num px-0" onClick={e => { e.stopPropagation(); void nav({ to: "/drivers/$id", params: { id: r.id } }); }}>{r.code}</Button> },
            { key: "full_name", label: "الاسم" },
            { key: "phone", label: "الجوال", render: (r) => <span className="num">{r.phone ?? "—"}</span> },
            { key: "license_expiry", label: "انتهاء الرخصة", render: (r) => <DocExpiry d={r.license_expiry} /> },
            { key: "status", label: "الحالة", render: (r) => <Status kind="driver" value={r.status} /> },
            { key: "app", label: "حساب التطبيق", render: (r) => (r.user_id ? "مرتبط" : "غير مرتبط") },
            { key: "missing", label: "النواقص", render: (r) => <DriverMissingBadge driver={r} /> },
          ]} />
      </Panel>
      {selected && <Panel className="record-preview side-detail" title={selected.full_name} icon={<User />} actions={<Status kind="driver" value={selected.status} />}>
        <div className="mb-4 grid size-14 place-items-center rounded-full bg-accent text-primary"><User className="size-7" /></div>
        <KV items={[["رقم السائق", <span className="num">{selected.code}</span>], ["الجوال", <span className="num">{selected.phone ?? "—"}</span>], ["انتهاء الرخصة", <DocExpiry d={selected.license_expiry} />], ["حساب التطبيق", selected.user_id ? "مرتبط" : "غير مرتبط"]]} />
        <DriverMissingBox driver={selected} className="mt-4" onComplete={can("ops_manager", "fleet_supervisor") ? () => { void nav({ to: "/drivers/$id", params: { id: selected.id } }); } : undefined} />
        <div className={licenseDays == null ? "mt-4 rounded-xl border bg-muted p-3" : licenseDays < 0 ? "mt-4 rounded-xl border bg-danger-soft p-3 text-danger" : licenseDays <= 30 ? "mt-4 rounded-xl border bg-gold-soft p-3 text-gold" : "mt-4 rounded-xl border bg-success-soft p-3 text-primary"}>
          <div className="flex items-center gap-2 text-sm"><CalendarDays className="size-4" /> صلاحية الرخصة</div>
          <div className="mt-1 font-semibold">{licenseDays == null ? "لا يوجد تاريخ انتهاء مسجل" : licenseDays < 0 ? `منتهية منذ ${Math.abs(licenseDays)} يومًا` : `المتبقي ${licenseDays} يومًا`}</div>
        </div>
        <RecordActions table="drivers" id={selected.id} onEdit={can("ops_manager", "fleet_supervisor") ? () => { void nav({ to: "/drivers/$id", params: { id: selected.id } }); } : undefined} />
        <Button variant="outline" className="mt-4 w-full" onClick={() => void nav({ to: "/drivers/$id", params: { id: selected.id } })}>ملف السائق</Button>
      </Panel>}
      </div>
      <EntityDialog open={open} onOpenChange={setOpen} title="سائق جديد" table="drivers" fields={DRIVER_FIELDS} invalidate={["drivers"]} />
    </>
  );
}
