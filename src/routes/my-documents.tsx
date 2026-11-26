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
import { DEFAULT_REQUIRED_DRIVER } from "@/lib/doc-alerts";
import { DEFAULT_REQUIRED_EMPLOYEE, docChecklist } from "@/lib/my-docs";

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

const EXTRA = ["جواز السفر", "شهادة صحية", "عقد العمل", "أخرى"];

function MyDocuments() {
  const auth = useAuth();
  const me = auth.session?.user.id ?? "";
  const qc = useQueryClient();
  const [docType, setDocType] = useState("");
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

  const settings = useQuery({
    queryKey: ["company_settings", "doc-required"],
    queryFn: async () => (await db.from("company_settings").select("doc_required_driver").eq("id", 1).maybeSingle()).data,
  });
  const required: string[] = auth.driverId ? (settings.data?.doc_required_driver?.length ? settings.data.doc_required_driver : DEFAULT_REQUIRED_DRIVER) : DEFAULT_REQUIRED_EMPLOYEE;
  const checklist = docChecklist(required, (docs.data ?? []) as { doc_type: string; review_status?: string | null; created_at?: string | null }[]);
  const TYPES = [...required, ...EXTRA.filter((t) => !required.includes(t))];
  const chosen = docType || checklist.find((c) => c.state === "missing" || c.state === "rejected")?.type || TYPES[0]!;
  const missingCount = checklist.filter((c) => c.state === "missing" || c.state === "rejected").length;
  function pick(t: string) { setDocType(t); document.getElementById("upload-doc")?.scrollIntoView({ behavior: "smooth", block: "start" }); }

  async function submit() {
    if (!file) { toast.error("اختر ملف المستند"); return; }
    setBusy(true);
    try {
      const path = await uploadFile(file, "my-documents");
      const { error } = await db.from("documents").insert({ ...entity, doc_type: chosen, number: number || null, expiry_date: expiry || null, file_path: path, review_status: "pending", uploaded_by: me });
      if (error) throw error;
      toast.success("تم رفع المستند، بانتظار اعتماد الإدارة");
      setFile(null); setNumber(""); setExpiry(""); setDocType("");
      void qc.invalidateQueries({ queryKey: ["documents"] });
    } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  }

  return (
    <div className="space-y-5">
      <PageHeader title="مستنداتي" subtitle="ارفع مستنداتك الناقصة بنفسك، وتظهر للإدارة لتراجعها وتعتمدها." />
      <div className={`rounded-2xl border p-4 text-sm font-semibold ${missingCount ? "border-danger/40 bg-danger-soft text-danger" : "border-success/40 bg-success-soft text-success"}`} role="status">
        {missingCount ? `ينقصك ${missingCount} من المستندات المطلوبة لاكتمال ملفك. اضغط على المستند الأحمر لرفعه.` : "ملفك مكتمل — رفعت كل المستندات المطلوبة."}
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)] gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {checklist.map((c) => {
          const tone = c.state === "approved" ? "border-success/40 bg-success-soft text-success" : c.state === "pending" ? "border-warning/40 bg-warning-soft text-warning" : "border-danger/40 bg-danger-soft text-danger";
          const label = c.state === "approved" ? "تمت الموافقة" : c.state === "pending" ? "مرفوع — بانتظار موافقة الإدارة" : c.state === "rejected" ? "مرفوض — ارفعه من جديد" : "ناقص — يجب رفعه";
          const act = c.state === "missing" || c.state === "rejected";
          return (
            <button key={c.type} type="button" disabled={!act} onClick={() => pick(c.type)} className={`min-w-0 rounded-2xl border p-4 text-start ${tone} ${act ? "cursor-pointer" : "cursor-default"}`}>
              <div className="truncate text-base font-bold">{c.type}</div>
              <div className="mt-1 text-sm">{label}</div>
              {act && <div className="mt-2 text-xs underline">اضغط للرفع</div>}
            </button>
          );
        })}
      </div>
      <div id="upload-doc" />
      <Panel title="رفع مستند جديد" icon={<FileUp className="size-5" />}>
        <div className="grid gap-3 md:grid-cols-4">
          <label className="space-y-1 text-sm">نوع المستند
            <select className="h-10 w-full rounded-md border bg-background px-3" value={chosen} onChange={(e) => setDocType(e.target.value)}>{TYPES.map((t) => <option key={t}>{t}</option>)}</select>
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
