import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Fuel } from "lucide-react";
import { Badge } from "@/components/darb/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/lib/auth";
import { db } from "@/lib/db";
import { errMsg, fmtDateTime } from "@/lib/format";
import { STATE_LABEL, type PetroState } from "@/lib/petroapp";
import { petroappHealth, petroappImport, petroappOverview, petroappPreview, petroappSync } from "@/lib/petroapp.functions";

const TONE: Record<PetroState, "success" | "warning" | "danger" | "neutral"> = { connected: "success", missing: "neutral", rate_limited: "warning", auth_expired: "danger", error: "danger" };
const RUN_STATE: Record<string, PetroState> = { ok: "connected", missing: "missing", rate_limited: "rate_limited", auth_expired: "auth_expired", error: "error" };
const REVIEW_LABEL: Record<string, string> = { pending: "بانتظار المراجعة", approved: "معتمدة للاستيراد", rejected: "مرفوضة", imported: "مستوردة", correction_pending: "تصحيح من المصدر — يحتاج قرار", cancellation_pending: "إلغاء من المصدر — يحتاج قرار", cancelled: "ملغاة" };
const day = (d: Date) => d.toISOString().slice(0, 10);

/** PetroApp read-only card: truthful states only; success shows only after a real bridge health check. */
export function PetroAppPanel() {
  const { can, viewAs } = useAuth();
  const reviewer = can("ops_manager", "accountant", "fleet_supervisor");
  const owner = can("owner");
  const act = reviewer && !viewAs;
  const qc = useQueryClient();
  const overviewFn = useServerFn(petroappOverview);
  const healthFn = useServerFn(petroappHealth);
  const previewFn = useServerFn(petroappPreview);
  const syncFn = useServerFn(petroappSync);
  const importFn = useServerFn(petroappImport);
  const overview = useQuery({ queryKey: ["petroapp", "overview"], queryFn: () => overviewFn(), enabled: reviewer, staleTime: 30000 });
  const [check, setCheck] = useState<{ state: PetroState; detail: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [from, setFrom] = useState(day(new Date(Date.now() - 7 * 86400000)));
  const [to, setTo] = useState(day(new Date()));
  const [preview, setPreview] = useState<{ rows: any[]; unavailable: string[]; rejected: number } | null>(null);

  if (!reviewer) return (
    <div className="rounded-lg border p-4"><div className="flex items-center justify-between gap-2"><b className="text-primary">PetroApp — الوقود</b><Badge tone="neutral">غير متاح لدورك</Badge></div></div>
  );

  const ov = overview.data;
  const state: PetroState = check?.state ?? (ov && !ov.configured ? "missing" : ov?.lastState ? RUN_STATE[ov.lastState] ?? "error" : "missing");
  // "متصل" only when this session's health check succeeded; a stored ok run is shown as last result.
  const badge = check ? STATE_LABEL[check.state] : ov && !ov.configured ? STATE_LABEL.missing : ov?.lastState ? `آخر نتيجة: ${STATE_LABEL[state]}` : "لم يُفحص بعد";
  const range = () => ({ from: new Date(`${from}T00:00:00+03:00`).toISOString(), to: new Date(`${to}T23:59:59+03:00`).toISOString() });
  async function run(kind: "health" | "preview" | "sync") {
    if (busy) return;
    setBusy(true);
    try {
      if (kind === "health") { const r = await healthFn(); setCheck({ state: r.state, detail: r.detail }); }
      if (kind === "preview") { const r = await previewFn({ data: range() }); setCheck({ state: r.state, detail: r.detail }); setPreview(r.state === "connected" ? { rows: r.rows, unavailable: r.unavailable, rejected: r.rejected } : null); }
      if (kind === "sync") { const r = await syncFn({ data: range() }); setCheck({ state: r.state, detail: r.detail }); if (r.state === "connected") toast.success(`جديدة ${r.staged} · مكررة ${r.duplicates} · تصحيحات ${r.corrections} · إلغاءات ${r.cancellations} · تحتاج ربط ${r.unmatched}`); }
    } catch (e) { toast.error(errMsg(e)); }
    finally { setBusy(false); void qc.invalidateQueries({ queryKey: ["petroapp"] }); }
  }

  return (
    <div className="rounded-lg border p-4 md:col-span-2 xl:col-span-3" data-testid="petroapp-card">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2"><b className="flex min-w-0 items-center gap-2 truncate text-primary"><Fuel className="size-4 shrink-0" /> PetroApp — الوقود (قراءة فقط)</b><Badge tone={check ? TONE[check.state] : state === "connected" ? "neutral" : TONE[state]}>{badge}</Badge></div>
      <p className="mt-1 text-sm text-muted-foreground">يُقرأ عبر جسر الشركة الخاص فقط، ولا يُرسل أي شيء إلى PetroApp. العمليات تدخل منطقة مراجعة ولا تؤثر على الوقود أو الحسابات قبل اعتمادها.</p>
      {check && <p className="mt-2 text-xs">{check.detail}</p>}
      {overview.isError && <p className="mt-2 text-xs text-danger">تعذر تحميل حالة PetroApp</p>}
      <div className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="آخر مزامنة ناجحة" value={ov?.lastSuccess ? fmtDateTime(ov.lastSuccess) : "لا يوجد"} />
        <Stat label="آخر محاولة" value={ov?.lastAttempt ? fmtDateTime(ov.lastAttempt) : "لا يوجد"} />
        <Stat label="مستوردة" value={ov ? String(ov.counts.imported) : "…"} />
        <Stat label="بانتظار المراجعة" value={ov ? String(ov.counts.pending) : "…"} />
        <Stat label="تحتاج ربط" value={ov ? String(ov.counts.unmatched) : "…"} />
        <Stat label="تصحيحات/إلغاءات" value={ov ? String(ov.counts.corrections) : "…"} />
      </div>
      {act && (
        <div className="mt-3 flex flex-wrap items-end gap-2 border-t pt-3">
          <Button size="sm" variant="outline" disabled={busy} onClick={() => void run("health")}>فحص الاتصال</Button>
          <label className="text-xs">من<Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-9" /></label>
          <label className="text-xs">إلى<Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-9" /></label>
          <Button size="sm" variant="outline" disabled={busy || ov?.configured === false} onClick={() => void run("preview")}>معاينة بدون حفظ</Button>
          <Button size="sm" variant="gold" disabled={busy || ov?.configured === false} onClick={() => void run("sync")}>جلب إلى المراجعة</Button>
          <span className="text-xs text-muted-foreground">لا توجد أي عملية كتابة على PetroApp.</span>
        </div>
      )}
      {preview && (
        <div className="mt-3 text-xs">
          <p>{preview.rows.length} عملية في المعاينة{preview.rejected ? ` · ${preview.rejected} لا تطابق العقد` : ""}{preview.unavailable.length ? ` · حقول غير متاحة من المصدر: ${preview.unavailable.join("، ")}` : ""}</p>
        </div>
      )}
      <PetroReview canAct={act} isOwner={owner && !viewAs} importFn={importFn} />
      {owner && <PetroMappings canEdit={!viewAs} />}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return <div className="min-w-0 rounded-md bg-muted/50 p-2"><div className="text-muted-foreground">{label}</div><div className="truncate font-semibold">{value}</div></div>;
}

function PetroReview({ canAct, isOwner, importFn }: { canAct: boolean; isOwner: boolean; importFn: (a: { data: { ids: string[] } }) => Promise<{ imported: number; skipped: number }> }) {
  const qc = useQueryClient();
  const rows = useQuery({ queryKey: ["petroapp", "review"], queryFn: async () => {
    const { data, error } = await db.from("petroapp_transactions").select("id,provider_txn_id,occurred_at,station,fuel_type,liters,unit_price,amount,odometer,mapping_status,review_state,asset_id,provider_vehicle_ref,card_last4").not("review_state", "in", "(imported,cancelled)").order("occurred_at", { ascending: false }).limit(100);
    if (error) throw error; return data ?? [];
  } });
  const assets = useQuery({ queryKey: ["petroapp", "assets"], enabled: isOwner, queryFn: async () => { const { data, error } = await db.from("assets").select("id,code,plate").order("code"); if (error) throw error; return data ?? []; } });
  const [pending, setPending] = useState<string | null>(null);
  async function act(id: string, fn: () => Promise<{ error?: unknown } | void>) {
    if (pending) return;
    setPending(id);
    try { const r = await fn(); if (r && r.error) throw r.error; void qc.invalidateQueries({ queryKey: ["petroapp"] }); }
    catch (e) { toast.error(errMsg(e)); } finally { setPending(null); }
  }
  const review = (id: string, decision: string) => act(id, () => db.rpc("petroapp_review", { p_tx: id, p_decision: decision }) as any);
  if (rows.isLoading) return <p className="mt-3 text-xs text-muted-foreground">جارٍ تحميل منطقة المراجعة…</p>;
  if (rows.isError) return <p className="mt-3 text-xs text-danger">تعذر تحميل منطقة المراجعة</p>;
  const list = rows.data as any[];
  if (!list.length) return <p className="mt-3 border-t pt-3 text-xs text-muted-foreground">لا توجد عمليات بانتظار المراجعة.</p>;
  return (
    <div className="mt-3 overflow-x-auto border-t pt-3">
      <b className="text-xs">منطقة المراجعة ({list.length})</b>
      <table className="mt-2 w-full min-w-[720px] text-xs">
        <thead><tr className="text-muted-foreground"><th className="p-1 text-start">الوقت</th><th className="p-1 text-start">المرجع</th><th className="p-1 text-start">المحطة</th><th className="p-1 text-start">لتر</th><th className="p-1 text-start">المبلغ</th><th className="p-1 text-start">الربط</th><th className="p-1 text-start">الحالة</th><th className="p-1" /></tr></thead>
        <tbody>{list.map((r) => (
          <tr key={r.id} className="border-t align-top">
            <td className="p-1">{fmtDateTime(r.occurred_at)}</td>
            <td className="p-1">{r.provider_vehicle_ref ?? "—"}{r.card_last4 ? ` · ••${r.card_last4}` : ""}</td>
            <td className="p-1">{r.station ?? "غير متاح"}</td>
            <td className="p-1">{r.liters ?? "غير متاح"}</td>
            <td className="p-1">{r.amount ?? "غير متاح"}</td>
            <td className="p-1">{r.mapping_status === "matched" ? <Badge tone="success">مربوطة</Badge> : <Badge tone="warning">{r.mapping_status === "ambiguous" ? "غير محسومة" : "غير مربوطة"}</Badge>}
              {isOwner && r.mapping_status !== "matched" && ["pending", "rejected"].includes(r.review_state) && (
                <select aria-label="ربط بمركبة" className="mt-1 block rounded border bg-background p-1" defaultValue="" disabled={!!pending} onChange={(e) => e.target.value && void act(r.id, () => db.rpc("petroapp_assign", { p_tx: r.id, p_asset: e.target.value }) as any)}>
                  <option value="">اختر المركبة…</option>{(assets.data as any[] | undefined)?.map((a) => <option key={a.id} value={a.id}>{a.code}{a.plate ? ` — ${a.plate}` : ""}</option>)}
                </select>)}
            </td>
            <td className="p-1">{REVIEW_LABEL[r.review_state] ?? r.review_state}</td>
            <td className="p-1 whitespace-nowrap">{canAct && <span className="flex gap-1">
              {r.review_state === "pending" && r.mapping_status === "matched" && <Button size="sm" variant="outline" disabled={!!pending} onClick={() => void review(r.id, "approve")}>اعتماد</Button>}
              {r.review_state === "approved" && <Button size="sm" variant="gold" disabled={!!pending} onClick={() => void act(r.id, async () => { const res = await importFn({ data: { ids: [r.id] } }); toast.success(res.imported ? "أُضيفت لسجل الوقود كقيد معلّق للاعتماد" : "لم تُستورد"); })}>استيراد</Button>}
              {["pending", "approved"].includes(r.review_state) && <Button size="sm" variant="ghost" disabled={!!pending} onClick={() => void review(r.id, "reject")}>رفض</Button>}
              {r.review_state === "correction_pending" && <Button size="sm" variant="outline" disabled={!!pending} onClick={() => void review(r.id, "apply_correction")}>تطبيق التصحيح</Button>}
              {r.review_state === "cancellation_pending" && <Button size="sm" variant="outline" disabled={!!pending} onClick={() => void review(r.id, "apply_cancellation")}>تطبيق الإلغاء</Button>}
            </span>}</td>
          </tr>))}</tbody>
      </table>
    </div>
  );
}

function PetroMappings({ canEdit }: { canEdit: boolean }) {
  const qc = useQueryClient();
  const maps = useQuery({ queryKey: ["petroapp", "mappings"], queryFn: async () => { const { data, error } = await db.from("petroapp_mappings").select("id,kind,provider_ref,card_last4,label,asset_id,driver_id,active").eq("active", true).order("created_at"); if (error) throw error; return data ?? []; } });
  const assets = useQuery({ queryKey: ["petroapp", "assets"], queryFn: async () => { const { data, error } = await db.from("assets").select("id,code,plate").order("code"); if (error) throw error; return data ?? []; } });
  const [f, setF] = useState({ kind: "vehicle", provider_ref: "", card_last4: "", asset_id: "" });
  const [saving, setSaving] = useState(false);
  const code = (id: string) => (assets.data as any[] | undefined)?.find((a) => a.id === id)?.code ?? "—";
  async function add() {
    if (saving) return;
    if (!f.provider_ref.trim() || !f.asset_id) return void toast.error("أدخل مرجع المزود واختر المركبة");
    if (/^\d{12,19}$/.test(f.provider_ref.replace(/[\s-]/g, ""))) return void toast.error("لا تُدخل رقم البطاقة الكامل؛ استخدم معرّف البطاقة لدى المزود");
    if (f.card_last4 && !/^\d{4}$/.test(f.card_last4)) return void toast.error("آخر 4 أرقام فقط");
    setSaving(true);
    const { error } = await db.from("petroapp_mappings").insert({ kind: f.kind, provider_ref: f.provider_ref.trim(), card_last4: f.card_last4 || null, asset_id: f.asset_id });
    setSaving(false);
    if (error) return void toast.error(errMsg(error));
    setF({ kind: f.kind, provider_ref: "", card_last4: "", asset_id: "" });
    void qc.invalidateQueries({ queryKey: ["petroapp"] });
  }
  async function stop(id: string) {
    const { error } = await db.from("petroapp_mappings").update({ active: false }).eq("id", id);
    if (error) return void toast.error(errMsg(error));
    void qc.invalidateQueries({ queryKey: ["petroapp"] });
  }
  return (
    <div className="mt-3 border-t pt-3 text-xs">
      <b>ربط مركبات وبطاقات PetroApp (المدير العام)</b>
      <p className="text-muted-foreground">يُطابق المرجع حرفيًا فقط؛ لا مطابقة تقريبية للوحات. أي تعارض بين ربط المركبة والبطاقة يبقى «غير محسوم» للمراجعة.</p>
      {canEdit && <div className="mt-2 flex flex-wrap items-end gap-2">
        <select aria-label="نوع الربط" className="h-9 rounded border bg-background px-2" value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}><option value="vehicle">مركبة</option><option value="card">بطاقة</option></select>
        <Input aria-label="مرجع المزود" placeholder="معرّف المزود" className="h-9 w-44" value={f.provider_ref} onChange={(e) => setF({ ...f, provider_ref: e.target.value })} />
        {f.kind === "card" && <Input aria-label="آخر 4 أرقام" placeholder="آخر 4 أرقام" inputMode="numeric" maxLength={4} className="h-9 w-28" value={f.card_last4} onChange={(e) => setF({ ...f, card_last4: e.target.value })} />}
        <select aria-label="المركبة" className="h-9 rounded border bg-background px-2" value={f.asset_id} onChange={(e) => setF({ ...f, asset_id: e.target.value })}><option value="">اختر المركبة…</option>{(assets.data as any[] | undefined)?.map((a) => <option key={a.id} value={a.id}>{a.code}{a.plate ? ` — ${a.plate}` : ""}</option>)}</select>
        <Button size="sm" variant="gold" disabled={saving} onClick={() => void add()}>إضافة ربط</Button>
      </div>}
      {maps.isError ? <p className="mt-2 text-danger">تعذر تحميل الربط</p> : maps.isLoading ? <p className="mt-2">جارٍ التحميل…</p> : !(maps.data as any[]).length ? <p className="mt-2 text-muted-foreground">لا يوجد ربط بعد.</p> : (
        <ul className="mt-2 space-y-1">{(maps.data as any[]).map((m) => <li key={m.id} className="flex flex-wrap items-center gap-2"><Badge tone="neutral" dot={false}>{m.kind === "card" ? "بطاقة" : "مركبة"}</Badge><span>{m.provider_ref}{m.card_last4 ? ` · ••${m.card_last4}` : ""} ← {code(m.asset_id)}</span>{canEdit && <Button size="sm" variant="ghost" onClick={() => void stop(m.id)}>إيقاف</Button>}</li>)}</ul>
      )}
    </div>
  );
}
