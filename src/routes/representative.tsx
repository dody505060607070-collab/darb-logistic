import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { Briefcase, ClipboardList, Loader2, LogOut, MessageCircle, Phone, Plus, Save, Send, Trash2, UserPlus, Users } from "lucide-react";
import { toast } from "sonner";
import { Logo } from "@/components/darb/Logo";
import { DisplayControls } from "@/components/darb/DisplayControls";
import { LocationPicker } from "@/components/darb/LocationPicker";
import { Badge, Empty, Loading } from "@/components/darb/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { roleHome } from "@/components/darb/AppShell";
import { useAuth } from "@/lib/auth";
import { db, useRows, type Row } from "@/lib/db";
import { CITY_COORDS, errMsg, fmtDateTime, fromLocalInput } from "@/lib/format";
import { optionalPhone } from "@/lib/phone";
import { flushWa } from "@/lib/wa-flush";
import { waDigits } from "@/lib/wa-links";

export const Route = createFileRoute("/representative")({
  head: () => ({
    meta: [
      { title: "صفحة المندوب | Shata" },
      { name: "description", content: "تسجيل زيارات العملاء ومواقع الاستلام وطلبات النقل من الميدان." },
      { property: "og:title", content: "صفحة المندوب | Shata" },
      { property: "og:description", content: "العملاء ومواقع الاستلام وطلبات النقل الميدانية." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: RepresentativeApp,
});

type Tab = "new" | "customers" | "requests";
const REQ_STATUS: Record<string, [string, "info" | "success" | "neutral"]> = { new: ["بانتظار الحركة", "info"], converted: ["تحوّل لأمر نقل", "success"], closed: ["مغلق", "neutral"] };
const UNITS = ["طن", "طرد", "منصة", "كرتون", "حاوية", "لتر"];
const sel = "h-10 w-full rounded-md border border-input bg-card px-3 text-sm";

function RepresentativeApp() {
  const auth = useAuth();
  const nav = useNavigate();
  const [tab, setTab] = useState<Tab>("new");
  const allowed = auth.can("representative", "ops_manager", "dispatcher");
  useEffect(() => {
    if (!auth.ready) return;
    if (!auth.session) void nav({ to: "/login" });
    else if (auth.roles.length && !allowed) void nav({ to: roleHome(auth.roles) });
  }, [auth.ready, auth.session, auth.roles, allowed, nav]);

  const customers = useRows(["customers", "rep"], () => db.from("customers").select("id,name,contact_name,phone,city,created_by").order("name"), allowed);
  const locations = useRows(["locations"], () => db.from("locations").select("*").order("name"), allowed);
  const requests = useRows(["customer_requests", "mine", auth.session?.user.id], () => db.from("customer_requests").select("*, customer:customers(name), pickup:locations!customer_requests_pickup_location_id_fkey(name,city)").eq("created_by", auth.session!.user.id).order("created_at", { ascending: false }).limit(50), allowed && !!auth.session);

  if (!auth.ready || !auth.session) return <div className="flex min-h-screen items-center justify-center"><Loader2 className="animate-spin" /></div>;

  return (
    <div dir="rtl" className="mx-auto flex min-h-screen max-w-md flex-col bg-background pb-20">
      {auth.isStaff && <div className="flex justify-end border-b px-4 py-2"><Button size="sm" variant="outline" onClick={() => { auth.setViewAs(null); void nav({ to: "/" }); }}>لوحة الإدارة</Button></div>}
      <header className="driver-toolbar flex flex-wrap items-center justify-between gap-2 px-4 py-3">
        <Logo light />
        <div className="flex shrink-0 items-center gap-2 text-xs">
          <DisplayControls />
          <Link to="/chat" aria-label="المحادثة مع الإدارة" className="flex items-center gap-1 rounded-full border px-2 py-1 font-semibold"><MessageCircle className="size-4" /> المحادثة</Link>
          <Button variant="ghost" size="icon" onClick={() => void auth.signOut()} aria-label="خروج"><LogOut className="size-5" /></Button>
        </div>
      </header>
      <div className="flex items-center gap-3 border-b bg-card px-4 py-3">
        <div className="flex size-11 items-center justify-center rounded-full border-2 border-gold"><Briefcase className="size-5 text-primary" /></div>
        <div><div className="font-bold text-primary">مرحبًا، {auth.fullName}</div><div className="text-xs text-muted-foreground">مندوب • زيارات العملاء وطلبات النقل</div></div>
      </div>
      <main className="flex-1 space-y-4 p-4">
        {tab === "new" && <NewRequest customers={customers.data ?? []} locations={locations.data ?? []} reloadCustomers={() => void customers.refetch()} reloadLocations={() => void locations.refetch()} done={() => setTab("requests")} />}
        {tab === "customers" && (customers.isLoading ? <Loading /> : <Customers customers={customers.data ?? []} locations={locations.data ?? []} reload={() => { void customers.refetch(); void locations.refetch(); }} />)}
        {tab === "requests" && (requests.isLoading ? <Loading /> : requests.error ? <p role="alert" className="text-sm text-danger">{errMsg(requests.error)}</p> : <MyRequests rows={requests.data ?? []} />)}
      </main>
      <nav className="fixed right-0 bottom-0 left-0 z-20 mx-auto grid max-w-md grid-cols-3 border-t bg-card">
        {([["new", "طلب جديد", Plus], ["customers", "العملاء", Users], ["requests", "طلباتي", ClipboardList]] as const).map(([k, l, I]) => (
          <Button variant="ghost" key={k} onClick={() => setTab(k)} className={`h-16 flex-col gap-1 rounded-none py-2.5 text-xs ${tab === k ? "bg-gold-soft font-bold text-primary" : "text-muted-foreground"}`}><I className="size-5" />{l}</Button>
        ))}
      </nav>
    </div>
  );
}

function CustomerDialog({ open, onOpenChange, onSaved }: { open: boolean; onOpenChange: (v: boolean) => void; onSaved: (id: string) => void }) {
  const [f, setF] = useState({ name: "", contact_name: "", phone: "", city: "الرياض" });
  const [busy, setBusy] = useState(false);
  async function save() {
    if (f.name.trim().length < 2) return void toast.error("اكتب اسم العميل أو الشركة");
    let phone: string | null;
    try { phone = optionalPhone(f.phone); } catch (e) { return void toast.error(errMsg(e)); }
    setBusy(true);
    const { data, error } = await db.from("customers").insert({ name: f.name.trim(), contact_name: f.contact_name.trim() || null, phone, city: f.city }).select("id").single();
    setBusy(false);
    if (error) return void toast.error(errMsg(error));
    toast.success("أُضيف العميل");
    setF({ name: "", contact_name: "", phone: "", city: "الرياض" });
    onSaved(data.id);
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl">
        <DialogHeader><DialogTitle>عميل جديد</DialogTitle></DialogHeader>
        <div className="grid gap-3">
          <div><Label className="mb-1 block text-xs">اسم العميل / الشركة</Label><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></div>
          <div><Label className="mb-1 block text-xs">اسم المسؤول</Label><Input value={f.contact_name} onChange={(e) => setF({ ...f, contact_name: e.target.value })} /></div>
          <div><Label className="mb-1 block text-xs">جوال المسؤول</Label><Input dir="ltr" inputMode="tel" placeholder="05XXXXXXXX" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></div>
          <div><Label className="mb-1 block text-xs">المدينة</Label><select className={sel} value={f.city} onChange={(e) => setF({ ...f, city: e.target.value })}>{Object.keys(CITY_COORDS).map((c) => <option key={c}>{c}</option>)}</select></div>
          <Button disabled={busy} onClick={() => void save()}>{busy ? <Loader2 className="animate-spin" /> : <Save />} حفظ العميل</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function NewRequest({ customers, locations, reloadCustomers, reloadLocations, done }: { customers: Row[]; locations: Row[]; reloadCustomers: () => void; reloadLocations: () => void; done: () => void }) {
  const qc = useQueryClient();
  const [v, setV] = useState<Row>({ unit: "طن" });
  const [addCustomer, setAddCustomer] = useState(false);
  const [busy, setBusy] = useState(false);
  const set = (k: string, x: unknown) => setV((s) => ({ ...s, [k]: x }));
  const custLocs = locations.filter((l) => !v.customer_id || l.customer_id === v.customer_id || !l.customer_id);
  async function submit() {
    if (!v.customer_id) return void toast.error("اختر العميل");
    if (!v.cargo_type || String(v.cargo_type).trim().length < 2) return void toast.error("اكتب نوع الحمولة");
    if (!v.pickup_location_id) return void toast.error("حدد مكان الاستلام على الخريطة");
    let contactPhone: string | null;
    try { contactPhone = optionalPhone(v.contact_phone); } catch (e) { return void toast.error(errMsg(e)); }
    setBusy(true);
    const { error } = await db.from("customer_requests").insert({
      customer_id: v.customer_id, pickup_location_id: v.pickup_location_id, delivery_location_id: v.delivery_location_id || null,
      delivery_city: v.delivery_city || null, cargo_type: String(v.cargo_type).trim(), quantity: v.quantity ? Number(v.quantity) : null, unit: v.unit,
      weight_kg: v.weight_kg ? Number(v.weight_kg) : null, pickup_from: v.pickup_from ? fromLocalInput(v.pickup_from) : null,
      contact_name: v.contact_name?.trim() || null, contact_phone: contactPhone, notes: v.notes?.trim() || null,
    });
    setBusy(false);
    if (error) return void toast.error(errMsg(error));
    flushWa();
    toast.success("وصل الطلب لموظف الحركة على واتساب وفي التنبيهات");
    setV({ unit: "طن" });
    void qc.invalidateQueries({ queryKey: ["customer_requests"] });
    done();
  }
  return (
    <div className="panel space-y-3 p-4">
      <h1 className="text-lg font-bold text-primary">زيارة عميل وطلب نقل</h1>
      <p className="text-xs text-muted-foreground">سجّل ما يحتاجه العميل وحدد مكان الاستلام على الخريطة، ويتحول الطلب لموظف الحركة ليعمل منه أمر نقل.</p>
      <div>
        <Label className="mb-1 block text-xs">العميل *</Label>
        <div className="flex gap-2">
          <select aria-label="العميل" className={sel} value={v.customer_id ?? ""} onChange={(e) => set("customer_id", e.target.value)}>
            <option value="">— اختر —</option>
            {customers.map((c) => <option key={c.id} value={c.id}>{c.name}{c.city ? ` — ${c.city}` : ""}</option>)}
          </select>
          <Button type="button" variant="outline" size="sm" className="h-10" onClick={() => setAddCustomer(true)}><UserPlus /> جديد</Button>
        </div>
      </div>
      <CustomerDialog open={addCustomer} onOpenChange={setAddCustomer} onSaved={(id) => { reloadCustomers(); set("customer_id", id); setAddCustomer(false); }} />
      <div><Label className="mb-1 block text-xs">مكان الاستلام *</Label><LocationPicker label="مكان الاستلام" value={v.pickup_location_id ?? ""} options={custLocs} customerId={v.customer_id} onChange={(id) => set("pickup_location_id", id)} onCreated={reloadLocations} /></div>
      <div><Label className="mb-1 block text-xs">مكان التسليم (إن كان معروفًا)</Label><LocationPicker label="مكان التسليم" value={v.delivery_location_id ?? ""} options={custLocs} customerId={v.customer_id} onChange={(id) => set("delivery_location_id", id)} onCreated={reloadLocations} /></div>
      {!v.delivery_location_id && <div><Label className="mb-1 block text-xs">أو مدينة التسليم</Label><select className={sel} value={v.delivery_city ?? ""} onChange={(e) => set("delivery_city", e.target.value)}><option value="">غير محددة</option>{Object.keys(CITY_COORDS).map((c) => <option key={c}>{c}</option>)}</select></div>}
      <div><Label className="mb-1 block text-xs">نوع الحمولة *</Label><Input value={v.cargo_type ?? ""} onChange={(e) => set("cargo_type", e.target.value)} placeholder="مثال: حديد، مواد بناء، مواد غذائية" /></div>
      <div className="grid grid-cols-3 gap-2">
        <div><Label className="mb-1 block text-xs">الكمية</Label><Input type="number" min={0} value={v.quantity ?? ""} onChange={(e) => set("quantity", e.target.value)} /></div>
        <div><Label className="mb-1 block text-xs">الوحدة</Label><select className={sel} value={v.unit} onChange={(e) => set("unit", e.target.value)}>{UNITS.map((u) => <option key={u}>{u}</option>)}</select></div>
        <div><Label className="mb-1 block text-xs">الوزن (كجم)</Label><Input type="number" min={0} value={v.weight_kg ?? ""} onChange={(e) => set("weight_kg", e.target.value)} /></div>
      </div>
      <div><Label className="mb-1 block text-xs">موعد الاستلام المطلوب</Label><Input type="datetime-local" value={v.pickup_from ?? ""} onChange={(e) => set("pickup_from", e.target.value)} /></div>
      <div className="grid grid-cols-2 gap-2">
        <div><Label className="mb-1 block text-xs">اسم المسؤول بالموقع</Label><Input value={v.contact_name ?? ""} onChange={(e) => set("contact_name", e.target.value)} /></div>
        <div><Label className="mb-1 block text-xs">جواله</Label><Input dir="ltr" inputMode="tel" placeholder="05XXXXXXXX" value={v.contact_phone ?? ""} onChange={(e) => set("contact_phone", e.target.value)} /></div>
      </div>
      <div><Label className="mb-1 block text-xs">تفاصيل الزيارة وملاحظات</Label><Textarea maxLength={500} value={v.notes ?? ""} onChange={(e) => set("notes", e.target.value)} placeholder="ماذا اتفقت مع العميل؟ أي شروط أو أوقات للتحميل؟" /></div>
      <Button className="h-12 w-full" disabled={busy} onClick={() => void submit()}>{busy ? <Loader2 className="animate-spin" /> : <Send />} إرسال الطلب لموظف الحركة</Button>
    </div>
  );
}

function Customers({ customers, locations, reload }: { customers: Row[]; locations: Row[]; reload: () => void }) {
  const [add, setAdd] = useState(false);
  const [q, setQ] = useState("");
  const list = customers.filter((c) => !q || `${c.name} ${c.city ?? ""} ${c.phone ?? ""}`.includes(q));
  return (
    <div className="space-y-3">
      <div className="flex gap-2"><Input placeholder="بحث بالاسم أو المدينة أو الجوال" value={q} onChange={(e) => setQ(e.target.value)} /><Button onClick={() => setAdd(true)}><UserPlus /> عميل</Button></div>
      <CustomerDialog open={add} onOpenChange={setAdd} onSaved={() => { setAdd(false); reload(); }} />
      {list.length === 0 ? <div className="panel"><Empty text="لا يوجد عملاء بعد — أضف أول عميل" /></div> : list.map((c) => {
        const locs = locations.filter((l) => l.customer_id === c.id);
        return (
          <div key={c.id} className="panel space-y-2 p-3 text-sm">
            <div className="flex items-center justify-between"><b className="text-primary">{c.name}</b><span className="text-xs text-muted-foreground">{c.city}</span></div>
            {c.contact_name && <div className="text-xs">المسؤول: {c.contact_name}</div>}
            {c.phone && <div className="flex gap-2">
              <Button size="sm" variant="outline" asChild><a href={`tel:${c.phone}`}><Phone /> اتصال</a></Button>
              <Button size="sm" variant="outline" asChild><a href={`https://wa.me/${waDigits(c.phone)}`} target="_blank" rel="noreferrer"><MessageCircle /> واتساب</a></Button>
            </div>}
            <div className="text-xs text-muted-foreground">المواقع: {locs.length ? locs.map((l) => `${l.name} (${l.city})`).join("، ") : "لا يوجد"}</div>
            <LocationPicker label={`موقع لـ ${c.name}`} value="" options={locs} customerId={c.id} onChange={() => undefined} onCreated={reload} />
          </div>
        );
      })}
    </div>
  );
}

function MyRequests({ rows }: { rows: Row[] }) {
  const qc = useQueryClient();
  async function remove(id: string) {
    const { error } = await db.from("customer_requests").delete().eq("id", id).eq("status", "new");
    if (error) return void toast.error(errMsg(error));
    toast.success("حُذف الطلب");
    void qc.invalidateQueries({ queryKey: ["customer_requests"] });
  }
  if (!rows.length) return <div className="panel"><Empty text="لم ترسل طلبات بعد" /></div>;
  return (
    <div className="space-y-2">
      {rows.map((r) => (
        <div key={r.id} className="panel space-y-1 p-3 text-sm">
          <div className="flex items-center justify-between"><span className="num font-bold text-primary">{r.number}</span><Badge tone={REQ_STATUS[r.status]?.[1] ?? "neutral"}>{REQ_STATUS[r.status]?.[0] ?? r.status}</Badge></div>
          <div>{r.customer?.name} — {r.cargo_type}{r.quantity ? ` (${r.quantity} ${r.unit ?? ""})` : ""}</div>
          <div className="text-xs text-muted-foreground">الاستلام: {r.pickup ? `${r.pickup.name} — ${r.pickup.city}` : "—"} • {fmtDateTime(r.created_at)}</div>
          {r.status === "closed" && r.close_reason && <div className="text-xs text-danger">سبب الإغلاق: {r.close_reason}</div>}
          {r.status === "new" && <Button size="sm" variant="ghost" onClick={() => void remove(r.id)}><Trash2 className="text-danger" /> حذف</Button>}
        </div>
      ))}
    </div>
  );
}
