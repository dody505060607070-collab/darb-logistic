import { useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { Check, ClipboardCheck, MessageCircle, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { db, useRows, type Row } from "@/lib/db";
import { useAuth } from "@/lib/auth";
import { errMsg, fmtDateTime, fmtSAR } from "@/lib/format";
import { flushWa } from "@/lib/wa-flush";
import { ReturnRequestActions, ReturnRequestDetails } from "./ReturnRequestsInbox";

type Res = { error: unknown } | PromiseLike<{ error: unknown }>;

/** Approve / reject buttons; reject (and optional approve note) asks for a reason that reaches the sender. */
function Decide({ approve, reject, approveLabel = "موافقة", rejectLabel = "رفض", needReason = true }: {
  approve: () => Res; reject?: (reason: string) => Res; approveLabel?: string; rejectLabel?: string; needReason?: boolean;
}) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  async function run(fn: () => Res, ok: string) {
    setBusy(true);
    const { error } = await fn();
    setBusy(false);
    if (error) return void toast.error(errMsg(error));
    toast.success(ok); flushWa(); setOpen(false); setReason(""); void qc.invalidateQueries();
  }
  return (
    <>
      <div className="flex gap-2">
        <Button size="sm" disabled={busy} onClick={() => void run(approve, "تم الاعتماد وأُبلغ صاحب الطلب")}><Check /> {approveLabel}</Button>
        {reject && <Button size="sm" variant="outline" disabled={busy} onClick={() => setOpen(true)}><X /> {rejectLabel}</Button>}
      </div>
      {reject && <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent dir="rtl">
          <DialogHeader><DialogTitle>سبب الرفض</DialogTitle></DialogHeader>
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} placeholder="سيصل السبب لصاحب الطلب على واتساب" />
          <Button variant="destructive" disabled={busy} onClick={() => { if (needReason && !reason.trim()) return void toast.error("اكتب سبب الرفض"); void run(() => reject(reason.trim()), "رُفض الطلب وأُرسل السبب"); }}>تأكيد الرفض</Button>
        </DialogContent>
      </Dialog>}
    </>
  );
}

function Card({ who, title, at, children, actions }: { who?: string; title: ReactNode; at?: string; children?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="space-y-2 rounded-lg border bg-background/60 p-3 text-sm">
      <div className="flex items-start justify-between gap-2"><p>{who && <b>{who} — </b>}{title}</p>{at && <span className="num shrink-0 text-xs text-muted-foreground">{fmtDateTime(at)}</span>}</div>
      {children && <div className="text-xs">{children}</div>}
      {actions}
    </div>
  );
}

function Section({ title, rows, render }: { title: string; rows: Row[] | undefined; render: (r: Row) => ReactNode }) {
  if (!rows?.length) return null;
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-bold">{title} <span className="num text-gold">({rows.length})</span></h3>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{rows.map((r) => <div key={r.id}>{render(r)}</div>)}</div>
    </div>
  );
}

function Line({ k, v }: { k: string; v: ReactNode }) {
  return v ? <div><span className="text-muted-foreground">{k}: </span>{v}</div> : null;
}

