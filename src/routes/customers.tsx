import { RecordActions } from "@/components/darb/RecordActions";
import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Building2, FileSignature, MapPin, Plus, Truck, Users } from "lucide-react";
import { AppShell } from "@/components/darb/AppShell";
import { DataTable, Empty, Kpi, KV, PageHeader, Panel } from "@/components/darb/ui";
import { EntityDialog, type Field } from "@/components/darb/EntityDialog";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { db, useRows, type Row } from "@/lib/db";
import { useAuth } from "@/lib/auth";
import { fmtDate, fmtSAR } from "@/lib/format";
import { DocExpiry } from "@/components/darb/shared";

export const Route = createFileRoute("/customers")({
  head: () => ({
    meta: [
      { title: "العملاء والعقود والناقلون الخارجيون | Shata" },
      { name: "description", content: "العملاء ومواقع التحميل والتفريغ والعقود والأسعار والناقلون الخارجيون." },
      { property: "og:title", content: "العملاء والعقود | Shata" },
      { property: "og:description", content: "العملاء والمواقع والعقود والناقلون." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <AppShell>
      <CustomersPage />
    </AppShell>
  ),
});

const PRICING: [string, string][] = [["per_trip", "للرحلة"], ["per_ton", "للطن"], ["per_km", "للكيلومتر"], ["agreed", "اتفاقي"]];

function CustomersPage() {
  const { can } = useAuth();
  const customers = useRows(["customers"], () => db.from("customers").select("*, contracts(id), locations(id)").order("name"));
  const locations = useRows(["locations"], () => db.from("locations").select("*, customer:customers(name)").order("name"));
  const contracts = useRows(["contracts"], () => db.from("contracts").select("*, customer:customers(name)").order("created_at", { ascending: false }));
  const carriers = useRows(["carriers"], () => db.from("carriers").select("*").order("name"));
  const [dlg, setDlg] = useState<"cust" | "loc" | "ctr" | "car" | null>(null);
  const [rec, setRec] = useState<Row | null>(null);
  const open = (d: typeof dlg, r: Row | null = null) => { setRec(r); setDlg(d); };
  const canCust = can("ops_manager", "accountant");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selectedCustomer = customers.data?.find((r) => r.id === selectedId) ?? customers.data?.[0] ?? null;
  const canLoc = can("ops_manager", "dispatcher");

  const CUST: Field[] = [
    { name: "name", label: "اسم العميل", required: true, full: true },
    { name: "cr_number", label: "السجل التجاري" },
    { name: "vat_number", label: "الرقم الضريبي" },
    { name: "contact_name", label: "جهة الاتصال" },
    { name: "phone", label: "الجوال" },
    { name: "email", label: "البريد" },
    { name: "city", label: "المدينة" },
    { name: "payment_terms_days", label: "مدة السداد (يوم)", type: "number", default: 30 },
  ];
  const LOC: Field[] = [
    { name: "customer_id", label: "العميل", type: "ref", ref: { table: "customers", label: "name" } },
    { name: "name", label: "اسم الموقع", required: true },
    { name: "city", label: "المدينة", required: true },
    { name: "lat", label: "خط العرض", type: "number" },
    { name: "lng", label: "خط الطول", type: "number" },
    { name: "contact", label: "التواصل" },
    { name: "working_hours", label: "ساعات العمل" },
    { name: "instructions", label: "تعليمات", type: "textarea" },
  ];
  const CTR: Field[] = [
    { name: "customer_id", label: "العميل", type: "ref", required: true, ref: { table: "customers", label: "name" } },
    { name: "number", label: "رقم العقد", required: true },
    { name: "version", label: "الإصدار", type: "number", default: 1, hint: "عند تعديل الشروط أنشئ إصدارًا جديدًا — الأوامر السابقة تحتفظ بنسختها" },
    { name: "pricing_model", label: "نموذج التسعير", type: "select", required: true, options: PRICING },
    { name: "rate", label: "السعر (ر.س)", type: "number", required: true },
    { name: "free_wait_hours", label: "انتظار مجاني (ساعة)", type: "number", default: 2 },
    { name: "wait_fee_per_hour", label: "رسوم الانتظار/ساعة", type: "number", default: 0 },
    { name: "start_date", label: "البداية", type: "date" },
    { name: "end_date", label: "النهاية", type: "date" },
    { name: "status", label: "الحالة", type: "select", default: "active", options: [["active", "ساري"], ["expired", "منتهٍ"], ["draft", "مسودة"]] },
    { name: "terms", label: "الشروط", type: "textarea" },
  ];
  const CAR: Field[] = [
    { name: "name", label: "اسم الناقل", required: true },
    { name: "cr_number", label: "السجل التجاري" },
    { name: "contact_name", label: "جهة الاتصال" },
    { name: "phone", label: "الجوال" },
    { name: "status", label: "الحالة", type: "select", default: "active", options: [["active", "نشط"], ["suspended", "موقوف"]] },
  ];

  return (
    <>
      <PageHeader title="العملاء والعقود والناقلون الخارجيون" icon={<Users />} actions={canCust && <Button variant="gold" onClick={() => open("cust")}><Plus /> إضافة عميل</Button>} />
      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label="العملاء" value={customers.data?.length ?? 0} icon={<Users />} />
        <Kpi label="مواقع التحميل/التفريغ" value={locations.data?.length ?? 0} icon={<MapPin />} />
        <Kpi label="عقود سارية" value={(contracts.data ?? []).filter((c) => c.status === "active").length} tone="success" icon={<FileSignature />} />
        <Kpi label="ناقلون خارجيون" value={carriers.data?.length ?? 0} icon={<Truck />} />
      </div>
      <Tabs defaultValue="cust" dir="rtl">
        <TabsList>
          <TabsTrigger value="cust">العملاء</TabsTrigger>
          <TabsTrigger value="loc">المواقع</TabsTrigger>
          <TabsTrigger value="ctr">العقود</TabsTrigger>
          <TabsTrigger value="car">الناقلون الخارجيون</TabsTrigger>
        </TabsList>
        <TabsContent value="cust">
          <div className="split-layout min-w-0">
          <Panel className="min-w-0" title="العملاء" icon={<Building2 />}>
            <DataTable entityTable="customers" rows={customers.data} loading={customers.isLoading} error={customers.error} searchKeys={["name", "cr_number", "vat_number", "city"]} onEdit={canCust ? (r) => open("cust", r) : undefined} selectedId={selectedCustomer?.id} onRowClick={(r) => setSelectedId(r.id)} cols={[
              { key: "name", label: "العميل", render: (r) => <b className="text-primary">{r.name}</b> },
              { key: "cr_number", label: "السجل", render: (r) => <span className="num">{r.cr_number ?? "—"}</span> },
              { key: "vat_number", label: "الرقم الضريبي", render: (r) => <span className="num">{r.vat_number ?? "—"}</span> },
              { key: "contact_name", label: "جهة الاتصال" },
              { key: "phone", label: "الجوال", render: (r) => <span className="num">{r.phone ?? "—"}</span> },
              { key: "city", label: "المدينة" },
              { key: "terms", label: "السداد", render: (r) => `${r.payment_terms_days} يوم` },
              { key: "n", label: "المواقع / العقود", render: (r) => <span className="num">{r.locations?.length} / {r.contracts?.length}</span> },
            ]} />
          </Panel>
          <Panel className="record-preview side-detail" title="معاينة العميل" icon={<Building2 />}>
            {selectedCustomer ? (
              <div className="space-y-4">
                <h3 className="text-lg font-semibold text-primary">{selectedCustomer.name}</h3>
                <KV items={[
                  ["السجل التجاري", <span className="num">{selectedCustomer.cr_number ?? "—"}</span>],
                  ["الرقم الضريبي", <span className="num">{selectedCustomer.vat_number ?? "—"}</span>],
                  ["جهة الاتصال", selectedCustomer.contact_name ?? "—"],
                  ["الجوال", <span className="num">{selectedCustomer.phone ?? "—"}</span>],
                  ["المدينة", selectedCustomer.city ?? "—"],
                  ["شروط السداد", selectedCustomer.payment_terms_days == null ? "—" : `${selectedCustomer.payment_terms_days} يوم`],
                  ["المواقع / العقود", <span className="num">{selectedCustomer.locations?.length ?? 0} / {selectedCustomer.contracts?.length ?? 0}</span>],
                ]} />
                <RecordActions table="customers" id={selectedCustomer.id} onEdit={canCust ? () => open("cust", selectedCustomer) : undefined} />
              </div>
            ) : <Empty text="لا يوجد عملاء بعد" />}
          </Panel>
          </div>
        </TabsContent>
        <TabsContent value="loc">
          <Panel title="مواقع التحميل والتفريغ" icon={<MapPin />} actions={canLoc && <Button size="sm" variant="gold" onClick={() => open("loc")}><Plus /> موقع</Button>}>
            <DataTable entityTable="locations" rows={locations.data} loading={locations.isLoading} searchKeys={["name", "city", "customer.name"]} onEdit={canLoc ? (r) => open("loc", r) : undefined} onRowClick={canLoc ? (r) => open("loc", r) : undefined} cols={[
              { key: "name", label: "الموقع" },
              { key: "city", label: "المدينة" },
              { key: "customer", label: "العميل", render: (r) => r.customer?.name ?? "—" },
              { key: "coords", label: "الإحداثيات", render: (r) => <span className="num text-xs">{r.lat ? `${r.lat}, ${r.lng}` : "—"}</span> },
              { key: "working_hours", label: "ساعات العمل" },
              { key: "instructions", label: "تعليمات", className: "max-w-xs truncate" },
            ]} />
          </Panel>
        </TabsContent>
        <TabsContent value="ctr">
          <Panel title="العقود والأسعار" icon={<FileSignature />} actions={canCust && <Button size="sm" variant="gold" onClick={() => open("ctr")}><Plus /> عقد</Button>}>
            <DataTable entityTable="contracts" rows={contracts.data} loading={contracts.isLoading} searchKeys={["number", "customer.name"]} onEdit={canCust ? (r) => open("ctr", r) : undefined} onRowClick={canCust ? (r) => open("ctr", r) : undefined} cols={[
              { key: "number", label: "العقد", render: (r) => <span className="num font-semibold">{r.number} (v{r.version})</span> },
              { key: "customer", label: "العميل", render: (r) => r.customer?.name },
              { key: "pricing", label: "التسعير", render: (r) => `${fmtSAR(r.rate)} ${PRICING.find((p) => p[0] === r.pricing_model)?.[1]}` },
              { key: "wait", label: "الانتظار", render: (r) => `${r.free_wait_hours} س مجانًا ثم ${fmtSAR(r.wait_fee_per_hour)}/س` },
              { key: "period", label: "المدة", render: (r) => <span className="num">{fmtDate(r.start_date)} – </span> },
              { key: "end", label: "الانتهاء", render: (r) => <DocExpiry d={r.end_date} /> },
            ]} />
          </Panel>
        </TabsContent>
        <TabsContent value="car">
          <Panel title="الناقلون الخارجيون" icon={<Truck />} actions={canCust && <Button size="sm" variant="gold" onClick={() => open("car")}><Plus /> ناقل</Button>}>
            <DataTable entityTable="carriers" rows={carriers.data} loading={carriers.isLoading} onEdit={canCust ? (r) => open("car", r) : undefined} onRowClick={canCust ? (r) => open("car", r) : undefined} cols={[
              { key: "name", label: "الناقل" },
              { key: "cr_number", label: "السجل", render: (r) => <span className="num">{r.cr_number ?? "—"}</span> },
              { key: "contact_name", label: "جهة الاتصال" },
              { key: "phone", label: "الجوال", render: (r) => <span className="num">{r.phone ?? "—"}</span> },
              { key: "status", label: "الحالة", render: (r) => (r.status === "active" ? "نشط" : "موقوف") },
            ]} />
            <p className="mt-3 text-xs text-muted-foreground">تكلفة الناقل تُسجل في الملخص المالي للرحلة منفصلة عن إيراد العميل.</p>
          </Panel>
        </TabsContent>
      </Tabs>
      <EntityDialog open={dlg === "cust"} onOpenChange={(o) => !o && setDlg(null)} title="عميل" table="customers" fields={CUST} record={rec} invalidate={["customers"]} />
      <EntityDialog open={dlg === "loc"} onOpenChange={(o) => !o && setDlg(null)} title="موقع" table="locations" fields={LOC} record={rec} invalidate={["locations"]} />
      <EntityDialog open={dlg === "ctr"} onOpenChange={(o) => !o && setDlg(null)} title="عقد" table="contracts" fields={CTR} record={rec} invalidate={["contracts"]} />
      <EntityDialog open={dlg === "car"} onOpenChange={(o) => !o && setDlg(null)} title="ناقل خارجي" table="carriers" fields={CAR} record={rec} invalidate={["carriers"]} />
    </>
  );
}
