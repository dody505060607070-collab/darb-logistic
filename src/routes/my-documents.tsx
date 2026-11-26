import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { FileUp, FolderOpen } from "lucide-react";
import { AppShell } from "@/components/darb/AppShell";
import { PageHeader, Panel, Status } from "@/components/darb/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { db, signedUrl, uploadFile } from "@/lib/db";
import { useAuth } from "@/lib/auth";
import { errMsg, fmtDate } from "@/lib/format";

export const Route = createFileRoute("/my-documents")({
  head: () => ({
    meta: [
      { title: "مستنداتي | Shata" },
      { name: "description", content: "ارفع مستنداتك الناقصة بنفسك لتراجعها الإدارة وتعتمدها." },
      { property: "og:title", content: "مستنداتي | Shata" },
      { property: "og:description", content: "رفع المستندات الشخصية ومتابعة اعتمادها." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <AppShell staffOnly={false}>
      <MyDocuments />
    </AppShell>
  ),
});

const TYPES = ["الهوية / الإقامة", "رخصة القيادة", "جواز السفر", "شهادة صحية", "عقد العمل", "صورة شخصية", "أخرى"];

function MyDocuments() {
  const auth = useAuth();
  const me = auth.session?.user.id ?? "";
  const qc = useQueryClient();
  const [docType, setDocType] = useState(TYPES[0]!);
  const [number, setNumber] = useState("");
  const [expiry, setExpiry] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const entity = auth.driverId ? { entity_type: "driver", entity_id: auth.driverId } : { entity_type: "employee", entity_id: me };

  const docs = useQuery({
    queryKey: ["documents", "mine", entity.entity_id],
    enabled: !!me,
    queryFn: async () => {
      const { data, error } = await db.from("documents").select("*").eq("entity_type", entity.entity_type).eq("entity_id", entity.entity_id).order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  async function submit() {
    if (!file) { toast.error("اختر ملف المستند"); return; }
    setBusy(true);
    try {
      const path = await uploadFile(file, "my-documents");
      const { error } = await db.from("documents").insert({ ...entity, doc_type: docType, number: number || null, expiry_date: expiry || null, file_path: path, review_status: "pending", uploaded_by: me });
      if (error) throw error;
      toast.success("تم رفع المستند، بانتظار اعتماد الإدارة");
      setFile(null); setNumber(""); setExpiry("");
      void qc.invalidateQueries({ queryKey: ["documents"] });
    } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  }

  return (
    <div className="space-y-5">
      <PageHeader title="مستنداتي" subtitle="ارفع مستنداتك الناقصة بنفسك، وتظهر للإدارة لتراجعها وتعتمدها." />
      <Panel title="رفع مستند جديد" icon={<FileUp className="size-5" />}>
        <div className="grid gap-3 md:grid-cols-4">
          <label className="space-y-1 text-sm">نوع المستند
            <select className="h-10 w-full rounded-md border bg-background px-3" value={docType} onChange={(e) => setDocType(e.target.value)}>{TYPES.map((t) => <option key={t}>{t}</option>)}</select>
          </label>
          <label className="space-y-1 text-sm">رقم المستند (اختياري)<Input value={number} onChange={(e) => setNumber(e.target.value)} /></label>
          <label className="space-y-1 text-sm">تاريخ الانتهاء (اختياري)<Input type="date" value={expiry} onChange={(e) => setExpiry(e.target.value)} /></label>
          <label className="space-y-1 text-sm">الملف<Input type="file" accept="image/*,application/pdf" onChange={(e) => setFile(e.target.files?.[0] ?? null)} /></label>
        </div>
        <Button className="mt-4" disabled={busy || !me} onClick={submit}><FileUp /> {busy ? "جارٍ الرفع…" : "رفع المستند"}</Button>
      </Panel>
      <Panel title="مستنداتي المرفوعة" icon={<FolderOpen className="size-5" />}>
        {docs.data?.length ? (
          <div className="divide-y">
            {docs.data.map((d: any) => ( // eslint-disable-line @typescript-eslint/no-explicit-any
              <div key={d.id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
                <span><b>{d.doc_type}</b>{d.number ? <span className="num"> — {d.number}</span> : null}{d.expiry_date ? <span className="text-muted-foreground"> · ينتهي {fmtDate(d.expiry_date)}</span> : null}</span>
                <span className="flex items-center gap-2"><Status kind="review" value={d.review_status} />
                  {d.file_path && <Button size="sm" variant="outline" onClick={async () => { try { window.open(await signedUrl(d.file_path!), "_blank"); } catch (e) { toast.error(errMsg(e)); } }}>عرض</Button>}</span>
              </div>
            ))}
          </div>
        ) : <p className="text-sm text-muted-foreground">{docs.isLoading ? "جارٍ التحميل…" : "لم ترفع أي مستند بعد."}</p>}
      </Panel>
    </div>
  );
}