/** "Awaiting your approval" box — each section only loads for the roles that review it. */
export function ApprovalCenter() {
  const { can } = useAuth();
  const ops = can("ops_manager", "dispatcher");
  const fin = can("accountant");
  const mnt = can("ops_manager", "maintenance");
  const fleet = can("ops_manager", "fleet_supervisor");

  const returns = useRows(["return_requests", "pending"], () => db.from("return_requests").select("*, trip:trips!return_requests_trip_id_fkey(id,number,origin_city,dest_city), driver:drivers(full_name)").eq("status", "pending").order("created_at"), ops);
  const delays = useRows(["delay_notices", "pending"], () => db.from("delay_notices").select("*, trip:trips(id,number,origin_city,dest_city), driver:drivers(full_name)").eq("status", "pending").order("created_at"), ops);
  const expenses = useRows(["expenses", "pending-inbox"], () => db.from("expenses").select("*, driver:drivers(full_name), trip:trips(number)").eq("status", "pending").order("spent_at"), fin);
  const fuel = useRows(["fuel_entries", "pending-inbox"], () => db.from("fuel_entries").select("*, driver:drivers(full_name), asset:assets(code)").eq("status", "pending").order("filled_at"), fin);
  const wallet = useRows(["wallet", "pending-inbox"], () => db.from("maintenance_wallet_entries").select("*, employee:profiles!maintenance_wallet_entries_employee_id_fkey(full_name)").eq("status", "pending").order("occurred_at"), fin);
  const orders = useRows(["work_orders", "review-inbox"], () => db.from("work_orders").select("*, asset:assets(code)").in("workflow_status", ["review", "additional_review"]).order("opened_at"), mnt);
  const inspections = useRows(["inspections", "critical-inbox"], () => db.from("inspections").select("*, asset:assets(code), driver:drivers(full_name)").eq("has_critical", true).eq("resolved", false).order("created_at"), fleet);
  const custody = useRows(["custody", "unack-inbox"], () => db.from("custody").select("*, asset:assets(code), driver:drivers(full_name)").is("closed_at", null).eq("acknowledged", false).order("opened_at"), fleet);

  const total = [returns, delays, expenses, fuel, wallet, orders, inspections, custody].reduce((s, q) => s + (q.data?.length ?? 0), 0);
  if (!total) return null;

  return (
    <section className="panel space-y-4 border-gold p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-bold text-primary"><ClipboardCheck className="size-5 text-gold" /> بانتظار موافقتك <span className="num">({total})</span></h2>
        <Link to="/chat" className="flex items-center gap-1 text-xs font-semibold text-gold"><MessageCircle className="size-4" /> المحادثة</Link>
      </div>

      <Section title="طلبات رحلات الرجوع" rows={returns.data} render={(r) => (
        <Card who={r.driver?.full_name} title={<>طلب رجوع للرحلة <Link to="/trips/$id" params={{ id: r.trip?.id }} className="num text-gold underline">{r.trip?.number}</Link></>} at={r.created_at}
          actions={<ReturnRequestActions r={r} />}><ReturnRequestDetails r={r} trip={r.trip} /></Card>)} />

      <Section title="إشعارات تأخير" rows={delays.data} render={(r) => (
        <Card who={r.driver?.full_name} title={<>تأخير في الرحلة <Link to="/trips/$id" params={{ id: r.trip?.id }} className="num text-gold underline">{r.trip?.number}</Link></>} at={r.created_at}
          actions={<Decide approveLabel="تم الاستلام" approve={() => db.rpc("acknowledge_delay", { p_id: r.id, p_reply: "" })} />}>
          <Line k="السبب" v={r.reason} /><Line k="الوصول المتوقع" v={<span className="num">{fmtDateTime(r.expected_at)}</span>} />
        </Card>)} />

      <Section title="مصروفات السائقين" rows={expenses.data} render={(r) => (
        <Card who={r.driver?.full_name} title={<>{r.category} — <b className="num">{fmtSAR(r.amount)}</b></>} at={r.spent_at}
          actions={<Decide approve={() => db.rpc("review_expense", { p_id: r.id, p_approve: true, p_reason: "" })} reject={(why) => db.rpc("review_expense", { p_id: r.id, p_approve: false, p_reason: why })} />}>
          <Line k="الرحلة" v={r.trip?.number} /><Line k="الوصف" v={r.description} /><Line k="الدفع" v={r.payment_method} /><Line k="الإيصال" v={r.receipt_path ? "مرفق ✅" : "بدون إيصال"} />
        </Card>)} />

      <Section title="تعبئات الديزل" rows={fuel.data} render={(r) => (
        <Card who={r.driver?.full_name} title={<><span className="num">{r.liters}</span> لتر — <b className="num">{fmtSAR(r.amount)}</b></>} at={r.filled_at}
          actions={<Decide approve={() => db.from("fuel_entries").update({ status: "approved" }).eq("id", r.id)} reject={() => db.from("fuel_entries").update({ status: "rejected" }).eq("id", r.id)} needReason={false} />}>
          <Line k="الشاحنة" v={r.asset?.code} /><Line k="المحطة" v={r.station} /><Line k="العداد" v={r.odometer && <span className="num">{r.odometer} كم</span>} /><Line k="الإيصال" v={r.receipt_path ? "مرفق ✅" : "بدون إيصال"} />
        </Card>)} />

      <Section title="حركات عهدة الصيانة" rows={wallet.data} render={(r) => (
        <Card who={r.employee?.full_name} title={<>{r.kind === "disbursement" ? "صرف عهدة" : "مصروف صيانة"} — <b className="num">{fmtSAR(r.amount)}</b></>} at={r.occurred_at}
          actions={<Decide approve={() => db.rpc("wallet_review", { p_id: r.id, p_approve: true, p_note: null as never })} reject={(why) => db.rpc("wallet_review", { p_id: r.id, p_approve: false, p_note: why })} />}>
          <Line k="الوصف" v={r.description} /><Line k="المورد" v={r.supplier} /><Line k="الإيصال" v={r.receipt_path ? "مرفق ✅" : "بدون إيصال"} />
        </Card>)} />

      <Section title="أوامر صيانة تحتاج قرارًا" rows={orders.data} render={(r) => (
        <Card title={<><span className="num">{r.number}</span> — {r.asset?.code}</>} at={r.opened_at}
          actions={<Link to="/repair-center" className="text-xs font-semibold text-gold underline">افتح للموافقة أو الرفض</Link>}>
          <Line k="العطل" v={r.description} /><Line k="الخطورة" v={r.severity === "critical" ? "حرجة" : r.severity === "high" ? "عالية" : "عادية"} />
          <Line k="التقدير" v={r.estimate && <span className="num">{fmtSAR(r.estimate)}</span>} /><Line k="المرحلة" v={r.workflow_status === "additional_review" ? "تكلفة إضافية" : "طلب جديد"} />
        </Card>)} />

      <Section title="فحوصات بها عيب حرج" rows={inspections.data} render={(r) => (
        <Card who={r.driver?.full_name} title={<>الشاحنة {r.asset?.code}</>} at={r.created_at}
          actions={<Link to="/maintenance" className="text-xs font-semibold text-gold underline">افتح الصيانة</Link>}><Line k="ملاحظات" v={r.notes} /></Card>)} />

      <Section title="عهد بانتظار إقرار السائق باستلامها" rows={custody.data} render={(r) => (
        <Card who={r.driver?.full_name} title={<>الشاحنة {r.asset?.code}</>} at={r.opened_at}
          actions={<Link to="/custody" className="text-xs font-semibold text-gold underline">افتح العهد</Link>}>
          <Line k="المطلوب" v="ينتظر أن يدخل السائق للتطبيق ويضغط «إقرار الاستلام» — وصلته رسالة واتساب" /><Line k="العداد" v={r.odometer_out && <span className="num">{r.odometer_out} كم</span>} /><Line k="الوقود" v={r.fuel_level_out} /><Line k="الأضرار" v={r.damages} />
        </Card>)} />
    </section>
  );
}

