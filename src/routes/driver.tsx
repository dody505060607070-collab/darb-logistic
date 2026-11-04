import { useCallback, useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle, Bell, Camera, Check, ClipboardCheck, CloudOff, Coins, Fuel, Home, Loader2, LogOut, MapPin, PackageCheck, RefreshCw, Route as RouteIcon, Truck, User,
} from "lucide-react";
import { toast } from "sonner";
import { Logo } from "@/components/darb/Logo";
import { Badge, Empty, Loading } from "@/components/darb/ui";
import { Checklist, freshChecklist, type CheckAnswer } from "@/components/darb/Checklist";
import { SignaturePad } from "@/components/darb/SignaturePad";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { db, uploadFile, useRows, type Row } from "@/lib/db";
import { useAuth } from "@/lib/auth";
import { enqueue, flushOutbox, readOutbox, removeOp, type OutboxOp } from "@/lib/outbox";
import { errMsg, EVENT_LABELS, fmtDateTime, fmtNum, fmtTime } from "@/lib/format";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/driver")({
  head: () => ({
    meta: [
      { title: "تطبيق السائق — دَرب" },
      { name: "description", content: "رحلة السائق الحالية والفحص وتحديث المحطات والمصروفات وإثبات التسليم." },
      { property: "og:title", content: "تطبيق السائق — دَرب" },
      { property: "og:description", content: "الرحلة الحالية والفحص وإثبات التسليم." },
    ],
  }),
  component: DriverApp,
});

type Tab = "home" | "inspect" | "trip" | "pod";
const STEPS = ["arrived_pickup", "loading_end", "departed", "arrived_delivery", "unloading_end", "delivered"];
const NEXT_EVENT: Record<string, string> = {
  pending: "arrived_pickup", arrived_pickup: "loading_start", loading_start: "loading_end", loading_end: "departed",
  departed: "arrived_delivery", fuel_stop: "arrived_delivery", rest_stop: "arrived_delivery", arrived_delivery: "unloading_start", unloading_start: "unloading_end",
};
const CATS = ["وجبات", "رسوم ميزان", "رسوم طرق", "مبيت", "إصلاح طارئ", "غسيل", "أخرى"];

function getPos(): Promise<{ lat: number; lng: number } | null> {
  return new Promise((res) => {
    if (!navigator.geolocation) return res(null);
    navigator.geolocation.getCurrentPosition((p) => res({ lat: p.coords.latitude, lng: p.coords.longitude }), () => res(null), { timeout: 6000, maximumAge: 60000 });
  });
}

