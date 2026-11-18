import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link2, Plus, RefreshCw, Satellite } from "lucide-react";
import { toast } from "sonner";
import { Badge, DataTable, Panel } from "@/components/darb/ui";
import { Button } from "@/components/ui/button";
import { db, type Row } from "@/lib/db";
import { damanSyncNow } from "@/lib/daman-gps.functions";
import { DAMAN_STATE_LABEL } from "@/lib/daman-gps";
import { errMsg, fmtDateTime, type Tone } from "@/lib/format";

const STATE_TONE: Record<string, Tone> = { moving: "success", stopped: "gold", disconnected: "danger" };

export function DamanStateBadge({ state }: { state: string | null | undefined }) {
  return <Badge tone={STATE_TONE[state ?? ""] ?? "neutral"}>{DAMAN_STATE_LABEL[state ?? ""] ?? state ?? "—"}</Badge>;
}

/** All vehicles reported by ضمان المهندس, with linking to Shata vehicles. */
export function DamanFleet({ rows, assets, loading, canLink, onSelect }: { rows: Row[]; assets: Row[]; loading: boolean; canLink: boolean; onSelect: (assetId: string | null, lat?: number, lng?: number) => void }) {
  const qc = useQueryClient();
  const sync = useServerFn(damanSyncNow);
  const [busy, setBusy] = useState<string | null>(null);
  const linkedIds = new Set(rows.map((r) => r.asset_id).filter(Boolean));
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["gps-provider"] });
    void qc.invalidateQueries({ queryKey: ["assets"] });
    void qc.invalidateQueries({ queryKey: ["gps"] });
  };

  async function syncNow() {
    setBusy("sync");
    try {
      const r = await sync();
      if (r.state === "connected") toast.success(r.detail); else toast.error(r.detail);
      refresh();
    } catch (e) { toast.error(errMsg(e)); } finally { setBusy(null); }
  }
  async function link(id: string, assetId: string) {
    setBusy(id);
    const { error } = await db.rpc("gps_link_vehicle", { p_id: id, p_asset_id: assetId || null });
    setBusy(null);
    if (error) return void toast.error(errMsg(error));
    toast.success(assetId ? "تم ربط جهاز التتبع بالمركبة" : "تم فك الربط");
    refresh();
  }
  async function addToFleet(id: string) {
    setBusy(id);
    const { error } = await db.rpc("gps_add_vehicle_to_fleet", { p_id: id, p_kind: "rigid" });
    setBusy(null);
    if (error) return void toast.error(errMsg(error));
    toast.success("أُضيفت المركبة إلى أسطول شتاء ورُبطت بجهازها");
    refresh();
  }

  const last = rows.reduce<string | null>((m, r) => (!m || r.synced_at > m ? r.synced_at : m), null);
  return (
    <Panel
      title={`مركبات ضمان المهندس (${rows.length})`}
      icon={<Satellite />}
      className="mt-5"
      actions={<div className="flex items-center gap-2">
        {last && <span className="num text-xs text-muted-foreground">آخر مزامنة {fmtDateTime(last)}</span>}
        <Button size="sm" variant="soft" disabled={busy === "sync"} onClick={() => void syncNow()}><RefreshCw className={busy === "sync" ? "animate-spin" : ""} /> تحديث الآن</Button>
      </div>}
    >
      <p className="mb-3 text-xs text-muted-foreground">تتحدث المواقع تلقائيًا كل دقيقة. المركبة المربوطة بمركبة في شتاء تدخل مواقعها في سجلها وتنبيهات الرحلات.</p>
      <DataTable rows={rows} loading={loading} searchKeys={["plate", "car_name"]} onRowClick={(r) => onSelect(r.asset_id ?? null, r.lat, r.lng)} cols={[
        { key: "plate", label: "اللوحة", render: (r) => <span className="num font-semibold text-primary">{r.plate ?? "—"}</span> },
        { key: "car_name", label: "النوع", render: (r) => r.car_name ?? "—" },
        { key: "state", label: "الحالة", render: (r) => <DamanStateBadge state={r.vehicle_state} /> },
        { key: "speed", label: "السرعة", render: (r) => <span className="num">{r.speed_kmh != null ? `${Math.round(r.speed_kmh)} كم/س` : "—"}</span> },
        { key: "gps_time", label: "آخر إشارة", render: (r) => <span className="num text-xs">{fmtDateTime(r.gps_time)}</span> },
        { key: "asset", label: "مركبة شتاء", render: (r) => canLink ? (
          <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
            <select aria-label="ربط بمركبة" className="h-8 max-w-40 rounded-full border bg-background px-2 text-xs" disabled={busy === r.id} value={r.asset_id ?? ""} onChange={(e) => void link(r.id, e.target.value)}>
              <option value="">غير مربوطة</option>
              {assets.filter((a) => a.kind !== "trailer" && (a.id === r.asset_id || !linkedIds.has(a.id))).map((a) => <option key={a.id} value={a.id}>{a.code}</option>)}
            </select>
            {!r.asset_id && <Button size="sm" variant="ghost" disabled={busy === r.id} title="إضافة إلى أسطول شتاء" onClick={() => void addToFleet(r.id)}><Plus /> إضافة</Button>}
          </div>
        ) : (r.asset_id ? <Badge tone="success"><Link2 className="size-3" /> مربوطة</Badge> : <Badge>غير مربوطة</Badge>) },
      ]} />
    </Panel>
  );
}
