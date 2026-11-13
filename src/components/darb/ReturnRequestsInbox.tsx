import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { Check, CornerDownLeft, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { db, useRows, type Row } from "@/lib/db";
import { errMsg, fmtDateTime } from "@/lib/format";
import { flushWa } from "@/lib/wa-flush";

export const CARGO_SIZE: Record<string, string> = { small: "صغير", medium: "متوسط", large: "كبير" };
export const LOAD_LEVEL: Record<string, string> = { empty: "فارغة", partial: "نصف ممتلئة", full: "ممتلئة" };

/** Read-only summary of what the driver is returning with. */
export function ReturnRequestDetails({ r, trip }: { r: Row; trip?: Row }) {
  return (
    <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
      <dt className="text-muted-foreground">الموعد</dt><dd className="num">{fmtDateTime(r.depart_at)}</dd>
      <dt className="text-muted-foreground">يرجع من</dt><dd>{r.pickup_place || trip?.dest_city || "—"}</dd>
      <dt className="text-muted-foreground">الحمولة</dt><dd>{r.has_cargo ? r.cargo_description : "راجع فارغ"}</dd>
      {r.has_cargo && <><dt className="text-muted-foreground">الحجم</dt><dd>{CARGO_SIZE[r.cargo_size] ?? "—"}</dd>
        <dt className="text-muted-foreground">الامتلاء</dt><dd>{LOAD_LEVEL[r.load_level] ?? "—"}</dd></>}
      {r.notes && <><dt className="text-muted-foreground">ملاحظات</dt><dd>{r.notes}</dd></>}
    </dl>
  );
}

/** Approve (creates the return trip in one click) or reject with a reason sent to the driver. */
export function ReturnRequestActions({ r }: { r: Row }) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  async function approve() {
    setBusy(true);
    const { error } = await db.rpc("approve_return_request", { p_request_id: r.id });
    setBusy(false);
    if (error) return void toast.error(errMsg(error));
    toast.success("تمت الموافقة وأُنشئت رحلة الرجوع وأُبلغ السائق"); flushWa(); void qc.invalidateQueries();
  }
  async function reject() {
    if (!reason.trim()) return void toast.error("اكتب سبب الرفض");
    setBusy(true);
    const { error } = await db.rpc("reject_return_request", { p_request_id: r.id, p_reason: reason.trim() });
    setBusy(false);
    if (error) return void toast.error(errMsg(error));
    toast.success("رُفض الطلب وأُرسل السبب للسائق"); flushWa(); setRejecting(false); setReason(""); void qc.invalidateQueries();
  }
  return (
    <>
      <div className="flex gap-2">
        <Button size="sm" disabled={busy} onClick={() => void approve()}><Check /> موافقة</Button>
        <Button size="sm" variant="outline" disabled={busy} onClick={() => setRejecting(true)}><X /> رفض</Button>
      </div>
      <Dialog open={rejecting} onOpenChange={setRejecting}>
        <DialogContent dir="rtl">
          <DialogHeader><DialogTitle>سبب رفض طلب الرجوع</DialogTitle></DialogHeader>
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} placeholder="سيصل هذا السبب للسائق على واتساب" />
          <Button variant="destructive" disabled={busy} onClick={() => void reject()}>تأكيد الرفض</Button>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** Dashboard inbox: pending driver return requests, approve/reject without leaving the page. */
export function ReturnRequestsInbox() {
  const q = useRows(["return_requests", "pending"], () =>
    db.from("return_requests").select("*, trip:trips!return_requests_trip_id_fkey(id,number,origin_city,dest_city), driver:drivers(full_name)").eq("status", "pending").order("created_at"));
  const rows = q.data ?? [];
  if (!rows.length) return null;
  return (
    <section className="panel space-y-3 border-gold p-4">
      <h2 className="flex items-center gap-2 font-bold text-primary"><CornerDownLeft className="size-5 text-gold" /> طلبات رحلات رجوع بانتظار موافقتك ({rows.length})</h2>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {rows.map((r) => (
          <div key={r.id} className="space-y-2 rounded-lg border bg-background/60 p-3">
            <p className="text-sm">السائق <b>{r.driver?.full_name ?? "—"}</b> طلب رحلة رجوع للرحلة{" "}
              <Link to="/trips/$id" params={{ id: r.trip?.id }} className="num font-semibold text-gold underline">{r.trip?.number}</Link></p>
            <ReturnRequestDetails r={r} trip={r.trip} />
            <ReturnRequestActions r={r} />
          </div>
        ))}
      </div>
    </section>
  );
}
