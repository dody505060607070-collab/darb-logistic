import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Bell, Building, History, KeyRound, Plug, Plus, Settings as Cog, Trash2, Users } from "lucide-react";
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
import { ROLE_LABELS, useAuth, type AppRole } from "@/lib/auth";
import { errMsg, fmtDateTime } from "@/lib/format";

export const Route = createFileRoute("/settings")({
  validateSearch: (s: Record<string, unknown>) => ({ tab: typeof s["tab"] === "string" ? (s["tab"] as string) : undefined }),
  head: () => ({
    meta: [
      { title: "الإعدادات والمستخدمون والصلاحيات — دَرب" },
      { name: "description", content: "إعداد الشركة والفروع والمستخدمين والصلاحيات وحالة التكاملات وسجل التدقيق." },
      { property: "og:title", content: "الإعدادات — دَرب" },
      { property: "og:description", content: "الشركة والمستخدمون والصلاحيات والتكاملات." },
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
  { name: "مزود تتبع GPS", desc: "قراءات المواقع والعداد", needs: "رابط خادم التتبع ومفتاح الوصول", free: [
    { label: "جوال السائق (مجاني)", url: "", note: "يعمل الآن: تطبيق السائق يرسل موقعه عند كل حدث في الرحلة." },
    { label: "Traccar", url: "https://www.traccar.org/", note: "مفتوح المصدر ومجاني، يدعم أغلب أجهزة GPS للشاحنات." },
  ] },
  { name: "مزود توجيه الشاحنات", desc: "مسارات تراعي قيود الشاحنات ووقت الوصول", needs: "مفتاح API", free: [
    { label: "OpenRouteService", url: "https://account.heigit.org/signup", note: "مجاني (حتى 2000 طلب يوميًا) ويدعم مسارات الشاحنات الثقيلة." },
  ] },
  { name: "الفوترة الإلكترونية (ZATCA)", desc: "إصدار الفواتير الإلكترونية واستلام حالتها", needs: "الرقم الضريبي وشهادة الربط من بوابة فاتورة", free: [
    { label: "بيئة مطوري فاتورة", url: "https://sandbox.zatca.gov.sa/", note: "بيئة تجربة مجانية من الهيئة قبل الربط الفعلي." },
    { label: "بوابة فاتورة", url: "https://fatoora.zatca.gov.sa/", note: "الربط الفعلي مجاني لكنه يتطلب سجل الشركة الضريبي." },
  ] },
];

function SettingsPage() {
  const { tab } = Route.useSearch();
  const { can, session } = useAuth();
  const qc = useQueryClient();
  const isOwner = can("owner");
  const company = useOne(["company_settings"], () => db.from("company_settings").select("*").eq("id", 1).maybeSingle());
  const branches = useRows(["branches"], () => db.from("branches").select("*").order("name"));
  const profiles = useRows(["profiles"], () => db.from("profiles").select("*").order("created_at"), isOwner);
  const roles = useRows(["user_roles"], () => db.from("user_roles").select("*"), isOwner);
  const invites = useRows(["invitations"], () => db.from("invitations").select("*").order("created_at", { ascending: false }), isOwner);
  const notifs = useRows(["notifications", "all"], () => db.from("notifications").select("*").order("created_at", { ascending: false }).limit(100));
  const audit = useRows(["audit_log"], () => db.from("audit_log").select("*").order("at", { ascending: false }).limit(200), isOwner);
  const [c, setC] = useState<Row>({});
  const [branchOpen, setBranchOpen] = useState(false);
  const [invOpen, setInvOpen] = useState(false);
  const [addRole, setAddRole] = useState<Record<string, string>>({});
  const [linkDriver, setLinkDriver] = useState<Record<string, string>>({});
  const freeDrivers = useRows(["drivers", "unlinked"], () => db.from("drivers").select("id, full_name, user_id").is("user_id", null).order("full_name"), isOwner);
  const pending = (profiles.data ?? []).filter((p) => !(roles.data ?? []).some((r) => r.user_id === p.id));

  useEffect(() => { if (company.data) setC(company.data); }, [company.data]);

  async function saveCompany() {
    const { error } = await db.from("company_settings").update({ company_name: c.company_name, vat_rate: Number(c.vat_rate), vat_number: c.vat_number, cr_number: c.cr_number, doc_expiry_warning_days: Number(c.doc_expiry_warning_days), updated_at: new Date().toISOString() }).eq("id", 1);
    if (error) return void toast.error(errMsg(error));
    toast.success("تم حفظ إعدادات الشركة");
  }
  async function grant(uid: string, role?: string) {
    const r = role ?? addRole[uid];
    if (!r) return void toast.error("اختر الدور أولًا");
    if (r === "driver") {
      const d = linkDriver[uid];
      if (!d) return void toast.error("اختر ملف السائق المرتبط بهذا الحساب");
      const { error: e1 } = await db.from("drivers").update({ user_id: uid }).eq("id", d);
      if (e1) return void toast.error(errMsg(e1));
      void qc.invalidateQueries({ queryKey: ["drivers"] });
    }
    const { error } = await db.from("user_roles").insert({ user_id: uid, role: r });
    if (error) return void toast.error(errMsg(error));
    toast.success(`تم منح دور ${ROLE_LABELS[r as AppRole]}`);
    void qc.invalidateQueries({ queryKey: ["user_roles"] });
  }
  async function revoke(id: string) {
    const { error } = await db.from("user_roles").delete().eq("id", id);
    if (error) return void toast.error(errMsg(error));
    void qc.invalidateQueries({ queryKey: ["user_roles"] });
  }
  async function setNotif(id: string, status: string) {
    const { error } = await db.from("notifications").update({ status }).eq("id", id);
    if (error) return void toast.error(errMsg(error));
    void qc.invalidateQueries({ queryKey: ["notifications"] });
  }

  return (
    <>
      <PageHeader title="الإعدادات والمستخدمون والصلاحيات والتكاملات" icon={<Cog />} />
      {isOwner && pending.length > 0 && (
        <Panel tone="copper" className="mb-5" title={`حسابات جديدة بانتظار الصلاحية (${pending.length})`} icon={<KeyRound />}>
          <p className="mb-3 text-sm text-muted-foreground">هؤلاء سجّلوا دخولًا ولا يملكون أي دور بعد، فلا يرون أي بيانات. اختر الدور المناسب لكل شخص واضغط «منح».</p>
          <div className="grid gap-3 lg:grid-cols-2">
            {pending.map((p) => (
              <div key={p.id} className="flex flex-wrap items-center gap-2 rounded-2xl bg-black/25 p-3">
                <div className="min-w-40 flex-1">
                  <b className="block">{p.full_name}</b>
                  <span className="num text-xs opacity-70">{p.email}</span>
                </div>
                <select aria-label="الدور" className="h-9 rounded-xl border border-white/20 bg-black/40 px-2 text-sm" value={addRole[p.id] ?? ""} onChange={(e) => setAddRole({ ...addRole, [p.id]: e.target.value })}>
                  <option value="">اختر الدور…</option>
                  {Object.entries(ROLE_LABELS).filter(([k]) => k !== "owner").map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                </select>
                {addRole[p.id] === "driver" && (
                  <select aria-label="ملف السائق" className="h-9 rounded-xl border border-white/20 bg-black/40 px-2 text-sm" value={linkDriver[p.id] ?? ""} onChange={(e) => setLinkDriver({ ...linkDriver, [p.id]: e.target.value })}>
                    <option value="">ملف السائق…</option>
                    {(freeDrivers.data ?? []).map((d) => <option key={d.id} value={d.id}>{d.full_name}</option>)}
                  </select>
                )}
                <Button size="sm" variant="gold" onClick={() => void grant(p.id)}>منح</Button>
              </div>
            ))}
          </div>
        </Panel>
      )}
      <Tabs defaultValue={tab ?? (isOwner ? "users" : "alerts")} dir="rtl">
        <TabsList className="flex-wrap">
          {isOwner && <TabsTrigger value="users">المستخدمون والصلاحيات</TabsTrigger>}
          {isOwner && <TabsTrigger value="company">الشركة والفروع</TabsTrigger>}
          <TabsTrigger value="integrations">التكاملات</TabsTrigger>
          <TabsTrigger value="alerts">التنبيهات</TabsTrigger>
          {isOwner && <TabsTrigger value="audit">سجل التدقيق</TabsTrigger>}
        </TabsList>
        {isOwner && (
          <TabsContent value="company">
            <div className="grid gap-5 xl:grid-cols-2">
              <Panel title="بيانات الشركة" icon={<Building />}>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="sm:col-span-2"><Label className="mb-1 block text-xs">اسم الشركة</Label><Input value={c.company_name ?? ""} onChange={(e) => setC({ ...c, company_name: e.target.value })} /></div>
                  <div><Label className="mb-1 block text-xs">السجل التجاري</Label><Input value={c.cr_number ?? ""} onChange={(e) => setC({ ...c, cr_number: e.target.value })} /></div>
                  <div><Label className="mb-1 block text-xs">الرقم الضريبي</Label><Input value={c.vat_number ?? ""} onChange={(e) => setC({ ...c, vat_number: e.target.value })} /></div>
                  <div><Label className="mb-1 block text-xs">نسبة ضريبة القيمة المضافة %</Label><Input type="number" value={c.vat_rate ?? ""} onChange={(e) => setC({ ...c, vat_rate: e.target.value })} /></div>
                  <div><Label className="mb-1 block text-xs">التنبيه قبل انتهاء المستندات (يوم)</Label><Input type="number" value={c.doc_expiry_warning_days ?? ""} onChange={(e) => setC({ ...c, doc_expiry_warning_days: e.target.value })} /></div>
                  <div><Label className="mb-1 block text-xs">المنطقة الزمنية للعرض</Label><Input value="Asia/Riyadh" disabled /></div>
                </div>
                <Button variant="gold" className="mt-4" onClick={() => void saveCompany()}>حفظ</Button>
              </Panel>
              <Panel title="الفروع" icon={<Building />} actions={<Button size="sm" variant="gold" onClick={() => setBranchOpen(true)}><Plus /> فرع</Button>}>
                <DataTable rows={branches.data} loading={branches.isLoading} cols={[{ key: "name", label: "الفرع" }, { key: "city", label: "المدينة" }]} />
              </Panel>
            </div>
          </TabsContent>
        )}
        {isOwner && (
          <TabsContent value="users">
            <div className="grid gap-5 xl:grid-cols-[1fr_380px]">
              <Panel title="المستخدمون" icon={<Users />}>
                <DataTable rows={profiles.data} loading={profiles.isLoading} cols={[
                  { key: "full_name", label: "الاسم", render: (p) => <b>{p.full_name}</b> },
                  { key: "email", label: "البريد", render: (p) => <span className="num text-xs">{p.email}</span> },
                  { key: "roles", label: "الأدوار", render: (p) => (
                    <div className="flex flex-wrap gap-1">
                      {(roles.data ?? []).filter((r) => r.user_id === p.id).map((r) => (
                        <Badge key={r.id} tone="gold">{ROLE_LABELS[r.role as AppRole]}{!(r.role === "owner" && p.id === session?.user.id) && <button onClick={() => void revoke(r.id)} className="mr-1 text-danger" aria-label="إزالة"><Trash2 className="size-3" /></button>}</Badge>
                      ))}
                    </div>
                  ) },
                  { key: "add", label: "منح دور", render: (p) => (
                    <div className="flex gap-1">
                      <select className="h-8 rounded-md border bg-card px-1 text-xs" value={addRole[p.id] ?? ""} onChange={(e) => setAddRole({ ...addRole, [p.id]: e.target.value })}>
                        <option value="">—</option>
                        {Object.entries(ROLE_LABELS).filter(([k]) => k !== "owner").map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                      </select>
                      {addRole[p.id] === "driver" && (
                        <select aria-label="ملف السائق" className="h-8 rounded-md border bg-card px-1 text-xs" value={linkDriver[p.id] ?? ""} onChange={(e) => setLinkDriver({ ...linkDriver, [p.id]: e.target.value })}>
                          <option value="">ملف السائق…</option>
                          {(freeDrivers.data ?? []).map((d) => <option key={d.id} value={d.id}>{d.full_name}</option>)}
                        </select>
                      )}
                      <Button size="sm" variant="soft" onClick={() => void grant(p.id)}>منح</Button>
                    </div>
                  ) },
                ]} />
              </Panel>
              <Panel title="الدعوات" icon={<KeyRound />} actions={<Button size="sm" variant="gold" onClick={() => setInvOpen(true)}><Plus /> دعوة</Button>}>
                <p className="mb-3 text-xs text-muted-foreground">التسجيل خاص: المستخدم يُنشئ حسابه بالبريد المدعو فيحصل على الدور تلقائيًا. لا تُرسل رسائل خارجية من النظام.</p>
                <DataTable rows={invites.data} loading={invites.isLoading} cols={[
                  { key: "email", label: "البريد", render: (i) => <span className="num text-xs">{i.email}</span> },
                  { key: "role", label: "الدور", render: (i) => ROLE_LABELS[i.role as AppRole] },
                  { key: "st", label: "الحالة", render: (i) => (i.accepted_at ? <Badge tone="success">مقبولة</Badge> : <Badge tone="warning">بانتظار</Badge>) },
                ]} />
              </Panel>
            </div>
          </TabsContent>
        )}
        <TabsContent value="integrations">
          <Panel title="حالة التكاملات (الحالة الحقيقية)" icon={<Plug />}>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              <WhatsAppIntegrationCard isOwner={isOwner} />
              {INTEGRATIONS.map((i) => (
                <div key={i.name} className="rounded-lg border p-4">
                  <div className="flex items-center justify-between"><b className="text-primary">{i.name}</b><Badge>لم يتم الربط</Badge></div>
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
      <EntityDialog open={branchOpen} onOpenChange={setBranchOpen} title="فرع جديد" table="branches" invalidate={["branches"]} fields={[{ name: "name", label: "اسم الفرع", required: true }, { name: "city", label: "المدينة", required: true }]} />
      <EntityDialog open={invOpen} onOpenChange={setInvOpen} title="دعوة مستخدم" table="invitations" invalidate={["invitations"]}
        transform={(v) => ({ ...v, email: String(v["email"]).toLowerCase().trim(), invited_by: session?.user.id })} fields={[
          { name: "email", label: "البريد الإلكتروني", required: true },
          { name: "role", label: "الدور", type: "select", required: true, options: Object.entries(ROLE_LABELS).filter(([k]) => k !== "owner") as [string, string][] },
          { name: "driver_id", label: "ربط بملف سائق (للسائقين)", type: "ref", ref: { table: "drivers", label: "full_name", filter: (q) => q.is("user_id", null) } },
        ]} />
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
