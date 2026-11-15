import { flushWa } from "@/lib/wa-flush";
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Check, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { db, useRows, type Row } from "@/lib/db";
import { fetchAssets, fetchDrivers } from "@/lib/queries";
import { useAuth } from "@/lib/auth";
import { assignmentProblem, vehicleNotReady } from "@/lib/trip-assignment";
import { errMsg, fromLocalInput, toLocalInput, STATUS } from "@/lib/format";

/** Atomic allocation through the assign_trip_resources RPC (DB exclusion constraint blocks overlaps). */
export function AssignForm({ trip, trips, onDone }: { trip?: Row | null; trips?: Row[]; onDone?: () => void }) {
  const qc = useQueryClient();
  const { can } = useAuth();
  const assets = useRows(["assets"], fetchAssets);
  const drivers = useRows(["drivers"], fetchDrivers);
  const [tripId, setTripId] = useState(trip?.id ?? "");
  const [driver, setDriver] = useState("");
  const [tractor, setTractor] = useState("");
  const [trailer, setTrailer] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [override, setOverride] = useState("");
  const [busy, setBusy] = useState(false);

  const cur = trip ?? trips?.find((t) => t.id === tripId) ?? null;
  useEffect(() => {
    if (!cur) return;
    setTripId(cur.id);
    setDriver(cur.driver_id ?? "");
    setTractor(cur.tractor_id ?? "");
    setTrailer(cur.trailer_id ?? "");
    setStart(toLocalInput(cur.planned_start));
    setEnd(toLocalInput(cur.planned_end));
  }, [cur?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const a = assets.data ?? [];
  const lbl = (x: Row) => `${x.code} — ${STATUS["asset"]?.[x.status]?.[0] ?? x.status}`;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!tripId) return void toast.error("اختر الرحلة");
    const problem = assignmentProblem({
      driver: (drivers.data ?? []).find((d) => d.id === driver),
      tractor: a.find((x) => x.id === tractor),
      trailer: a.find((x) => x.id === trailer),
      endIso: fromLocalInput(end),
      isEmpty: !!cur?.is_empty,
      weightTons: cur?.cargo_weight_tons != null ? Number(cur.cargo_weight_tons) : null,
    });
    if (problem) return void toast.error(problem, { duration: 10000 });
    setBusy(true);
    const { error } = await db.rpc("assign_trip_resources", {
      p_trip_id: tripId,
      p_driver_id: driver,
      p_tractor_id: tractor,
      p_trailer_id: trailer || null,
      p_start: fromLocalInput(start),
      p_end: fromLocalInput(end),
      p_override_reason: override || null,
    });
    setBusy(false);
    if (error) return void toast.error(errMsg(error));
    toast.success("تم التخصيص وحجز الموارد"); flushWa();
    void qc.invalidateQueries({ queryKey: ["trips"] });
    void qc.invalidateQueries({ queryKey: ["bookings"] });
    onDone?.();
  }

  const sel = "h-9 w-full rounded-md border border-input bg-card px-3 text-sm";
  return (
    <form onSubmit={submit} className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      {trips && !trip && (
        <div className="sm:col-span-3">
          <Label className="mb-1 block text-xs">الرحلة *</Label>
          <select className={sel} value={tripId} onChange={(e) => setTripId(e.target.value)} required>
            <option value="">— اختر —</option>
            {trips.filter((t) => ["draft", "planned", "ready"].includes(t.status)).map((t) => (
              <option key={t.id} value={t.id}>{t.number} — {t.origin_city} ← {t.dest_city}</option>
            ))}
          </select>
        </div>
      )}
      <div>
        <Label className="mb-1 block text-xs">السائق *</Label>
        <select className={sel} value={driver} onChange={(e) => setDriver(e.target.value)} required>
          <option value="">— اختر —</option>
          {(drivers.data ?? []).map((d) => <option key={d.id} value={d.id}>{d.full_name} — {STATUS["driver"]?.[d.status]?.[0]}</option>)}
        </select>
      </div>
      <div>
        <Label className="mb-1 block text-xs">الرأس / الشاحنة *</Label>
        <select className={sel} value={tractor} onChange={(e) => setTractor(e.target.value)} required>
          <option value="">— اختر —</option>
          {a.filter((x) => x.kind !== "trailer").map((x) => <option key={x.id} value={x.id} disabled={!!vehicleNotReady(x)}>{lbl(x)}</option>)}
        </select>
      </div>
      <div>
        <Label className="mb-1 block text-xs">المقطورة</Label>
        <select className={sel} value={trailer} onChange={(e) => setTrailer(e.target.value)}>
          <option value="">بدون</option>
          {a.filter((x) => x.kind === "trailer").map((x) => <option key={x.id} value={x.id} disabled={!!vehicleNotReady(x)}>{lbl(x)}</option>)}
        </select>
      </div>
      <div>
        <Label className="mb-1 block text-xs">بداية الحجز *</Label>
        <Input type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} required />
      </div>
      <div>
        <Label className="mb-1 block text-xs">نهاية الحجز *</Label>
        <Input type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)} required />
      </div>
      {can("ops_manager") && (
        <div>
          <Label className="mb-1 block text-xs">سبب استثناء (اختياري)</Label>
          <Input value={override} onChange={(e) => setOverride(e.target.value)} placeholder="للمستندات فقط — لا يتجاوز العيب الحرج" />
        </div>
      )}
      {a.length > 0 && a.filter((x) => x.kind !== "trailer" && !vehicleNotReady(x)).length === 0 && (
        <p className="sm:col-span-3 rounded-md bg-danger-soft px-3 py-2 text-xs text-danger">
          لا توجد شاحنة جاهزة الآن: {a.filter((x) => x.kind !== "trailer").map((x) => vehicleNotReady(x)).join("، ")}. أنهِ أوامر الصيانة المفتوحة أو أضف شاحنة أخرى ثم خصّص الرحلة.
        </p>
      )}
      <div className="sm:col-span-3">
        <Button type="submit" disabled={busy} className="w-full sm:w-auto">
          {busy ? <Loader2 className="animate-spin" /> : <Check />} تخصيص وحجز الموارد
        </Button>
        <p className="mt-2 text-xs text-muted-foreground">يتحقق النظام من الرخصة والمستندات والفحص والصيانة والتوافق والحمولة ويمنع تداخل الحجوزات.</p>
      </div>
    </form>
  );
}
