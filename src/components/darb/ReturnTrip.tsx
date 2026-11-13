import { lazy, Suspense, useMemo, useState } from "react";
import { ClientOnly } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { CornerDownLeft, Save, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { LocationPicker } from "./LocationPicker";
import { db, useRows, type Row } from "@/lib/db";
import { CITY_COORDS, errMsg, fmtDateTime, fromLocalInput, toLocalInput } from "@/lib/format";
import { flushWa } from "@/lib/wa-flush";

const MapView = lazy(() => import("./MapView"));

function km(a?: [number, number], b?: [number, number]) {
  if (!a || !b) return null;
  const r = Math.PI / 180, dLat = (b[0] - a[0]) * r, dLng = (b[1] - a[1]) * r;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * r) * Math.cos(b[0] * r) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * 6371 * Math.asin(Math.sqrt(x)) * 1.25);
}
const pt = (l?: Row) => (l?.lat ? [l.lat, l.lng] as [number, number] : CITY_COORDS[l?.city]);

/** Staff: create the reverse trip (prefilled from the outbound trip) or review a driver's return request. */
export function ReturnTripPanel({ trip }: { trip: Row }) {
  const qc = useQueryClient();
  const locations = useRows(["locations"], () => db.from("locations").select("*").order("name"));
  const requests = useRows(["return_requests", trip.id], () => db.from("return_requests").select("*").eq("trip_id", trip.id).order("created_at", { ascending: false }));
  const children = useRows(["trips", "returns", trip.id], () => db.from("trips").select("id,number,status,planned_start").eq("parent_trip_id", trip.id).neq("status", "cancelled"));
  const [open, setOpen] = useState(false);
  const [reqId, setReqId] = useState<string | null>(null);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [start, setStart] = useState("");
  const [busy, setBusy] = useState(false);
  const locs = locations.data ?? [];
  const a = locs.find((l) => l.id === from), b = locs.find((l) => l.id === to);
  const distance = km(pt(a), pt(b)) ?? (trip.distance_km ? Number(trip.distance_km) : null);
  const durMs = trip.planned_start && trip.planned_end ? new Date(trip.planned_end).getTime() - new Date(trip.planned_start).getTime() : 8 * 3600e3;
  const markers = useMemo(() => [a && pt(a) ? { id: "a", lat: pt(a)![0], lng: pt(a)![1], label: `من: ${a.name}`, color: "green" as const } : null, b && pt(b) ? { id: "b", lat: pt(b)![0], lng: pt(b)![1], label: `إلى: ${b.name}`, color: "red" as const } : null].filter(Boolean) as never[], [a, b]);
  const lines = useMemo(() => (a && b && pt(a) && pt(b) ? [{ id: "r", points: [pt(a)!, pt(b)!], dashed: true }] : []), [a, b]);
  const pending = (requests.data ?? []).find((r) => r.status === "pending");
  const existing = (children.data ?? [])[0];

  function openDialog(r?: Row) {
    setReqId(r?.id ?? null);
    setFrom(trip.dest_location_id ?? "");
    setTo(trip.origin_location_id ?? "");
    const base = r?.depart_at ?? trip.actual_end ?? trip.planned_end ?? new Date().toISOString();
    setStart(toLocalInput(base));
    setOpen(true);
  }
  async function create() {
    if (!start) return void toast.error("حدد موعد الرجوع");
    setBusy(true);
    const s = fromLocalInput(start)!;
    const e = new Date(new Date(s).getTime() + Math.max(durMs, 3600e3)).toISOString();
    const { error } = await db.rpc("create_return_trip", { p_trip_id: trip.id, p_start: s, p_end: e, p_origin_location: from || null, p_dest_location: to || null, p_distance: distance, p_request_id: reqId });
    setBusy(false);
    if (error) return void toast.error(errMsg(error));
    toast.success("أُنشئت رحلة الرجوع وأُرسل للسائق على واتساب"); flushWa();
    setOpen(false); void qc.invalidateQueries();
  }
  async function reject(r: Row) {
    const reason = window.prompt("سبب الرفض (اختياري)") ?? "";
    const { error } = await db.rpc("reject_return_request", { p_request_id: r.id, p_reason: reason });
    if (error) return void toast.error(errMsg(error));
    toast.success("رُفض الطلب وأُبلغ السائق"); flushWa(); void qc.invalidateQueries();
  }

  return (
    <div className="space-y-3 text-sm">
      {existing ? <p>رحلة الرجوع: <b className="num">{existing.number}</b> — {fmtDateTime(existing.planned_start)}</p> : (
        <>
          {pending && <div className="space-y-2 rounded-md bg-gold-soft p-3">
            <b>طلب رجوع من السائق</b>
            <div>الموعد المطلوب: <span className="num">{fmtDateTime(pending.depart_at)}</span></div>
            {pending.notes && <div className="text-muted-foreground">{pending.notes}</div>}
            <div className="flex gap-2"><Button size="sm" onClick={() => openDialog(pending)}><CornerDownLeft /> موافقة وإنشاء</Button><Button size="sm" variant="outline" onClick={() => void reject(pending)}><X /> رفض</Button></div>
          </div>}
          <Button variant="gold" className="w-full" onClick={() => openDialog()}><CornerDownLeft /> إنشاء رحلة رجوع</Button>
        </>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent dir="rtl" className="max-w-2xl">
          <DialogHeader><DialogTitle>رحلة رجوع للرحلة {trip.number}</DialogTitle></DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <div><Label className="mb-1 block text-xs">من</Label><LocationPicker label="موقع الانطلاق" value={from} options={locs} onChange={setFrom} onCreated={() => void locations.refetch()} /></div>
            <div><Label className="mb-1 block text-xs">إلى</Label><LocationPicker label="موقع الوصول" value={to} options={locs} onChange={setTo} onCreated={() => void locations.refetch()} /></div>
            <div><Label className="mb-1 block text-xs">موعد الرجوع</Label><Input type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} /></div>
            <div><Label className="mb-1 block text-xs">المسافة التقديرية</Label><div className="num flex h-9 items-center rounded-md border px-3">{distance ? `${distance} كم` : "—"}</div></div>
          </div>
          <p className="text-xs text-muted-foreground">نفس السائق والشاحنة يُكلَّفان تلقائيًا، ومدة الرجوع مثل مدة الذهاب.</p>
          <ClientOnly fallback={<div className="h-[280px] rounded-lg border" />}>
            <Suspense fallback={<div className="h-[280px] rounded-lg border" />}><MapView height={280} markers={markers} lines={lines} /></Suspense>
          </ClientOnly>
          <Button disabled={busy} onClick={() => void create()}><Save /> إنشاء رحلة الرجوع</Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** Driver: ask the office for a return trip with the intended departure time. */
export function DriverReturnRequest({ trip, demo }: { trip: Row; demo?: boolean }) {
  const qc = useQueryClient();
  const reqs = useRows(["return_requests", trip.id], () => db.from("return_requests").select("*").eq("trip_id", trip.id).order("created_at", { ascending: false }), !demo);
  const [at, setAt] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const last = (reqs.data ?? [])[0];
  async function send() {
    if (demo) return void toast.info("معاينة فقط");
    if (!at) return void toast.error("حدد موعد الرجوع");
    setBusy(true);
    const { error } = await db.rpc("driver_request_return", { p_trip_id: trip.id, p_depart_at: fromLocalInput(at), p_notes: notes });
    setBusy(false);
    if (error) return void toast.error(errMsg(error));
    toast.success("أُرسل طلب الرجوع للإدارة"); flushWa(); setNotes(""); void qc.invalidateQueries();
  }
  return (
    <div className="panel space-y-2 p-4">
      <h2 className="flex items-center gap-1 font-bold text-primary"><CornerDownLeft className="size-4" /> رحلة الرجوع — {trip.number}</h2>
      {last && <p className="text-xs">آخر طلب: {last.status === "pending" ? "بانتظار الموافقة" : last.status === "approved" ? "تمت الموافقة ✅" : "مرفوض"} • <span className="num">{fmtDateTime(last.depart_at)}</span></p>}
      {last?.status !== "pending" && last?.status !== "approved" && <>
        <Label className="text-xs">متى تريد الرجوع؟</Label>
        <Input type="datetime-local" value={at} onChange={(e) => setAt(e.target.value)} />
        <Textarea placeholder="ملاحظات (اختياري)" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={300} />
        <Button className="w-full" disabled={busy} onClick={() => void send()}>إرسال طلب الرجوع</Button>
      </>}
    </div>
  );
}