const ST: Record<string, string> = { pending: "بانتظار الموافقة", approved: "تمت الموافقة ✅", rejected: "مرفوض ❌", acknowledged: "استلمتها الإدارة ✅" };

/** Driver: delay notice form + "my requests" history with decisions and reasons. */
export function DriverRequests({ trip, driverId, demo }: { trip?: Row; driverId?: string | null; demo?: boolean }) {
  const qc = useQueryClient();
  const on = !demo && !!driverId;
  const exp = useRows(["expenses", "mine", driverId], () => db.from("expenses").select("id,category,amount,status,reject_reason,created_at").eq("driver_id", driverId!).order("created_at", { ascending: false }).limit(5), on);
  const ret = useRows(["return_requests", "mine", driverId], () => db.from("return_requests").select("id,status,reject_reason,created_at,depart_at").eq("driver_id", driverId!).order("created_at", { ascending: false }).limit(5), on);
  const del = useRows(["delay_notices", "mine", driverId], () => db.from("delay_notices").select("id,status,reply,reason,created_at").eq("driver_id", driverId!).order("created_at", { ascending: false }).limit(5), on);
  const [reason, setReason] = useState("");
  const [eta, setEta] = useState("");
  const [busy, setBusy] = useState(false);
  async function sendDelay() {
    if (demo) return void toast.info("معاينة فقط");
    if (!trip) return;
    if (!reason.trim() || !eta) return void toast.error("اكتب السبب وموعد الوصول المتوقع");
    setBusy(true);
    const { error } = await db.rpc("driver_report_delay", { p_trip_id: trip.id, p_reason: reason.trim(), p_expected_at: new Date(eta).toISOString() });
    setBusy(false);
    if (error) return void toast.error(errMsg(error));
    toast.success("أُرسل إشعار التأخير للإدارة"); flushWa(); setReason(""); setEta(""); void qc.invalidateQueries();
  }
  const items = [
    ...(exp.data ?? []).map((r) => ({ id: r.id, at: r.created_at, label: `مصروف ${r.category} ${fmtSAR(r.amount)}`, st: r.status, why: r.reject_reason })),
    ...(ret.data ?? []).map((r) => ({ id: r.id, at: r.created_at, label: "طلب رحلة رجوع", st: r.status, why: r.reject_reason })),
    ...(del.data ?? []).map((r) => ({ id: r.id, at: r.created_at, label: `إشعار تأخير: ${r.reason}`, st: r.status, why: r.reply })),
  ].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 8);
  const quick = ["زحمة مرور", "انتظار عند العميل", "عطل بسيط", "نقطة تفتيش", "طقس"];
  return (
    <>
      {trip && ["planned", "in_progress"].includes(trip.status) && (
        <div className="panel space-y-2 p-4">
          <h2 className="font-bold text-primary">⏱️ هتتأخر؟ بلّغ الإدارة — {trip.number}</h2>
          <div className="flex flex-wrap gap-1">{quick.map((q) => <Button key={q} type="button" size="sm" variant={reason === q ? "default" : "outline"} onClick={() => setReason(q)}>{q}</Button>)}</div>
          <Textarea placeholder="أو اكتب السبب" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} />
          <label className="block text-xs">موعد الوصول المتوقع<input type="datetime-local" className="mt-1 h-9 w-full rounded-md border bg-background px-2" value={eta} onChange={(e) => setEta(e.target.value)} /></label>
          <Button className="w-full" disabled={busy} onClick={() => void sendDelay()}>إرسال إشعار التأخير</Button>
        </div>
      )}
      {items.length > 0 && (
        <div className="panel space-y-2 p-4">
          <h2 className="font-bold text-primary">طلباتي</h2>
          {items.map((i) => (
            <div key={i.id} className="border-b pb-2 text-xs last:border-0">
              <div className="flex justify-between gap-2"><span>{i.label}</span><b>{ST[i.st] ?? i.st}</b></div>
              {i.why && <div className={i.st === "rejected" ? "text-danger" : "text-muted-foreground"}>{i.st === "rejected" ? "السبب" : "رد الإدارة"}: {i.why}</div>}
            </div>
          ))}
        </div>
      )}
    </>
  );
}