/** Sends the phone location (max once per 45s) while a trip is in progress. */
function LiveGps({ tripId }: { tripId: string }) {
  const [state, setState] = useState<"on" | "denied" | "off">("off");
  useEffect(() => {
    if (!navigator.geolocation) return;
    let last = 0;
    const id = navigator.geolocation.watchPosition(
      (p) => {
        setState("on");
        if (Date.now() - last < 45000 || !navigator.onLine) return;
        last = Date.now();
        void db.rpc("driver_report_location", {
          p_trip_id: tripId, p_lat: p.coords.latitude, p_lng: p.coords.longitude,
          p_speed: p.coords.speed != null ? Math.round(p.coords.speed * 3.6) : null,
          p_event_time: new Date(p.timestamp).toISOString(), p_reading_id: `phone-${tripId}-${p.timestamp}`,
        });
      },
      (e) => setState(e.code === 1 ? "denied" : "off"),
      { enableHighAccuracy: true, maximumAge: 30000, timeout: 20000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, [tripId]);
  return (
    <div className={cn("px-4 py-1.5 text-center text-xs", state === "on" ? "bg-success-soft text-success" : "bg-warning-soft text-warning")}>
      {state === "on" ? "📍 يتم إرسال موقعك أثناء الرحلة" : state === "denied" ? "فعّل إذن الموقع لتتبع الرحلة" : "جارٍ تحديد الموقع…"}
    </div>
  );
}

function DriverApp() {
  const auth = useAuth();
  const nav = useNavigate();
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>("home");
  const [online, setOnline] = useState(true);
  const [outbox, setOutbox] = useState<OutboxOp[]>([]);

  useEffect(() => {
    if (!auth.ready) return;
    if (!auth.session) void nav({ to: "/login" });
  }, [auth.ready, auth.session, nav]);

  const sync = useCallback(async () => {
    const n = await flushOutbox();
    setOutbox(readOutbox());
    if (n) { toast.success(`تمت مزامنة ${n} عملية`); void qc.invalidateQueries(); }
  }, [qc]);

  useEffect(() => {
    setOnline(navigator.onLine);
    setOutbox(readOutbox());
    const on = () => { setOnline(true); void sync(); };
    const off = () => setOnline(false);
    const ch = () => setOutbox(readOutbox());
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    window.addEventListener("darb-outbox", ch);
    void sync();
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); window.removeEventListener("darb-outbox", ch); };
  }, [sync]);

  const trips = useRows(["driver_my_trips"], () => db.rpc("driver_my_trips"), !!auth.driverId);
  const me = useRows(["drivers", "me"], () => db.from("drivers").select("*").eq("id", auth.driverId), !!auth.driverId);
  const custody = useRows(["custody", "me"], () => db.from("custody").select("*, asset:assets(code)").eq("driver_id", auth.driverId).is("closed_at", null), !!auth.driverId);

  if (!auth.ready || !auth.session) return <div className="flex min-h-screen items-center justify-center"><Loader2 className="animate-spin" /></div>;

  if (!auth.driverId)
    return (
      <div dir="rtl" className="flex min-h-screen items-center justify-center p-6">
        {auth.viewAs && <div className="fixed top-2 left-2 z-50"><Button size="sm" variant="outline" onClick={() => { auth.setViewAs(null); void nav({ to: "/" }); }}>رجوع لـ Super Admin</Button></div>}
        <div className="panel max-w-sm p-8 text-center">
          {auth.viewAs && <p className="mb-3 text-xs text-gold">معاينة شاشة السائق — حسابك غير مرتبط بسائق، فتظهر الشاشة بدون رحلات.</p>}
          <Logo className="mb-4 justify-center" />
          <p className="text-sm text-muted-foreground">حسابك غير مرتبط بملف سائق. اطلب من مالك الحساب إرسال دعوة سائق لبريدك.</p>
          {auth.isStaff && <Button className="mt-4" onClick={() => void nav({ to: "/" })}>لوحة الإدارة</Button>}
          <Button variant="outline" className="mt-4 mr-2" onClick={() => void auth.signOut()}><LogOut /> خروج</Button>
        </div>
      </div>
    );

  const list = trips.data ?? [];
  const current = list.find((t) => t.status === "in_progress") ?? list.find((t) => ["planned", "ready"].includes(t.status));
  const d = me.data?.[0];

  return (
    <div dir="rtl" className="mx-auto flex min-h-screen max-w-md flex-col bg-background pb-20 animate-in fade-in duration-500">
      {auth.viewAs && <div className="fixed top-2 left-2 z-50"><Button size="sm" variant="outline" onClick={() => { auth.setViewAs(null); void nav({ to: "/" }); }}>رجوع لـ Super Admin</Button></div>}
      {current?.status === "in_progress" && <LiveGps tripId={current.id} />}
      <header className="flex items-center justify-between bg-primary px-4 py-3 text-primary-foreground">
        <Logo light className="scale-90" />
        <div className="flex items-center gap-3 text-xs">
          <span className={cn("flex items-center gap-1", online ? "text-success-soft" : "text-warning")}>
            {online ? <span className="size-2 rounded-full bg-success" /> : <CloudOff className="size-4" />}
            {online ? "متصل" : "غير متصل"}
          </span>
          <Bell className="size-5" />
          <button onClick={() => void auth.signOut()} aria-label="خروج"><LogOut className="size-5" /></button>
        </div>
      </header>

      <div className="flex items-center gap-3 border-b bg-card px-4 py-3">
        <div className="flex size-11 items-center justify-center rounded-full border-2 border-gold"><User className="size-5 text-primary" /></div>
        <div>
          <div className="font-bold text-primary">مرحبًا، {d?.full_name ?? auth.fullName}</div>
          <div className="num text-xs text-muted-foreground">سائق • {d?.code}</div>
        </div>
      </div>

      {outbox.length > 0 && (
        <div className="mx-4 mt-3 rounded-lg border border-warning/40 bg-warning-soft p-3 text-xs">
          <div className="flex items-center justify-between">
            <b>{outbox.filter((o) => o.status === "pending").length} عملية بانتظار الإرسال</b>
            <Button size="sm" variant="outline" onClick={() => void sync()}><RefreshCw /> إعادة الإرسال</Button>
          </div>
          {outbox.filter((o) => o.status === "rejected").map((o) => (
            <div key={o.id} className="mt-2 flex items-center justify-between text-danger">
              <span>مرفوض: {o.error}</span>
              <button className="underline" onClick={() => removeOp(o.id)}>حذف</button>
            </div>
          ))}
        </div>
      )}

      <main className="flex-1 space-y-4 p-4">
        {trips.isLoading ? <Loading /> : !current ? (
          <div className="panel"><Empty text="لا توجد رحلة مكلّف بها حاليًا." /></div>
        ) : tab === "home" ? (
          <HomeView t={current} custody={custody.data ?? []} online={online} go={setTab} />
        ) : tab === "inspect" ? (
          <InspectView t={current} driverId={auth.driverId} done={() => setTab("home")} />
        ) : tab === "trip" ? (
          <TripView t={current} driverId={auth.driverId} online={online} />
        ) : (
          <PodView t={current} uid={auth.session.user.id} done={() => setTab("home")} />
        )}
        {tab === "home" && list.filter((t) => t.id !== current?.id).length > 0 && (
          <div className="panel p-4">
            <h3 className="mb-2 font-bold text-primary">رحلاتي الأخرى</h3>
            {list.filter((t) => t.id !== current?.id).slice(0, 5).map((t) => (
              <div key={t.id} className="flex justify-between border-t py-2 text-sm"><span className="num">{t.number}</span><span>{t.origin_city} ← {t.dest_city}</span></div>
            ))}
          </div>
        )}
      </main>

      <nav className="fixed right-0 bottom-0 left-0 z-20 mx-auto grid max-w-md grid-cols-4 border-t bg-card">
        {([["home", "الرئيسية", Home], ["inspect", "الفحص", ClipboardCheck], ["trip", "التنفيذ", RouteIcon], ["pod", "التسليم", PackageCheck]] as const).map(([k, l, I]) => (
          <button key={k} onClick={() => setTab(k)} className={cn("flex flex-col items-center gap-1 py-2.5 text-xs", tab === k ? "rounded-t-xl bg-gold-soft font-bold text-primary" : "text-muted-foreground")}>
            <I className="size-5" />{l}
          </button>
        ))}
      </nav>
    </div>
  );
}

function Stepper({ stage }: { stage: string }) {
  const labels = ["الوصول للتحميل", "تم التحميل", "في الطريق", "الوصول", "التفريغ", "تم التسليم"];
  const idx = Math.max(-1, STEPS.findIndex((s) => s === stage), ...["loading_start"].includes(stage) ? [0] : [], ...["fuel_stop", "rest_stop"].includes(stage) ? [2] : [], ...["unloading_start"].includes(stage) ? [3] : []);
  return (
    <div className="flex items-start justify-between">
      {labels.map((l, i) => (
        <div key={l} className="flex flex-1 flex-col items-center text-center text-[10px]">
          <div className={cn("mb-1 flex size-6 items-center justify-center rounded-full border-2", i <= idx ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card")}>
            {i <= idx && <Check className="size-3" />}
          </div>
          <span className={cn(i <= idx ? "font-semibold text-primary" : "text-muted-foreground")}>{l}</span>
        </div>
      ))}
    </div>
  );
}

function HomeView({ t, custody, online, go }: { t: Row; custody: Row[]; online: boolean; go: (t: Tab) => void }) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const next = NEXT_EVENT[t.stage] ?? null;
  async function advance() {
    if (!next) return;
    setBusy(true);
    const pos = await getPos();
    const payload = { p_trip_id: t.id, p_event_type: next, p_lat: pos?.lat ?? null, p_lng: pos?.lng ?? null, p_location: null, p_notes: null, p_client_event_id: crypto.randomUUID(), p_occurred_at: new Date().toISOString() };
    if (!online) {
      enqueue({ id: payload.p_client_event_id, kind: "event", payload });
      toast.info("لا يوجد اتصال — حُفظ الحدث وسيُرسل عند الاتصال");
    } else {
      const { error } = await db.rpc("record_trip_event", payload);
      if (error) toast.error(errMsg(error)); else { toast.success(`تم: ${EVENT_LABELS[next]}`); void qc.invalidateQueries(); }
    }
    setBusy(false);
  }
  const unack = custody.filter((c) => !c.acknowledged);
  return (
    <>
      {unack.map((c) => (
        <div key={c.id} className="panel flex items-center justify-between p-3 text-sm">
          <span>عهدة جديدة: <b className="num">{c.asset?.code}</b></span>
          <Button size="sm" onClick={async () => { const { error } = await db.from("custody").update({ acknowledged: true }).eq("id", c.id); if (error) toast.error(errMsg(error)); else { toast.success("تم الإقرار باستلام العهدة"); void qc.invalidateQueries(); } }}>إقرار الاستلام</Button>
        </div>
      ))}
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-lg font-bold text-primary"><RouteIcon className="size-5" /> الرحلة الحالية</h2>
        <Badge tone={t.status === "in_progress" ? "success" : "info"}>{t.status === "in_progress" ? "قيد التنفيذ" : "مخططة"}</Badge>
      </div>
      <div className="panel space-y-4 p-4">
        <span className="num rounded-md bg-gold-soft px-3 py-1 text-sm font-bold text-primary">{t.number}</span>
        <div className="flex items-center justify-between">
          <div><div className="flex items-center gap-1 text-xl font-bold text-primary"><MapPin className="size-5 text-gold" />{t.origin_city}</div><div className="text-xs text-muted-foreground">{t.pickup_name ?? "محطة التحميل"}</div></div>
          <div className="text-center text-xs text-muted-foreground"><div className="num">≈ {fmtNum(t.distance_km)} كم</div><div className="h-0.5 w-16 bg-gold" /><div className="num">{fmtTime(t.planned_end)}</div></div>
          <div className="text-left"><div className="flex items-center gap-1 text-xl font-bold text-primary">{t.dest_city}<MapPin className="size-5 text-danger" /></div><div className="text-xs text-muted-foreground">{t.delivery_name ?? "محطة التسليم"}</div></div>
        </div>
        <Stepper stage={t.stage} />
        {t.exception && <Badge tone="danger">{EVENT_LABELS[t.exception]}</Badge>}
        <div className="grid grid-cols-2 gap-2">
          {next ? (
            <Button className="h-12" disabled={busy} onClick={() => void advance()}>{busy ? <Loader2 className="animate-spin" /> : <Check />} {EVENT_LABELS[next]}</Button>
          ) : t.stage === "unloading_end" ? (
            <Button className="h-12" onClick={() => go("pod")}><PackageCheck /> إثبات التسليم</Button>
          ) : <span />}
          <Button variant="outline" className="h-12" onClick={() => go("trip")}><AlertTriangle /> بلاغ / مصروف</Button>
        </div>
        {t.stage === "pending" && <Button variant="gold" className="h-11 w-full" onClick={() => go("inspect")}><ClipboardCheck /> فحص ما قبل الانطلاق</Button>}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="panel p-3 text-sm">
          <h3 className="mb-2 flex items-center gap-1 font-bold text-primary"><Truck className="size-4" /> المركبة</h3>
          <div className="flex justify-between"><span className="text-muted-foreground">الرأس</span><b className="num">{t.tractor_code ?? "—"}</b></div>
          <div className="flex justify-between"><span className="text-muted-foreground">المقطورة</span><b className="num">{t.trailer_code ?? "—"}</b></div>
          <div className="flex justify-between"><span className="text-muted-foreground">الحمولة</span><b>{t.cargo_type ?? "—"}</b></div>
          <div className="flex justify-between"><span className="text-muted-foreground">الكمية</span><b className="num">{fmtNum(t.quantity)} {t.unit}</b></div>
        </div>
        <div className="panel p-3 text-sm">
          <h3 className="mb-2 font-bold text-primary">التسليم</h3>
          <div className="flex justify-between"><span className="text-muted-foreground">الأمر</span><b className="num">{t.order_number ?? "—"}</b></div>
          <div className="flex justify-between"><span className="text-muted-foreground">المستلم</span><b>{t.consignee ?? t.customer_name ?? "—"}</b></div>
          <div className="text-xs text-muted-foreground">{t.delivery_instructions ?? ""}</div>
        </div>
      </div>
    </>
  );
}

function InspectView({ t, driverId, done }: { t: Row; driverId: string; done: () => void }) {
  const qc = useQueryClient();
  const [assetId, setAssetId] = useState<string>(t.tractor_id);
  const [answers, setAnswers] = useState<CheckAnswer[]>(freshChecklist());
  const [busy, setBusy] = useState(false);
  async function save() {
    if (answers.some((a) => a.result === "fail" && !a.reason)) return void toast.error("اذكر سبب كل بند غير سليم");
    setBusy(true);
    const { error } = await db.from("inspections").insert({ asset_id: assetId, driver_id: driverId, trip_id: t.id, kind: "pre_trip", items: answers });
    setBusy(false);
    if (error) return void toast.error(errMsg(error));
    const crit = answers.some((a) => a.result === "fail" && a.severity === "critical");
    if (crit) toast.error("عيب حرج — لا يمكن الانطلاق. أُبلغ فريق الصيانة.");
    else toast.success("تم حفظ الفحص");
    void qc.invalidateQueries();
    done();
  }
  return (
    <div className="panel space-y-3 p-4">
      <h2 className="font-bold text-primary">فحص واستلام المركبة</h2>
      <div className="flex gap-2">
        {[[t.tractor_id, t.tractor_code], [t.trailer_id, t.trailer_code]].filter(([id]) => id).map(([id, code]) => (
          <button key={id} onClick={() => { setAssetId(id); setAnswers(freshChecklist()); }} className={cn("num flex-1 rounded-lg border px-3 py-2 text-sm font-semibold", assetId === id ? "border-gold bg-gold-soft" : "bg-card")}>{code}</button>
        ))}
      </div>
      <Checklist value={answers} onChange={setAnswers} />
      <p className="text-xs text-muted-foreground">التأكيد إقرار داخلي مسجل، وليس توثيقًا رسميًا.</p>
      <Button variant="gold" className="h-11 w-full" disabled={busy} onClick={() => void save()}>{busy && <Loader2 className="animate-spin" />} حفظ الفحص والإقرار</Button>
    </div>
  );
}

function TripView({ t, driverId, online }: { t: Row; driverId: string; online: boolean }) {
  const qc = useQueryClient();
  const events = useRows(["trip_events", t.id], () => db.from("trip_events").select("*").eq("trip_id", t.id).order("occurred_at", { ascending: false }));
  const [cat, setCat] = useState(CATS[0]!);
  const [amt, setAmt] = useState("");
  const [desc, setDesc] = useState("");
  const [receipt, setReceipt] = useState<File | null>(null);
  const [liters, setLiters] = useState("");
  const [price, setPrice] = useState("1.66");
  const [odo, setOdo] = useState("");
  const [issue, setIssue] = useState("");
  const [busy, setBusy] = useState(false);

  async function quickEvent(type: string, notes?: string) {
    const pos = await getPos();
    const payload = { p_trip_id: t.id, p_event_type: type, p_lat: pos?.lat ?? null, p_lng: pos?.lng ?? null, p_location: null, p_notes: notes ?? null, p_client_event_id: crypto.randomUUID(), p_occurred_at: new Date().toISOString() };
    if (!online) { enqueue({ id: payload.p_client_event_id, kind: "event", payload }); return void toast.info("حُفظ وسيُرسل عند الاتصال"); }
    const { error } = await db.rpc("record_trip_event", payload);
    if (error) return void toast.error(errMsg(error));
    toast.success(EVENT_LABELS[type]);
    void qc.invalidateQueries();
  }
  async function addExpense() {
    if (!Number(amt)) return void toast.error("أدخل المبلغ");
    setBusy(true);
    try {
      const id = crypto.randomUUID();
      const payload: Row = { trip_id: t.id, driver_id: driverId, category: cat, amount: Number(amt), description: desc || null, status: "pending", client_event_id: id, spent_at: new Date().toISOString() };
      if (!online) { enqueue({ id, kind: "expense", payload }); toast.info("حُفظ المصروف وسيُرسل عند الاتصال (الإيصال يُرفق لاحقًا)"); }
      else {
        if (receipt) payload["receipt_path"] = await uploadFile(receipt, "receipts");
        const { error } = await db.from("expenses").insert(payload);
        if (error) throw error;
        toast.success("أُرسل المصروف للمراجعة");
      }
      setAmt(""); setDesc(""); setReceipt(null);
      void qc.invalidateQueries();
    } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  }
  async function addFuel() {
    const l = Number(liters), p = Number(price);
    if (!l || !p) return void toast.error("أدخل اللترات والسعر");
    const id = crypto.randomUUID();
    const payload = { asset_id: t.tractor_id, driver_id: driverId, trip_id: t.id, liters: l, unit_price: p, amount: Math.round(l * p * 100) / 100, odometer: odo ? Number(odo) : null, status: "pending", client_event_id: id, source: "driver_app" };
    if (!online) { enqueue({ id, kind: "fuel", payload }); return void toast.info("حُفظت التعبئة وسترسل عند الاتصال"); }
    const { error } = await db.from("fuel_entries").insert(payload);
    if (error) return void toast.error(errMsg(error));
    toast.success("سُجلت التعبئة للمراجعة");
    setLiters(""); setOdo("");
    void quickEvent("fuel_stop");
  }
  async function report() {
    if (issue.length < 5) return void toast.error("صف المشكلة");
    const { error } = await db.from("incidents").insert({ trip_id: t.id, driver_id: driverId, asset_id: t.tractor_id, kind: "breakdown", severity: "medium", description: issue, client_event_id: crypto.randomUUID() });
    if (error) return void toast.error(errMsg(error));
    toast.success("أُرسل البلاغ لغرفة العمليات");
    setIssue("");
  }

  return (
    <>
      <div className="panel space-y-2 p-4">
        <h2 className="font-bold text-primary">تحديث المحطات</h2>
        <div className="grid grid-cols-2 gap-2">
          <Button variant="outline" onClick={() => void quickEvent("rest_stop")}>استراحة</Button>
          <Button variant="outline" onClick={() => void quickEvent("suspended")}>تعليق الرحلة</Button>
          <Button variant="outline" onClick={() => void quickEvent("breakdown")}>عطل</Button>
          <Button variant="outline" onClick={() => void quickEvent("resumed")}>استئناف</Button>
        </div>
      </div>
      <div className="panel space-y-2 p-4">
        <h2 className="flex items-center gap-1 font-bold text-primary"><Fuel className="size-4" /> تعبئة ديزل</h2>
        <div className="grid grid-cols-3 gap-2">
          <Input type="number" placeholder="لتر" value={liters} onChange={(e) => setLiters(e.target.value)} />
          <Input type="number" placeholder="سعر اللتر" value={price} onChange={(e) => setPrice(e.target.value)} />
          <Input type="number" placeholder="العداد" value={odo} onChange={(e) => setOdo(e.target.value)} />
        </div>
        <div className="num text-xs text-muted-foreground">المبلغ: {fmtNum(Number(liters) * Number(price), 2)} ر.س</div>
        <Button className="w-full" onClick={() => void addFuel()}>تسجيل التعبئة</Button>
      </div>
      <div className="panel space-y-2 p-4">
        <h2 className="flex items-center gap-1 font-bold text-primary"><Coins className="size-4" /> مصروف</h2>
        <div className="grid grid-cols-2 gap-2">
          <select className="h-9 rounded-md border bg-card px-2 text-sm" value={cat} onChange={(e) => setCat(e.target.value)}>{CATS.map((c) => <option key={c}>{c}</option>)}</select>
          <Input type="number" placeholder="المبلغ" value={amt} onChange={(e) => setAmt(e.target.value)} />
        </div>
        <Input placeholder="الوصف" value={desc} onChange={(e) => setDesc(e.target.value)} />
        <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground"><Camera className="size-4" /> {receipt ? receipt.name : "إرفاق صورة الإيصال"}<input type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => setReceipt(e.target.files?.[0] ?? null)} /></label>
        <Button className="w-full" disabled={busy} onClick={() => void addExpense()}>إرسال للمراجعة</Button>
      </div>
      <div className="panel space-y-2 p-4">
        <h2 className="flex items-center gap-1 font-bold text-primary"><AlertTriangle className="size-4" /> إبلاغ عن مشكلة</h2>
        <Textarea placeholder="صف المشكلة…" value={issue} onChange={(e) => setIssue(e.target.value)} />
        <Button variant="destructive" className="w-full" onClick={() => void report()}>إرسال البلاغ</Button>
      </div>
      <div className="panel p-4">
        <h2 className="mb-2 font-bold text-primary">سجل أحداث الرحلة</h2>
        {(events.data ?? []).map((e) => (
          <div key={e.id} className="flex justify-between border-t py-2 text-sm"><span>{EVENT_LABELS[e.event_type] ?? e.event_type}</span><span className="num text-xs text-muted-foreground">{fmtDateTime(e.occurred_at)}</span></div>
        ))}
      </div>
    </>
  );
}

function PodView({ t, uid, done }: { t: Row; uid: string; done: () => void }) {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [qty, setQty] = useState(String(t.quantity ?? ""));
  const [short, setShort] = useState("0");
  const [dmg, setDmg] = useState("0");
  const [notes, setNotes] = useState("");
  const [photos, setPhotos] = useState<File[]>([]);
  const [sig, setSig] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!name) return void toast.error("اسم المستلم مطلوب");
    if (!sig) return void toast.error("توقيع المستلم مطلوب");
    if (!navigator.onLine) return void toast.error("إثبات التسليم يتطلب اتصالًا لرفع الصور والتوقيع. أعد المحاولة عند الاتصال.");
    setBusy(true);
    try {
      const captured = new Date().toISOString();
      const pos = await getPos();
      const paths: string[] = [];
      for (const f of photos) paths.push(await uploadFile(f, `pod/${t.id}`));
      void uid;
      const cid = crypto.randomUUID();
      const { error } = await db.from("pods").insert({
        trip_id: t.id, receiver_name: name, receiver_phone: phone || null, received_at: captured, captured_at: captured,
        qty_delivered: qty ? Number(qty) : null, qty_short: Number(short), qty_damaged: Number(dmg), notes: notes || null,
        signature: sig, photo_paths: paths, lat: pos?.lat ?? null, lng: pos?.lng ?? null, location_source: pos ? "device_gps" : "unavailable", client_event_id: cid,
      });
      if (error) throw error;
      const { error: e2 } = await db.rpc("record_trip_event", { p_trip_id: t.id, p_event_type: "delivered", p_lat: pos?.lat ?? null, p_lng: pos?.lng ?? null, p_client_event_id: `pod-${cid}` });
      if (e2) throw e2;
      toast.success("تم التسليم وإرسال الإثبات");
      void qc.invalidateQueries();
      done();
    } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  }

  if (t.status !== "in_progress") return <div className="panel p-4 text-sm text-muted-foreground">إثبات التسليم متاح أثناء تنفيذ الرحلة فقط.</div>;
  return (
    <div className="panel space-y-3 p-4">
      <h2 className="flex items-center gap-2 font-bold text-primary"><PackageCheck className="size-5" /> إثبات التسليم — {t.number}</h2>
      <div className="grid grid-cols-2 gap-2">
        <div className="col-span-2"><Label className="mb-1 block text-xs">اسم المستلم *</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
        <div className="col-span-2"><Label className="mb-1 block text-xs">جوال المستلم</Label><Input value={phone} onChange={(e) => setPhone(e.target.value)} /></div>
        <div><Label className="mb-1 block text-xs">الكمية المسلّمة ({t.unit})</Label><Input type="number" value={qty} onChange={(e) => setQty(e.target.value)} /></div>
        <div><Label className="mb-1 block text-xs">المطلوب</Label><Input disabled value={fmtNum(t.quantity)} /></div>
        <div><Label className="mb-1 block text-xs">نقص</Label><Input type="number" value={short} onChange={(e) => setShort(e.target.value)} /></div>
        <div><Label className="mb-1 block text-xs">تالف</Label><Input type="number" value={dmg} onChange={(e) => setDmg(e.target.value)} /></div>
      </div>
      <Textarea placeholder="ملاحظات" value={notes} onChange={(e) => setNotes(e.target.value)} />
      <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border-2 border-dashed p-4 text-sm text-muted-foreground">
        <Camera className="size-5" /> {photos.length ? `${photos.length} صورة` : "التقاط صور البضاعة / المستند"}
        <input type="file" accept="image/*" capture="environment" multiple className="hidden" onChange={(e) => setPhotos(Array.from(e.target.files ?? []))} />
      </label>
      <div><Label className="mb-1 block text-xs">توقيع المستلم *</Label><SignaturePad onChange={setSig} /></div>
      <p className="text-xs text-muted-foreground">يُحفظ وقت الالتقاط والإحداثيات ومصدرها. موقع GPS وحده ليس إثبات استلام.</p>
      <Button variant="gold" className="h-12 w-full" disabled={busy} onClick={() => void submit()}>{busy && <Loader2 className="animate-spin" />} تأكيد التسليم</Button>
    </div>
  );
}
