import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CheckCircle2, CircleAlert, Clock3, LoaderCircle, ClipboardList, ImageIcon, MapPin, MessageSquare, Plus, RotateCcw, Send } from "lucide-react";
import { AppShell } from "@/components/darb/AppShell";
import { Badge, Kpi, PageHeader, Panel } from "@/components/darb/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { db, signedUrl, uploadFile } from "@/lib/db";
import { ROLE_LABELS, useAuth, type AppRole } from "@/lib/auth";
import { errMsg, fmtDateTime } from "@/lib/format";
import { useServerFn } from "@tanstack/react-start";
import { notifyTask } from "@/lib/whatsapp.functions";
import { nextReminderAt, REMINDER_HOURS } from "@/lib/tasks";

export const Route = createFileRoute("/tasks")({
  head: () => ({
    meta: [
      { title: "المهام — Shata" },
      { name: "description", content: "تكليف الموظفين بمهام، متابعة التذكير، ومراجعة الإنجاز واعتماده." },
      { property: "og:title", content: "المهام — Shata" },
      { property: "og:description", content: "تكليف ومتابعة واعتماد مهام الفريق." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <AppShell>
      <TasksPage />
    </AppShell>
  ),
});

type Task = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
type Person = { id: string; full_name: string; role: string };

const STATUS: Record<string, { label: string; tone: "info" | "warning" | "success" | "neutral" }> = {
  assigned: { label: "قيد التنفيذ", tone: "info" },
  submitted: { label: "بانتظار المراجعة", tone: "warning" },
  completed: { label: "مكتملة", tone: "success" },
  cancelled: { label: "ملغاة", tone: "neutral" },
};

function TasksPage() {
  const { can, session } = useAuth();
  const me = session?.user.id ?? "";
  const manager = can("ops_manager");
  const qc = useQueryClient();
  const [tab, setTab] = useState<"open" | "review" | "done" | "mine">(manager ? "open" : "mine");
  const [creating, setCreating] = useState(false);

  const people = useQuery({
    queryKey: ["chat_directory"],
    queryFn: async () => ((await supabase.rpc("chat_directory")).data ?? []) as Person[],
  });
  const tasks = useQuery({
    queryKey: ["tasks"],
    queryFn: async () => {
      const { data, error } = await db.from("tasks").select("*").order("created_at", { ascending: false }).limit(500);
      if (error) throw error;
      return data as Task[];
    },
  });
  const name = (id: string) => people.data?.find((p) => p.id === id)?.full_name ?? "—";
  const all = tasks.data ?? [];
  const list = useMemo(() => {
    if (tab === "mine") return all.filter((t) => t.assignee_id === me && t.status !== "completed");
    if (tab === "review") return all.filter((t) => t.status === "submitted");
    if (tab === "done") return all.filter((t) => t.status === "completed");
    return all.filter((t) => t.status === "assigned");
  }, [all, tab, me]);
  const refresh = () => void qc.invalidateQueries({ queryKey: ["tasks"] });
  const notify = useServerFn(notifyTask);
  const wa = async (taskId: string, event: "assigned" | "submitted" | "returned" | "approved") => {
    try {
      const r = await notify({ data: { taskId, event } });
      if (r.sent) toast.success(`أُرسلت رسالة واتساب (${r.sent})`);
      else toast.message(r.reason === "no_phone" ? "لا يوجد رقم جوال مسجل للمستلم — لم تُرسل رسالة واتساب" : "واتساب غير مربوط بعد — لم تُرسل رسالة");
    } catch (e) { toast.error(errMsg(e)); }
    refresh();
  };

  async function submit(t: Task) {
    const note = window.prompt("اكتب ملاحظة عن إنجاز المهمة (اختياري)") ?? "";
    const { error } = await supabase.rpc("task_submit", { p_id: t.id, p_note: note });
    if (error) { toast.error(errMsg(error)); return; }
    toast.success("تم إرسال المهمة للمراجعة");
    refresh();
    void wa(t.id, "submitted");
  }
  async function review(t: Task, approve: boolean) {
    if (approve && !window.confirm("تأكيد نهائي: هل المهمة مكتملة فعلاً؟")) return;
    const note = approve ? "" : (window.prompt("سبب الإرجاع") ?? "");
    const { error } = await supabase.rpc("task_review", { p_id: t.id, p_approve: approve, p_note: note });
    if (error) { toast.error(errMsg(error)); return; }
    toast.success(approve ? "تم اعتماد المهمة كمكتملة" : "أُعيدت المهمة للموظف");
    refresh();
    void wa(t.id, approve ? "approved" : "returned");
  }

  const tabs = [
    ...(manager ? ([["open", "قيد التنفيذ"], ["review", "بانتظار المراجعة"], ["done", "مكتملة"]] as const) : []),
    ["mine", "مهامي"] as const,
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        title="المهام"
        subtitle="كلّف أي موظف بمهمة، وتابع التذكير حتى ينجزها، ثم راجعها واعتمدها."
        icon={<ClipboardList />}
        actions={manager && <Button onClick={() => setCreating(true)}><Plus /> مهمة جديدة</Button>}
      />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label="قيد التنفيذ" value={all.filter((t) => t.status === "assigned").length} tone="info" icon={<LoaderCircle />} />
        <Kpi label="بانتظار مراجعتك" value={all.filter((t) => t.status === "submitted").length} tone="warning" icon={<Clock3 />} />
        <Kpi label="عاجلة مفتوحة" value={all.filter((t) => t.priority === "urgent" && t.status === "assigned").length} tone="danger" icon={<CircleAlert />} />
        <Kpi label="مكتملة" value={all.filter((t) => t.status === "completed").length} tone="success" icon={<CheckCircle2 />} />
      </div>
      <div className="status-tabs grid grid-cols-2 gap-2 rounded-xl border bg-card p-2 md:flex">
        {tabs.map(([k, l]) => (
          <Button key={k} className="min-w-0 flex-1" variant={tab === k ? "default" : "ghost"} aria-pressed={tab === k} onClick={() => setTab(k)}>{l}</Button>
        ))}
      </div>
      <Panel title="القائمة" bodyClass="task-list-body">
        {list.length === 0 ? (
          <div className="flex min-h-80 flex-col items-center justify-center gap-4 px-4 py-10 text-center">
            <div className="rounded-3xl bg-gold-soft p-5"><ClipboardList className="size-20 text-primary" strokeWidth={1.5} /></div>
            <h3 className="text-2xl font-bold text-primary">لا توجد مهام هنا</h3>
            <p className="text-sm text-muted-foreground">{manager ? "ابدأ بإنشاء مهمة جديدة لتنظيم ومتابعة أعمال فريقك." : "ستظهر هنا المهام المكلَّف بها."}</p>
            {manager && <Button onClick={() => setCreating(true)}><Plus /> مهمة جديدة</Button>}
          </div>
        ) : (
          <div className="divide-y divide-border">
            {list.map((t) => (
              <div key={t.id} className="flex flex-col gap-2 py-3 md:flex-row md:items-start">
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold">{t.title}</span>
                    {t.priority === "urgent" && <Badge tone="danger">عاجلة</Badge>}
                    <Badge tone={STATUS[t.status]?.tone ?? "neutral"}>{STATUS[t.status]?.label ?? t.status}</Badge>
                  </div>
                  {t.description && <p className="text-sm text-muted-foreground">{t.description}</p>}
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    <span>المكلَّف: <b className="text-foreground">{name(t.assignee_id)}</b></span>
                    <span>كلّفه: {name(t.assigned_by)}{t.requested_by_external ? ` — بطلب من: ${t.requested_by_external}` : ""}</span>
                    {t.due_at && <span>الموعد: {fmtDateTime(t.due_at)}</span>}
                    {t.status === "assigned" && <span>التذكير القادم: {fmtDateTime(nextReminderAt(t.priority, t.created_at, new Date()).toISOString())}</span>}
                    {t.location_text && (
                      <a className="text-gold" target="_blank" rel="noreferrer" href={t.lat ? `https://maps.google.com/?q=${t.lat},${t.lng}` : `https://maps.google.com/?q=${encodeURIComponent(t.location_text)}`}>
                        <MapPin className="inline size-3" /> {t.location_text}
                      </a>
                    )}
                    {t.photo_path && (
                      <Button variant="link" size="sm" className="h-auto p-0 text-gold" onClick={async () => { try { window.open(await signedUrl(t.photo_path), "_blank"); } catch (e) { toast.error(errMsg(e)); } }}>
                        <ImageIcon className="inline size-3" /> الصورة
                      </Button>
                    )}
                  </div>
                  {t.done_note && <p className="text-xs">ملاحظة الإنجاز: {t.done_note}</p>}
                  {t.review_note && <p className="text-xs text-warning">ملاحظة المراجعة: {t.review_note}</p>}
                </div>
                <div className="flex shrink-0 gap-2">
                  {t.assignee_id === me && t.status === "assigned" && <Button size="sm" onClick={() => void submit(t)}><Send /> أنهيت المهمة</Button>}
                  {manager && t.status === "submitted" && (
                    <>
                      <Button size="sm" onClick={() => void review(t, true)}><CheckCircle2 /> المهمة مكتملة</Button>
                      <Button size="sm" variant="outline" onClick={() => void review(t, false)}><RotateCcw /> إرجاع</Button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </Panel>
      <details className="reminder-details rounded-lg border p-4 text-sm">
        <summary className="cursor-pointer font-semibold text-primary"><MessageSquare className="ml-2 inline size-5 text-gold" />إشعارات واتساب والتذكير</summary>
        <p className="mt-3 leading-7">
        واتساب: عند التكليف تصل للموظف رسالة بكل التفاصيل (الصورة والموقع)، وعند الإنجاز تصلك رسالة، وعند الإرجاع تصله رسالة. يلزم ربط الرقم من صفحة «متابعة النشاط» وتسجيل رقم جوال لكل موظف.
        التذكير: العاجلة كل {REMINDER_HOURS.urgent} ساعة، والعادية كل {REMINDER_HOURS.normal} ساعة حتى الإنجاز.
        </p>
      </details>
      {creating && <NewTask people={people.data ?? []} onClose={() => setCreating(false)} onDone={(id) => void wa(id, "assigned")} />}
    </div>
  );
}

function NewTask({ people, onClose, onDone }: { people: Person[]; onClose: () => void; onDone: (id: string) => void }) {
  const [f, setF] = useState({ title: "", description: "", priority: "normal", assignee_id: "", requested_by_external: "", location_text: "", due_at: "" });
  const [photo, setPhoto] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  async function save() {
    if (!f.title.trim() || !f.assignee_id) { toast.error("اكتب عنوان المهمة واختر الموظف"); return; }
    setBusy(true);
    try {
      const m = f.location_text.match(/(-?\d+\.\d+)\s*,\s*(-?\d+\.\d+)/);
      const photo_path = photo ? await uploadFile(photo, "tasks") : null;
      const { data: row, error } = await db.from("tasks").insert({
        title: f.title.trim(), description: f.description || null, priority: f.priority, assignee_id: f.assignee_id,
        requested_by_external: f.requested_by_external || null, location_text: f.location_text || null,
        lat: m ? Number(m[1]) : null, lng: m ? Number(m[2]) : null, photo_path,
        due_at: f.due_at ? new Date(f.due_at).toISOString() : null,
      }).select("id").single();
      if (error) throw error;
      toast.success("تم إنشاء المهمة");
      onDone(row.id);
      onClose();
    } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  }
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent dir="rtl" className="max-w-lg">
        <DialogHeader><DialogTitle>مهمة جديدة</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <Input placeholder="عنوان المهمة" value={f.title} onChange={set("title")} />
          <Textarea placeholder="ماذا يجب أن يفعل الموظف؟" value={f.description} onChange={set("description")} />
          <div className="grid grid-cols-2 gap-2">
            <select className="h-10 rounded-xl border border-border bg-background px-3 text-sm" value={f.assignee_id} onChange={set("assignee_id")}>
              <option value="">اختر الموظف</option>
              {people.map((p) => <option key={p.id} value={p.id}>{p.full_name} — {ROLE_LABELS[p.role as AppRole] ?? p.role}</option>)}
            </select>
            <select className="h-10 rounded-xl border border-border bg-background px-3 text-sm" value={f.priority} onChange={set("priority")}>
              <option value="normal">عادية (تذكير كل 24 ساعة)</option>
              <option value="urgent">عاجلة (تذكير كل 12 ساعة)</option>
            </select>
          </div>
          <Input placeholder="بطلب من (جهة خارج الشركة — اختياري)" value={f.requested_by_external} onChange={set("requested_by_external")} />
          <Input placeholder="الموقع (عنوان أو إحداثيات 24.71, 46.67)" value={f.location_text} onChange={set("location_text")} />
          <div className="grid grid-cols-2 gap-2">
            <label className="text-xs text-muted-foreground">الموعد النهائي<Input type="datetime-local" value={f.due_at} onChange={set("due_at")} /></label>
            <label className="text-xs text-muted-foreground">صورة (اختياري)<Input type="file" accept="image/*" onChange={(e) => setPhoto(e.target.files?.[0] ?? null)} /></label>
          </div>
          <Button className="w-full" disabled={busy} onClick={() => void save()}><Send /> تكليف</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
