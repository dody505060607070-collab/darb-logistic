import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Plus, User } from "lucide-react";
import { AppShell } from "@/components/darb/AppShell";
import { DataTable, Kpi, PageHeader, Panel, Select, Status } from "@/components/darb/ui";
import { EntityDialog, type Field } from "@/components/darb/EntityDialog";
import { Button } from "@/components/ui/button";
import { useRows } from "@/lib/db";
import { fetchDrivers } from "@/lib/queries";
import { useAuth } from "@/lib/auth";
import { STATUS } from "@/lib/format";
import { DocExpiry } from "./fleet.$id";

export const Route = createFileRoute("/drivers/")({
  head: () => ({
    meta: [
      { title: "السائقون — دَرب" },
      { name: "description", content: "قائمة السائقين وحالتهم والرخص والعهد." },
      { property: "og:title", content: "السائقون — دَرب" },
      { property: "og:description", content: "قائمة السائقين وحالتهم والرخص." },
    ],
  }),
  component: () => (
    <AppShell>
      <DriversPage />
    </AppShell>
  ),
});

export const DRIVER_FIELDS: Field[] = [
  { name: "code", label: "رقم السائق", required: true },
  { name: "full_name", label: "الاسم الكامل", required: true },
  { name: "phone", label: "الجوال" },
  { name: "email", label: "البريد الإلكتروني", hint: "لإرسال دعوة الدخول لتطبيق السائق" },
  { name: "national_id", label: "رقم الهوية/الإقامة" },
  { name: "nationality", label: "الجنسية" },
  { name: "license_no", label: "رقم الرخصة" },
  { name: "license_expiry", label: "انتهاء الرخصة", type: "date" },
  { name: "status", label: "الحالة", type: "select", default: "available", options: Object.entries(STATUS["driver"]!).map(([k, v]) => [k, v[0]]) },
  { name: "branch_id", label: "الفرع", type: "ref", ref: { table: "branches", label: "name" } },
];

function DriversPage() {
  const nav = useNavigate();
  const { can } = useAuth();
  const drivers = useRows(["drivers"], fetchDrivers);
  const [status, setStatus] = useState("");
  const [open, setOpen] = useState(false);
  const all = drivers.data ?? [];
  const c = (s: string) => all.filter((d) => d.status === s).length;
  return (
    <>
      <PageHeader title="السائقون" subtitle="بيانات السائقين والرخص والعهد والرحلات" icon={<User />}
        actions={can("ops_manager", "fleet_supervisor") && <Button variant="gold" onClick={() => setOpen(true)}><Plus /> سائق جديد</Button>} />
      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-5">
        <Kpi label="إجمالي السائقين" value={all.length} />
        <Kpi label="في رحلة" value={c("on_trip")} tone="success" />
        <Kpi label="متاح" value={c("available")} tone="info" />
        <Kpi label="إجازة" value={c("off")} />
        <Kpi label="رخص منتهية" value={all.filter((d) => d.license_expiry && new Date(d.license_expiry) < new Date()).length} tone="danger" />
      </div>
      <Panel title="قائمة السائقين" icon={<User />}>
        <DataTable rows={all.filter((d) => !status || d.status === status)} loading={drivers.isLoading} error={drivers.error}
          searchKeys={["code", "full_name", "phone", "license_no"]}
          filters={<Select value={status} onChange={setStatus} placeholder="كل الحالات" options={Object.entries(STATUS["driver"]!).map(([k, v]) => [k, v[0]])} />}
          onRowClick={(r) => void nav({ to: "/drivers/$id", params: { id: r.id } })}
          cols={[
            { key: "code", label: "الرقم", render: (r) => <span className="num font-semibold text-primary">{r.code}</span> },
            { key: "full_name", label: "الاسم" },
            { key: "phone", label: "الجوال", render: (r) => <span className="num">{r.phone ?? "—"}</span> },
            { key: "license_expiry", label: "انتهاء الرخصة", render: (r) => <DocExpiry d={r.license_expiry} /> },
            { key: "status", label: "الحالة", render: (r) => <Status kind="driver" value={r.status} /> },
            { key: "app", label: "حساب التطبيق", render: (r) => (r.user_id ? "مرتبط" : "غير مرتبط") },
          ]} />
      </Panel>
      <EntityDialog open={open} onOpenChange={setOpen} title="سائق جديد" table="drivers" fields={DRIVER_FIELDS} invalidate={["drivers"]} />
    </>
  );
}
