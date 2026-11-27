import { useScreenSearch } from "@/lib/screen-navigation";
import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { ClipboardList, FileText, MapPin, MessageCircle, X } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/darb/AppShell";
import { Badge, Empty, Loading, PageHeader, Panel } from "@/components/darb/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { db, useRows } from "@/lib/db";
import { errMsg, fmtDateTime, fmtNum } from "@/lib/format";
import { flushWa } from "@/lib/wa-flush";
import { waDigits } from "@/lib/wa-links";

const STATUS: Record<string, [string, "info" | "success" | "neutral"]> = { new: ["جديد", "info"], converted: ["تحوّل لأمر نقل", "success"], closed: ["مغلق", "neutral"] };

function CustomerRequests() {
  const qc = useQueryClient();
  const search = useScreenSearch();
  const [status, setStatus] = useState("new");
  const [closing, setClosing] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const rows = useRows(["customer_requests", "all", status], () => db.from("customer_requests")
    .select("*, customer:customers(name,phone), pickup:locations!customer_requests_pickup_location_id_fkey(name,city,lat,lng), delivery:locations!customer_requests_delivery_location_id_fkey(name,city), order:transport_orders(number)")
    .eq("status", status).order("created_at", { ascending: false }).limit(100));
  const reps = useRows(["profiles", "names"], () => db.from("profiles").select("id,full_name,phone"));
  const rep = (id: string) => (reps.data ?? []).find((p) => p.id === id);

  async function close(id: string) {
    if (reason.trim().length < 3) return void toast.error("اكتب سبب الإغلاق ليصل للمندوب");
    const { error } = await db.from("customer_requests").update({ status: "closed", close_reason: reason.trim(), reviewed_at: new Date().toISOString() }).eq("id", id).eq("status", "new");
    if (error) return void toast.error(errMsg(error));
    flushWa();
    toast.success("أُغلق الطلب ووصل السبب للمندوب");
    setClosing(null); setReason("");
    void qc.invalidateQueries({ queryKey: ["customer_requests"] });
  }

  return (
    <>
      <PageHeader title="طلبات العملاء من المناديب" subtitle="ما سجله المناديب في زياراتهم. حوّل الطلب إلى أمر نقل أو أغلقه مع ذكر السبب." icon={<ClipboardList />}
        actions={<div className="flex gap-1">{Object.entries(STATUS).map(([k, [l]]) => <Button key={k} size="sm" variant={status === k ? "default" : "outline"} onClick={() => setStatus(k)}>{l}</Button>)}</div>} />
      <Panel title={`الطلبات — ${STATUS[status]![0]}`} icon={<ClipboardList />}>
        {rows.isLoading ? <Loading /> : rows.error ? <p role="alert" className="text-sm text-danger">{errMsg(rows.error)}</p> : !(rows.data ?? []).length ? <Empty text="لا توجد طلبات هنا" /> : (
          <div className="grid gap-3 lg:grid-cols-2">
            {(rows.data ?? []).filter(r => !search.id || r.id === search.id).map((r) => {
              const p = rep(r.created_by);
              const phone = r.contact_phone ?? r.customer?.phone;
              return (
                <div key={r.id} className="space-y-2 rounded-2xl border p-3 text-sm">
                  <div className="flex items-center justify-between"><span className="num font-bold text-primary">{r.number}</span><Badge tone={STATUS[r.status]?.[1] ?? "neutral"}>{STATUS[r.status]?.[0] ?? r.status}</Badge></div>
                  <div><b>{r.customer?.name}</b> — {r.cargo_type}{r.quantity ? ` • ${fmtNum(r.quantity)} ${r.unit ?? ""}` : ""}{r.weight_kg ? ` • ${fmtNum(r.weight_kg)} كجم` : ""}</div>
                  <div className="flex items-center gap-1 text-xs"><MapPin className="size-3 text-success" /> الاستلام: {r.pickup ? `${r.pickup.name} — ${r.pickup.city}` : "—"}
                    {r.pickup?.lat != null && <a className="text-info underline" href={`https://maps.google.com/?q=${r.pickup.lat},${r.pickup.lng}`} target="_blank" rel="noreferrer">الخريطة</a>}</div>
                  <div className="flex items-center gap-1 text-xs"><MapPin className="size-3 text-danger" /> التسليم: {r.delivery ? `${r.delivery.name} — ${r.delivery.city}` : r.delivery_city ?? "غير محدد"}</div>
                  {r.pickup_from && <div className="text-xs">موعد الاستلام المطلوب: <span className="num">{fmtDateTime(r.pickup_from)}</span></div>}
                  {r.notes && <p className="rounded-md bg-gold-soft p-2 text-xs">{r.notes}</p>}
                  <div className="text-xs text-muted-foreground">المندوب: {p?.full_name ?? "—"} • {fmtDateTime(r.created_at)}</div>
                  <div className="flex flex-wrap gap-2">
                    {phone && <Button size="sm" variant="outline" asChild><a href={`https://wa.me/${waDigits(phone)}`} target="_blank" rel="noreferrer"><MessageCircle /> واتساب العميل</a></Button>}
                    {p?.phone && <Button size="sm" variant="outline" asChild><a href={`https://wa.me/${waDigits(p.phone)}`} target="_blank" rel="noreferrer"><MessageCircle /> واتساب المندوب</a></Button>}
                    {r.status === "new" && <Button size="sm" asChild><Link to="/orders/new" search={{ request: r.id }}><FileText /> تحويل لأمر نقل</Link></Button>}
                    {r.status === "new" && closing !== r.id && <Button size="sm" variant="ghost" onClick={() => { setClosing(r.id); setReason(""); }}><X /> إغلاق</Button>}
                    {r.status === "converted" && r.order?.number && <span className="num text-xs text-success">أمر النقل {r.order.number}</span>}
                  </div>
                  {closing === r.id && <div className="flex gap-2"><Input placeholder="سبب الإغلاق" value={reason} onChange={(e) => setReason(e.target.value)} /><Button size="sm" variant="destructive" onClick={() => void close(r.id)}>تأكيد</Button><Button size="sm" variant="ghost" onClick={() => setClosing(null)}>رجوع</Button></div>}
                  {r.status === "closed" && r.close_reason && <div className="text-xs text-danger">سبب الإغلاق: {r.close_reason}</div>}
                </div>
              );
            })}
          </div>
        )}
      </Panel>
    </>
  );
}

export default () => <AppShell><CustomerRequests /></AppShell>;