/** Workshop / field technician: decisions on my work orders, with the reason. */
export function MyWorkOrderDecisions() {
  const { session } = useAuth() as { session: { user: { id: string } } | null };
  const uid = session?.user.id;
  const q = useRows(["work_orders", "my-decisions", uid], () => db.from("work_orders").select("id,number,workflow_status,approval_note,approved_budget,estimate,asset:assets(code)").or(`requested_by.eq.${uid},assignee_id.eq.${uid}`).in("workflow_status", ["approved", "rejected", "additional_review", "review"]).order("opened_at", { ascending: false }).limit(6), !!uid);
  const rows = q.data ?? [];
  if (!rows.length) return null;
  const L: Record<string, string> = { review: "بانتظار الموافقة", additional_review: "تكلفة إضافية بانتظار الموافقة", approved: "معتمد ✅", rejected: "مرفوض ❌" };
  return (
    <section className="panel mb-4 space-y-2 p-4">
      <div className="flex items-center justify-between"><h2 className="font-bold text-primary">قرارات طلباتي</h2><Link to="/chat" className="flex items-center gap-1 text-xs font-semibold text-gold"><MessageCircle className="size-4" /> المحادثة</Link></div>
      <div className="grid gap-2 md:grid-cols-3">
        {rows.map((r) => (
          <div key={r.id} className="rounded-lg border p-2 text-xs">
            <div className="flex justify-between"><b className="num">{r.number} — {r.asset?.code}</b><span>{L[r.workflow_status]}</span></div>
            {r.workflow_status === "approved" && r.approved_budget && <div>الميزانية: <span className="num">{fmtSAR(r.approved_budget)}</span></div>}
            {r.approval_note && <div className={r.workflow_status === "rejected" ? "text-danger" : "text-muted-foreground"}>{r.workflow_status === "rejected" ? "السبب" : "ملاحظة"}: {r.approval_note}</div>}
          </div>
        ))}
      </div>
    </section>
  );
}
