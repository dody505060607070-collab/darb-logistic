import { useEffect, useState } from "react";
import { parseAlertDays, parseDocTypes } from "@/lib/doc-alerts";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Bell, Building, History, Plug, Plus, Settings as Cog } from "lucide-react";
import { toast } from "sonner";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/darb/AppShell";
import { Badge, DataTable, PageHeader, Panel, Status } from "@/components/darb/ui";
import { EntityDialog } from "@/components/darb/EntityDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { db, useOne, useRows, type Row } from "@/lib/db";
import { whatsappStatus } from "@/lib/whatsapp.functions";
import { integrationHealth } from "@/lib/integration-health.functions";
import { useServerFn } from "@tanstack/react-start";
import { useAuth } from "@/lib/auth";
import { EmployeeDirectory } from "@/components/darb/EmployeeDirectory";
import { WorkshopDirectory } from '@/components/darb/WorkshopDirectory';
import { SystemChecklist } from "@/components/darb/SystemChecklist";
import { errMsg, fmtDateTime } from "@/lib/format";

export const Route = createFileRoute("/settings")({
  validateSearch: (s: Record<string, unknown>) => ({ tab: typeof s["tab"] === "string" ? (s["tab"] as string) : undefined }),
  head: () => ({
    meta: [
      { title: "الإعدادات والموظفون | Shata" },
      { name: "description", content: "إعداد الشركة والفروع والموظفين والصلاحيات وحالة التكاملات وسجل التدقيق." },
      { property: "og:title", content: "الإعدادات | Shata" },
      { property: "og:description", content: "الشركة والموظفون والتكاملات." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <AppShell>
      <SettingsPage />
    </AppShell>
  ),
});

type FreeOption = { label: string; url: string; note: string };
const INTEGRATIONS: { name: string; desc: string; needs: string; free: FreeOption[] }[] = [
  { name: "ضمان المهندس — Eco5 Lite", desc: "قراءات أجهزة الشركة حسب الاشتراك الفعلي", needs: "توثيق الربط وعنوان المنصة والوصول الآمن ومعرفات الأجهزة وربطها باللوحات", free: [
    { label: "لم يتم الربط", url: "", note: "اسم الجهاز لا يثبت خصائصه؛ ينتظر التوثيق الرسمي. الربط السابق مع Traccar منفصل وليس ربط ضمان المهندس." },
  ] },
  { name: "مزود توجيه الشاحنات", desc: "مسارات تراعي قيود الشاحنات ووقت الوصول", needs: "مفتاح API", free: [
    { label: "OpenRouteService", url: "https://account.heigit.org/signup", note: "اتصال التوجيه السابق متاح للفحص؛ لم يتم اعتماد الأبعاد والحمولات كتوجيه شاحنات رسمي." },
  ] },
  { name: 'PetroApp — الوقود', desc: 'عمليات التعبئة والبطاقات والمركبات', needs: 'التوثيق الرسمي وبيانات الوصول وعينة عمليات ومعرفات المركبات والبطاقات', free:[{label:'لم يتم الربط',url:'',note:'لا يوجد عنوان API مفترض؛ الاستيراد الرسمي بديل مستقل عند توفر الملف.'}] },
  { name: "الفوترة الإلكترونية (ZATCA)", desc: "إصدار الفواتير الإلكترونية واستلام حالتها", needs: "الرقم الضريبي وشهادة الربط من بوابة فاتورة", free: [
    { label: "بيئة مطوري فاتورة", url: "https://sandbox.zatca.gov.sa/", note: "بيئة تجربة مجانية من الهيئة قبل الربط الفعلي." },
    { label: "بوابة فاتورة", url: "https://fatoora.zatca.gov.sa/", note: "الربط الفعلي مجاني لكنه يتطلب سجل الشركة الضريبي." },
  ] },
];

function SettingsPage() {
  const { tab } = Route.useSearch();
  const { can } = useAuth();
  const qc = useQueryClient();
  const isOwner = can("owner");
  const checkHealth = useServerFn(integrationHealth);
  const health = useQuery({ queryKey: ['integration-health'], queryFn: () => checkHealth(), enabled: isOwner, staleTime: 60000 });
  const company = useOne(["company_settings"], () => db.from("company_settings").select("*").eq("id", 1).maybeSingle());
  const branches = useRows(["branches"], () => db.from("branches").select("*").order("name"));
  const profiles = useRows(["profiles"], () => db.from("profiles").select("*").order("created_at"), isOwner);
  const notifs = useRows(["notifications", "all"], () => db.from("notifications").select("*").order("created_at", { ascending: false }).limit(100));
  const audit = useRows(["audit_log"], () => db.from("audit_log").select("*").order("at", { ascending: false }).limit(200), isOwner);
  const [c, setC] = useState<Row>({});
  const [branchOpen, setBranchOpen] = useState(false);
  const [branchRecord, setBranchRecord] = useState<Row | null>(null);

  useEffect(() => { if (company.data) setC(company.data); }, [company.data]);

  const listOf = (text: unknown, current: unknown) => (text === undefined ? (current as string[]) ?? [] : parseDocTypes(String(text)));
  async function saveCompany() {
    const alertDays = parseAlertDays(String(c.doc_alert_days_text ?? (c.doc_alert_days ?? []).join("، ")));
    if (!alertDays) return void toast.error("أدخل من 1 إلى 5 أيام تنبيه بين 1 و365، مثل: 30، 15، 7");
    const { error } = await db.from("company_settings").update({ company_name: c.company_name, vat_rate: Number(c.vat_rate), vat_number: c.vat_number, cr_number: c.cr_number, doc_alert_days: alertDays, doc_required_driver: listOf(c.doc_required_driver_text, c.doc_required_driver), doc_required_asset: listOf(c.doc_required_asset_text, c.doc_required_asset), updated_at: new Date().toISOString() }).eq("id", 1);
    if (error) return void toast.error(errMsg(error));
    toast.success("تم حفظ إعدادات الشركة");
    void qc.invalidateQueries({ queryKey: ["company_settings"] });
  }
  async function setNotif(id: string, status: string) {
    const { error } = await db.from("notifications").update({ status }).eq("id", id);
    if (error) return void toast.error(errMsg(error));
    void qc.invalidateQueries({ queryKey: ["notifications"] });
  }

  return (
    <>
      <PageHeader title="الإعدادات والموظفون" icon={<Cog />} />
      <Tabs defaultValue={tab ?? (isOwner ? "users" : "alerts")} dir="rtl">
        <TabsList className="mb-5 flex h-auto w-full flex-wrap gap-2 bg-transparent p-0 [&>button]:min-h-11 [&>button]:min-w-0 [&>button]:flex-1 [&>button]:rounded-xl [&>button]:border [&>button]:bg-card [&>button]:px-4 [&>button]:py-3 [&>button]:text-sm [&>button[data-state=active]]:bg-primary [&>button[data-state=active]]:text-primary-foreground">
          {isOwner && <TabsTrigger value="users">الموظفون</TabsTrigger>}
          {isOwner && <TabsTrigger value="workshops">الورش وحساباتها</TabsTrigger>}
          {isOwner && <TabsTrigger value="company">الشركة والفروع</TabsTrigger>}
          <TabsTrigger value="integrations">التكاملات</TabsTrigger>
          <TabsTrigger value="alerts">التنبيهات</TabsTrigger>
          {isOwner && <TabsTrigger value="checklist">قائمة التحقق</TabsTrigger>}
          {isOwner && <TabsTrigger value="audit">سجل التدقيق</TabsTrigger>}
        </TabsList>
        {isOwner && <TabsContent value="workshops"><WorkshopDirectory/></TabsContent>}
        {isOwner && (
          <TabsContent value="company">
            <div className="grid gap-5 xl:grid-cols-2">
              <Panel title="بيانات الشركة" icon={<Building />}>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="sm:col-span-2"><Label className="mb-1 block text-xs">اسم الشركة</Label><Input value={c.company_name ?? ""} onChange={(e) => setC({ ...c, company_name: e.target.value })} /></div>
                  <div><Label className="mb-1 block text-xs">السجل التجاري</Label><Input value={c.cr_number ?? ""} onChange={(e) => setC({ ...c, cr_number: e.target.value })} /></div>
                  <div><Label className="mb-1 block text-xs">الرقم الضريبي</Label><Input value={c.vat_number ?? ""} onChange={(e) => setC({ ...c, vat_number: e.target.value })} /></div>
                  <div><Label className="mb-1 block text-xs">نسبة ضريبة القيمة المضافة %</Label><Input type="number" value={c.vat_rate ?? ""} onChange={(e) => setC({ ...c, vat_rate: e.target.value })} /></div>
                  <div><Label className="mb-1 block text-xs">مواعيد التنبيه قبل انتهاء المستندات (أيام)</Label><Input inputMode="numeric" placeholder="30، 15، 7" value={c.doc_alert_days_text ?? (c.doc_alert_days ?? []).join("، ")} onChange={(e) => setC({ ...c, doc_alert_days_text: e.target.value })} /></div>
                  <div className="sm:col-span-2"><Label className="mb-1 block text-xs">مستندات السائق المطلوبة</Label><Input value={c.doc_required_driver_text ?? (c.doc_required_driver ?? []).join("، ")} onChange={(e) => setC({ ...c, doc_required_driver_text: e.target.value })} /></div>
                  <div className="sm:col-span-2"><Label className="mb-1 block text-xs">مستندات المركبة المطلوبة</Label><Input value={c.doc_required_asset_text ?? (c.doc_required_asset ?? []).join("، ")} onChange={(e) => setC({ ...c, doc_required_asset_text: e.target.value })} /></div>
                  <div><Label className="mb-1 block text-xs">المنطقة الزمنية للعرض</Label><Input value="Asia/Riyadh" disabled /></div>
                </div>
                <Button variant="gold" className="mt-4" onClick={() => void saveCompany()}>حفظ</Button>
              </Panel>
              <Panel title="الفروع" icon={<Building />} actions={<Button size="sm" variant="gold" onClick={() => { setBranchRecord(null); setBranchOpen(true); }}><Plus /> فرع</Button>}>
                <DataTable rows={branches.data} loading={branches.isLoading} onEdit={r => { setBranchRecord(r); setBranchOpen(true); }} cols={[{ key: "name", label: "الفرع" }, { key: "city", label: "المدينة" }]} />
              </Panel>
            </div>
          </TabsContent>
        )}
        {isOwner && (
          <TabsContent value="users"><EmployeeDirectory /></TabsContent>
        )}
        {isOwner && <TabsContent value="checklist"><SystemChecklist /></TabsContent>}
        <TabsContent value="integrations">
          <Panel title="حالة التكاملات (الحالة الحقيقية)" icon={<Plug />}>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              <WhatsAppIntegrationCard isOwner={isOwner} />
              {INTEGRATIONS.map((i, index) => (
                <div key={i.name} className="rounded-lg border p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2"><b className="text-primary">{i.name}</b><Badge tone={index===1&&health.data?.routing.state==='connected'?'success':'neutral'}>{index===1&&health.data?.routing.state==='connected'?'خادم التوجيه متصل':'لم يتم الربط'}</Badge></div>
                  <p className="mt-1 text-sm text-muted-foreground">{i.desc}</p>
                  <p className="mt-2 text-xs"><span className="font-semibold">المطلوب للربط:</span> {i.needs}</p>
                  <ul className="mt-3 space-y-2 border-t pt-3 text-xs">
                    {i.free.map((f) => (
                      <li key={f.label}>
                        {f.url ? <a href={f.url} target="_blank" rel="noreferrer" className="font-semibold text-primary underline underline-offset-4">{f.label}</a> : <b>{f.label}</b>}
                        <span className="text-muted-foreground"> — {f.note}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
              <div className="rounded-lg border border-success/40 p-4">
                <div className="flex items-center justify-between"><b className="text-primary">قاعدة البيانات والملفات</b><Badge tone="success">متصل</Badge></div>
                <p className="mt-1 text-sm text-muted-foreground">تخزين البيانات والمرفقات الخاصة بروابط مؤقتة.</p>
              </div>
            </div>
          </Panel>
        </TabsContent>
        <TabsContent value="alerts">
          <Panel title="التنبيهات" icon={<Bell />}>
            <DataTable rows={notifs.data} loading={notifs.isLoading} searchKeys={["title", "body", "category"]} cols={[
              { key: "at", label: "الوقت", render: (n) => <span className="num">{fmtDateTime(n.created_at)}</span> },
              { key: "severity", label: "الشدة", render: (n) => <Status kind="severity" value={n.severity} /> },
              { key: "title", label: "العنوان" },
              { key: "body", label: "التفاصيل", className: "max-w-sm truncate" },
              { key: "status", label: "الحالة", render: (n) => <Badge tone={n.status === "open" ? "warning" : n.status === "resolved" ? "success" : "info"}>{n.status === "open" ? "مفتوح" : n.status === "resolved" ? "مُعالج" : "مُستلم"}</Badge> },
              { key: "act", label: "", render: (n) => n.status !== "resolved" && <div className="flex gap-1">{n.status === "open" && <Button size="sm" variant="outline" onClick={() => void setNotif(n.id, "acknowledged")}>استلام</Button>}<Button size="sm" variant="soft" onClick={() => void setNotif(n.id, "resolved")}>معالجة</Button></div> },
            ]} />
          </Panel>
        </TabsContent>
        {isOwner && (
          <TabsContent value="audit">
            <Panel title="سجل التدقيق (غير قابل للتعديل)" icon={<History />}>
              <DataTable rows={audit.data} loading={audit.isLoading} searchKeys={["table_name", "action", "row_id"]} cols={[
                { key: "at", label: "الوقت", render: (a) => <span className="num">{fmtDateTime(a.at)}</span> },
                { key: "table_name", label: "الجدول" },
                { key: "action", label: "العملية", render: (a) => <Badge tone={a.action === "DELETE" ? "danger" : a.action === "OVERRIDE" ? "warning" : "info"}>{a.action}</Badge> },
                { key: "row_id", label: "السجل", render: (a) => <span className="num text-xs">{String(a.row_id).slice(0, 8)}</span> },
                { key: "actor", label: "المنفذ", render: (a) => <span className="num text-xs">{a.actor ? (profiles.data ?? []).find((p) => p.id === a.actor)?.full_name ?? String(a.actor).slice(0, 8) : "النظام"}</span> },
              ]} />
            </Panel>
          </TabsContent>
        )}
      </Tabs>
      <EntityDialog open={branchOpen} onOpenChange={setBranchOpen} title={branchRecord ? 'تعديل الفرع' : 'فرع جديد'} table="branches" record={branchRecord} invalidate={["branches"]} fields={[{ name: "name", label: "اسم الفرع", required: true }, { name: "city", label: "المدينة", required: true }]} />

    </>
  );
}

function WhatsAppIntegrationCard({ isOwner }: { isOwner: boolean }) {
  const st = useQuery({ queryKey: ["whatsapp-status"], queryFn: () => whatsappStatus(), enabled: isOwner });
  const s = st.data;
  const linked = s?.state === "open";
  const label = !isOwner ? "يديره المدير العام" : st.isLoading ? "جارٍ الفحص…" : linked ? "متصل" : s?.configured ? "بانتظار مسح رمز QR" : "لم يتم الربط";
  return (
    <div className={`rounded-lg border p-4 ${linked ? "border-success/40" : ""}`}>
      <div className="flex items-center justify-between"><b className="text-primary">واتساب</b><Badge tone={linked ? "success" : s?.configured ? "warning" : "neutral"}>{label}</Badge></div>
      <p className="mt-1 text-sm text-muted-foreground">رسائل المهام والتذكيرات للموظفين من رقم الشركة.</p>
      {linked && s?.number && <p className="mt-2 text-xs">الرقم المربوط: <b dir="ltr" className="num">{s.number}</b></p>}
      {isOwner && <Link to="/activity" className="mt-3 inline-block text-xs font-semibold text-primary underline underline-offset-4">إدارة الرقم ورمز QR</Link>}
    </div>
  );
}
