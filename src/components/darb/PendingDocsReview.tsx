import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Check, FileClock, X } from "lucide-react";
import { Panel } from "@/components/darb/ui";
import { Button } from "@/components/ui/button";
import { db, signedUrl } from "@/lib/db";
import { errMsg, fmtDate } from "@/lib/format";

/** One-click approve/reject of documents people uploaded themselves. Optional entityIds narrows to one person. */
export function PendingDocsReview({ entityIds, title = "مستندات مرفوعة بانتظار موافقتك" }: { entityIds?: string[]; title?: string }) {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["documents", "pending-review", entityIds ?? "all"],
    enabled: !entityIds || entityIds.length > 0,
    queryFn: async () => {
      let s = db.from("documents").select("*").eq("review_status", "pending").order("created_at", { ascending: false }).limit(100);
      if (entityIds) s = s.in("entity_id", entityIds);
      const { data, error } = await s;
      if (error) throw error;
      const rows = data ?? [];
      const ids = [...new Set(rows.map((r: any) => r.entity_id).filter(Boolean))]; // eslint-disable-line @typescript-eslint/no-explicit-any
      const names = new Map<string, string>();
      if (ids.length) {
        const [p, d] = await Promise.all([db.from("profiles").select("id,full_name").in("id", ids), db.from("drivers").select("id,name").in("id", ids)]);
        for (const x of p.data ?? []) names.set(x.id, x.full_name ?? "");
        for (const x of (d.data ?? []) as any[]) names.set(x.id, x.name ?? ""); // eslint-disable-line @typescript-eslint/no-explicit-any
      }
      return rows.map((r: any) => ({ ...r, person: names.get(r.entity_id) || "—" })); // eslint-disable-line @typescript-eslint/no-explicit-any
    },
  });
  async function decide(id: string, status: "approved" | "rejected") {
    const { error } = await db.from("documents").update({ review_status: status }).eq("id", id);
    if (error) { toast.error(errMsg(error)); return; }
    toast.success(status === "approved" ? "تمت الموافقة على المستند" : "تم رفض المستند");
    void qc.invalidateQueries({ queryKey: ["documents"] });
  }
  const rows = q.data ?? [];
  if (!q.isLoading && !rows.length && !entityIds) return null;
  return (
    <Panel title={`${title}${rows.length ? ` (${rows.length})` : ""}`} icon={<FileClock className="size-5" />}>
      {rows.length ? (
        <div className="divide-y">
          {rows.map((d: any) => ( // eslint-disable-line @typescript-eslint/no-explicit-any
            <div key={d.id} className="grid grid-cols-[minmax(0,1fr)] gap-2 py-3 text-sm sm:flex sm:items-center sm:justify-between">
              <div className="min-w-0"><b>{d.person}</b> — {d.doc_type}{d.number ? <span className="num"> · {d.number}</span> : null}{d.expiry_date ? <span className="text-muted-foreground"> · ينتهي {fmtDate(d.expiry_date)}</span> : null}</div>
              <div className="flex shrink-0 flex-wrap gap-2">
                {d.file_path && <Button size="sm" variant="outline" onClick={async () => { try { window.open(await signedUrl(d.file_path), "_blank"); } catch (e) { toast.error(errMsg(e)); } }}>عرض</Button>}
                <Button size="sm" onClick={() => void decide(d.id, "approved")}><Check /> موافقة</Button>
                <Button size="sm" variant="outline" className="text-destructive" onClick={() => void decide(d.id, "rejected")}><X /> رفض</Button>
              </div>
            </div>
          ))}
        </div>
      ) : <p className="text-sm text-muted-foreground">{q.isLoading ? "جارٍ التحميل…" : "لا توجد مستندات بانتظار الموافقة."}</p>}
    </Panel>
  );
}
