import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, FileText, Gauge, MapPin, Pencil, Plus, Truck, Wrench } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/darb/AppShell";
import { Badge, DataTable, KV, Loading, PageHeader, Panel, Status } from "@/components/darb/ui";
import { EntityDialog } from "@/components/darb/EntityDialog";
import { ASSET_FIELDS, DOC_FIELDS, DocExpiry, openFile } from "@/components/darb/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { db, useOne, useRows, type Row } from "@/lib/db";
import { useAuth } from "@/lib/auth";
import { ASSET_KIND, errMsg, fmtDateTime, fmtNum, fmtSAR } from "@/lib/format";
import { useQueryClient } from "@tanstack/react-query";

export const Route = createFileRoute("/fleet/$id")({
  head: () => ({
    meta: [
      { title: "ملف المركبة — دَرب" },
      { name: "description", content: "ملف المركبة: المستندات والعداد والصيانة والرحلات." },
      { property: "og:title", content: "ملف المركبة — دَرب" },
      { property: "og:description", content: "المستندات والعداد والصيانة والرحلات للمركبة." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <AppShell>
      <AssetProfile />
    </AppShell>
  ),
});



function AssetProfile() {
  const { id } = Route.useParams();
  const { can } = useAuth();
  const qc = useQueryClient();
  const asset = useOne(["assets", id], () => db.from("assets").select("*, branch:branches(name)").eq("id", id).maybeSingle());
  const docs = useRows(["documents", "asset", id], () => db.from("documents").select("*").eq("entity_type", "asset").eq("entity_id", id).order("expiry_date"));
  const trips = useRows(["trips", "asset", id], () =>
    db.from("trips").select("id,number,origin_city,dest_city,status,planned_start,distance_km, driver:drivers!trips_driver_id_fkey(full_name)").or(`tractor_id.eq.${id},trailer_id.eq.${id}`).order("planned_start", { ascending: false }),
  );
  const wos = useRows(["work_orders", "asset", id], () => db.from("work_orders").select("*").eq("asset_id", id).order("opened_at", { ascending: false }));
  const insp = useRows(["inspections", "asset", id], () => db.from("inspections").select("*").eq("asset_id", id).order("created_at", { ascending: false }).limit(10));
  const [edit, setEdit] = useState(false);
  const [docEdit, setDocEdit] = useState<Row | null | undefined>(undefined);
  const [odo, setOdo] = useState("");

  if (asset.isLoading) return <Loading />;
  const a = asset.data;
  if (!a) return <p className="text-muted-foreground">الأصل غير موجود أو لا تملك صلاحية عرضه.</p>;
  const canEdit = can("ops_manager", "fleet_supervisor");

  async function saveOdo() {
    const v = Number(odo);
    if (!Number.isFinite(v) || v < Number(a!.odometer_km ?? 0)) return void toast.error("قراءة العداد يجب أن تكون أكبر من القراءة الحالية");
    const { error } = await db.from("assets").update({ odometer_km: v }).eq("id", id);
    if (error) return void toast.error(errMsg(error));
    toast.success("تم تحديث العداد (مصدر: يدوي)");
    setOdo("");
    void qc.invalidateQueries({ queryKey: ["assets"] });
  }

  return (
    <>
      <Link to="/fleet" className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-primary"><ArrowRight className="size-4" /> الأسطول</Link>
      <PageHeader
        title={`ملف ${ASSET_KIND[a.kind]} ${a.code}`}
        subtitle={[a.make_model ?? a.trailer_type, a.plate].filter(Boolean).join(" • ")}
        icon={<Truck />}
        actions={canEdit && <Button variant="gold" onClick={() => setEdit(true)}><Pencil /> تعديل</Button>}
      />
      <div className="grid gap-5 xl:grid-cols-3">
        <Panel title="البيانات الأساسية" icon={<Truck />} actions={<Status kind="asset" value={a.status} />}>
          <KV items={[
            ["النوع", ASSET_KIND[a.kind]],
            ["الطراز", a.make_model ?? a.trailer_type],
            ["سنة الصنع", a.year],
            ["اللوحة", a.plate],
            ["VIN", <span className="num">{a.vin ?? "—"}</span>],
            ["السعة", a.capacity_tons ? `${a.capacity_tons} طن` : "—"],
            ["الفرع", a.branch?.name],
            ["الموقع", a.location_text],
          ]} />
        </Panel>
        <Panel title="العداد والموقع" icon={<Gauge />}>
          <div className="num text-center text-3xl font-bold text-primary">{fmtNum(a.odometer_km)} كم</div>
          <p className="mb-4 text-center text-xs text-muted-foreground">مصدر معتمد واحد: إدخال يدوي (عداد المحرك غير مربوط)</p>
          {canEdit && (
            <div className="flex gap-2">
              <Input type="number" placeholder="قراءة جديدة" value={odo} onChange={(e) => setOdo(e.target.value)} />
              <Button variant="soft" onClick={() => void saveOdo()}>تسجيل</Button>
            </div>
          )}
          <div className="mt-4 rounded-md bg-muted p-3 text-sm">
            <div className="flex items-center gap-2"><MapPin className="size-4 text-gold" /> آخر موقع: {a.last_lat ? `${a.last_lat.toFixed(3)}, ${a.last_lng.toFixed(3)}` : "غير متاح"}</div>
            <div className="mt-1 text-xs text-muted-foreground">آخر تحديث: {fmtDateTime(a.last_position_at)} — المصدر: {a.last_position_source ?? "—"}</div>
          </div>
        </Panel>
        <Panel title="آخر الفحوصات" icon={<Wrench />}>
          {(insp.data ?? []).length === 0 ? <p className="text-sm text-muted-foreground">لا توجد فحوصات.</p> : (
            <ul className="space-y-2 text-sm">
              {insp.data!.map((i) => (
                <li key={i.id} className="flex items-center justify-between rounded-md border px-3 py-2">
                  <span className="num">{fmtDateTime(i.created_at)}</span>
                  {i.has_critical ? <Badge tone={i.resolved ? "neutral" : "danger"}>{i.resolved ? "عيب حرج (مُعالج)" : "عيب حرج"}</Badge> : <Badge tone="success">سليم</Badge>}
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <Panel title="المستندات" icon={<FileText />} className="mt-5" actions={canEdit && <Button size="sm" variant="gold" onClick={() => setDocEdit(null)}><Plus /> مستند</Button>}>
        <DataTable rows={docs.data} loading={docs.isLoading} onRowClick={canEdit ? (r) => setDocEdit(r) : undefined}
          cols={[
            { key: "doc_type", label: "النوع" },
            { key: "number", label: "الرقم", render: (r) => <span className="num">{r.number ?? "—"}</span> },
            { key: "expiry_date", label: "الانتهاء", render: (r) => <DocExpiry d={r.expiry_date} /> },
            { key: "review_status", label: "المراجعة", render: (r) => <Status kind="review" value={r.review_status} /> },
            { key: "file", label: "المرفق", render: (r) => r.file_path ? <button className="text-gold underline" onClick={(e) => { e.stopPropagation(); void openFile(r.file_path); }}>عرض</button> : "—" },
          ]} />
      </Panel>

      <div className="mt-5 grid gap-5 xl:grid-cols-2">
        <Panel title="الرحلات" icon={<Truck />}>
          <DataTable rows={trips.data} loading={trips.isLoading}
            cols={[
              { key: "number", label: "الرحلة", render: (r) => <Link to="/trips/$id" params={{ id: r.id }} className="num font-semibold text-primary underline">{r.number}</Link> },
              { key: "route", label: "المسار", render: (r) => `${r.origin_city} ← ${r.dest_city}` },
              { key: "driver", label: "السائق", render: (r) => r.driver?.full_name ?? "—" },
              { key: "status", label: "الحالة", render: (r) => <Status kind="trip" value={r.status} /> },
            ]} />
        </Panel>
        <Panel title="أوامر الصيانة" icon={<Wrench />}>
          <DataTable rows={wos.data} loading={wos.isLoading}
            cols={[
              { key: "number", label: "الأمر", render: (r) => <span className="num">{r.number}</span> },
              { key: "description", label: "الوصف" },
              { key: "status", label: "الحالة", render: (r) => <Status kind="wo" value={r.status} /> },
              { key: "cost", label: "التكلفة", render: (r) => <span className="num">{fmtSAR(Number(r.labor_cost) + Number(r.parts_cost))}</span> },
            ]} />
        </Panel>
      </div>

      <EntityDialog open={edit} onOpenChange={setEdit} title={`تعديل ${a.code}`} table="assets" fields={ASSET_FIELDS} record={a} invalidate={["assets"]} />
      <EntityDialog open={docEdit !== undefined} onOpenChange={(o) => !o && setDocEdit(undefined)} title="مستند المركبة" table="documents"
        fields={DOC_FIELDS} record={docEdit} extra={{ entity_type: "asset", entity_id: id }} invalidate={["documents"]} />
    </>
  );
}
