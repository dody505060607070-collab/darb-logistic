import { RecordActions } from "@/components/darb/RecordActions";
import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, ClipboardCheck, Coins, FileText, Mail, Pencil, Plus, Route as RouteIcon, User } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/darb/AppShell";
import { DataTable, KV, Loading, PageHeader, Panel, Status } from "@/components/darb/ui";
import { EntityDialog } from "@/components/darb/EntityDialog";
import { DriverMissingBox } from "@/components/darb/DriverMissing";
import { DriverLoginStatus, useActivateDriverLogin } from "@/components/darb/DriverLoginAccess";
import { Button } from "@/components/ui/button";
import { db, useOne, useRows, type Row } from "@/lib/db";
import { useAuth } from "@/lib/auth";
import { errMsg, fmtDateTime, fmtSAR } from "@/lib/format";
import { DOC_FIELDS, DocExpiry, DRIVER_FIELDS, openFile } from "@/components/darb/shared";

export const Route = createFileRoute("/drivers/$id")({
  head: () => ({
    meta: [
      { title: "ملف السائق | Shata" },
      { name: "description", content: "ملف السائق: العهد والرحلات والمستندات والسلف." },
      { property: "og:title", content: "ملف السائق | Shata" },
      { property: "og:description", content: "العهد والرحلات والمستندات للسائق." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <AppShell>
      <DriverProfile />
    </AppShell>
  ),
});

function DriverProfile() {
  const { id } = Route.useParams();
  const { can } = useAuth();
  const d = useOne(["drivers", id], () => db.from("drivers").select("*, branch:branches(name)").eq("id", id).maybeSingle());
  const trips = useRows(["trips", "driver", id], () =>
    db.from("trips").select("id,number,origin_city,dest_city,status,planned_start, tractor:assets!trips_tractor_id_fkey(code)").eq("driver_id", id).order("planned_start", { ascending: false }),
  );
  const custody = useRows(["custody", "driver", id], () => db.from("custody").select("*, asset:assets(code)").eq("driver_id", id).order("opened_at", { ascending: false }));
  const docs = useRows(["documents", "driver", id], () => db.from("documents").select("*").eq("entity_type", "driver").eq("entity_id", id));
  const adv = useRows(["advances", "driver", id], () => db.from("advances").select("*").eq("driver_id", id).order("issued_at", { ascending: false }));
  const [edit, setEdit] = useState(false);
  const [docEdit, setDocEdit] = useState<Row | null | undefined>(undefined);
  const activateLogin = useActivateDriverLogin();

  if (d.isLoading) return <Loading />;
  const r = d.data;
  if (!r) return <p className="text-muted-foreground">السائق غير موجود.</p>;
  const canEdit = can("ops_manager", "fleet_supervisor");

  async function invite() {
    if (!r!.email) return void toast.error("أضف البريد الإلكتروني للسائق أولًا");
    const { error } = await db.from("invitations").upsert({ email: r!.email.toLowerCase(), role: "driver", driver_id: r!.id }, { onConflict: "email" });
    if (error) return void toast.error(errMsg(error));
    toast.success("تم تسجيل الدعوة. عند إنشاء السائق حسابه بهذا البريد يرتبط بملفه تلقائيًا (لا تُرسل رسالة خارجية).");
  }

  return (
    <>
      <Link to="/drivers" className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-primary"><ArrowRight className="size-4" /> السائقون</Link>
      <PageHeader title={r.full_name} subtitle={`${r.code} • ${r.phone ?? ""}`} icon={<User />}
        actions={<>
          {can("owner") && !r.user_id && <Button variant="outline" onClick={() => void invite()}><Mail /> دعوة لتطبيق السائق</Button>}
          <RecordActions table="drivers" id={id} onEdit={canEdit ? () => setEdit(true) : undefined} onDeleted={() => { window.location.assign("/drivers"); }} />
        </>} />
      <DriverMissingBox driver={r} className="mb-5" onComplete={canEdit ? () => setEdit(true) : undefined} />
      <div className="grid gap-5 xl:grid-cols-3">
        <Panel title="البيانات" icon={<User />} actions={<Status kind="driver" value={r.status} />}>
          <KV items={[
            ["رقم الهوية", <span className="num">{r.national_id ?? "—"}</span>],
            ["الجنسية", r.nationality],
            ["رقم الرخصة", <span className="num">{r.license_no ?? "—"}</span>],
            ["انتهاء الرخصة", <DocExpiry d={r.license_expiry} />],
            ["الفرع", r.branch?.name],
            ["البريد", r.email],
            ["دخول النظام", <DriverLoginStatus driver={r as { id: string }} canActivate={canEdit} />],
          ]} />
        </Panel>
        <Panel title="العهد" icon={<ClipboardCheck />} className="xl:col-span-2">
          <DataTable rows={custody.data} loading={custody.isLoading} cols={[
            { key: "asset", label: "الأصل", render: (x) => <span className="num">{x.asset?.code}</span> },
            { key: "opened_at", label: "الاستلام", render: (x) => <span className="num">{fmtDateTime(x.opened_at)}</span> },
            { key: "closed_at", label: "الإرجاع", render: (x) => x.closed_at ? <span className="num">{fmtDateTime(x.closed_at)}</span> : <span className="text-success">مفتوحة</span> },
            { key: "ack", label: "الإقرار", render: (x) => (x.acknowledged ? "مُقر" : "بانتظار") },
          ]} />
        </Panel>
      </div>
      <div className="mt-5 grid gap-5 xl:grid-cols-2">
        <Panel title="الرحلات" icon={<RouteIcon />}>
          <DataTable rows={trips.data} loading={trips.isLoading} cols={[
            { key: "number", label: "الرحلة", render: (x) => <Link to="/trips/$id" params={{ id: x.id }} className="num font-semibold text-primary underline">{x.number}</Link> },
            { key: "route", label: "المسار", render: (x) => `${x.origin_city} ← ${x.dest_city}` },
            { key: "tractor", label: "الرأس", render: (x) => x.tractor?.code ?? "—" },
            { key: "status", label: "الحالة", render: (x) => <Status kind="trip" value={x.status} /> },
          ]} />
        </Panel>
        <Panel title="المستندات" icon={<FileText />} actions={canEdit && <Button size="sm" variant="gold" onClick={() => setDocEdit(null)}><Plus /> مستند</Button>}>
          <DataTable entityTable="documents" rows={docs.data} loading={docs.isLoading} onEdit={canEdit ? setDocEdit : undefined} onRowClick={canEdit ? setDocEdit : undefined} cols={[
            { key: "doc_type", label: "النوع" },
            { key: "number", label: "الرقم" },
            { key: "expiry_date", label: "الانتهاء", render: (x) => <DocExpiry d={x.expiry_date} /> },
            { key: "file", label: "المرفق", render: (x) => x.file_path ? <button className="text-gold underline" onClick={(e) => { e.stopPropagation(); void openFile(x.file_path); }}>عرض</button> : "—" },
          ]} />
        </Panel>
      </div>
      {can("accountant", "ops_manager") && (
        <Panel title="السلف" icon={<Coins />} className="mt-5">
          <DataTable rows={adv.data} loading={adv.isLoading} cols={[
            { key: "amount", label: "المبلغ", render: (x) => <span className="num">{fmtSAR(x.amount)}</span> },
            { key: "issued_at", label: "الصرف", render: (x) => <span className="num">{fmtDateTime(x.issued_at)}</span> },
            { key: "status", label: "الحالة", render: (x) => <Status kind="advance" value={x.status} /> },
            { key: "balance", label: "الرصيد بعد التسوية", render: (x) => <span className="num">{x.balance === null ? "—" : fmtSAR(x.balance)}</span> },
          ]} />
        </Panel>
      )}
      <EntityDialog open={edit} onOpenChange={setEdit} title="تعديل السائق" table="drivers" fields={DRIVER_FIELDS} record={r} invalidate={["drivers"]}
        onSaved={(saved) => { if (!saved["user_id"] && saved["phone"]) void activateLogin(String(saved["id"]), true); }} />
      <EntityDialog open={docEdit !== undefined} onOpenChange={(o) => !o && setDocEdit(undefined)} title="مستند السائق" table="documents"
        fields={DOC_FIELDS} record={docEdit} extra={{ entity_type: "driver", entity_id: id }} invalidate={["documents"]} />
    </>
  );
}
