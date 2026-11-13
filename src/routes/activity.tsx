import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Activity, Bot, Loader2, LogIn, LogOut, PenLine } from "lucide-react";
import { AppShell } from "@/components/darb/AppShell";
import { Badge, Empty, Kpi, PageHeader, Panel } from "@/components/darb/ui";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { db } from "@/lib/db";
import { errMsg, fmtDateTime, fmtTime } from "@/lib/format";
import { WhatsAppGatewayPanel } from "@/components/darb/WhatsAppGatewayPanel";
import { runDailyReportNow } from "@/lib/ai-report.functions";

export const Route = createFileRoute("/activity")({
  head: () => ({
    meta: [
      { title: "متابعة النشاط — Shata" },
      { name: "description", content: "من دخل ومتى، وماذا عمل كل موظف اليوم، مع تقرير الذكاء الاصطناعي الصباحي." },
      { property: "og:title", content: "متابعة النشاط — Shata" },
      { property: "og:description", content: "نشاط الفريق اليومي والتقرير الصباحي." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <AppShell>
      <ActivityPage />
    </AppShell>
  ),
});

const TABLE_AR: Record<string, string> = {
  trips: "الرحلات", transport_orders: "أوامر النقل", expenses: "المصروفات", invoices: "الفواتير", payments: "التحصيلات",
  work_orders: "أوامر الصيانة", fuel_entries: "الوقود", incidents: "الحوادث", custody: "العهد", inspections: "الفحوصات",
  tasks: "المهام", pods: "إثبات التسليم", trip_events: "أحداث الرحلات", documents: "المستندات", assets: "الأصول", drivers: "السائقون",
};
const ACT_AR: Record<string, string> = { INSERT: "إضافة", UPDATE: "تعديل", DELETE: "حذف", OVERRIDE: "تجاوز" };

function ActivityPage() {
  const [day, setDay] = useState(() => new Date().toISOString().slice(0, 10));
  const from = new Date(day + "T00:00:00+03:00").toISOString();
  const to = new Date(new Date(from).getTime() + 864e5).toISOString();
  const people = useQuery({ queryKey: ["chat_directory"], queryFn: async () => ((await supabase.rpc("chat_directory")).data ?? []) as { id: string; full_name: string }[] });
  const name = (id: string | null) => people.data?.find((p) => p.id === id)?.full_name ?? "النظام";
  const ev = useQuery({ queryKey: ["activity", day], queryFn: async () => ((await db.from("activity_events").select("*").gte("at", from).lt("at", to).order("at", { ascending: false }).limit(1000)).data ?? []) as any[] }); // eslint-disable-line
  const audit = useQuery({ queryKey: ["audit", day], queryFn: async () => ((await db.from("audit_log").select("id,actor,table_name,action,at").gte("at", from).lt("at", to).order("at", { ascending: false }).limit(1000)).data ?? []) as any[] }); // eslint-disable-line

  const perUser = useMemo(() => {
    const m = new Map<string, { first?: string; last?: string; out?: string; actions: number }>();
    const g = (id: string) => m.get(id) ?? (m.set(id, { actions: 0 }), m.get(id)!);
    for (const e of ev.data ?? []) {
      const u = g(e.user_id);
      if (e.kind === "sign_in") { if (!u.first || e.at < u.first) u.first = e.at; if (!u.last || e.at > u.last) u.last = e.at; }
      if (e.kind === "sign_out" && (!u.out || e.at > u.out)) u.out = e.at;
    }
    for (const a of audit.data ?? []) if (a.actor) g(a.actor).actions++;
    return [...m.entries()].sort((a, b) => b[1].actions - a[1].actions);
  }, [ev.data, audit.data]);

  return (
    <div className="space-y-5">
      <PageHeader title="متابعة النشاط" subtitle="من دخل ومتى خرج، وماذا عمل كل شخص في اليوم." icon={<Activity />}
        actions={<input type="date" value={day} onChange={(e) => setDay(e.target.value)} className="h-10 rounded-xl border border-border bg-background px-3 text-sm" />} />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label="أشخاص نشطون" value={perUser.length} tone="info" />
        <Kpi label="مرات الدخول" value={(ev.data ?? []).filter((e) => e.kind === "sign_in").length} tone="success" />
        <Kpi label="عمليات مسجلة" value={(audit.data ?? []).length} tone="gold" />
        <Kpi label="مرات الخروج" value={(ev.data ?? []).filter((e) => e.kind === "sign_out").length} tone="neutral" />
      </div>
      <div className="activity-layout grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
      <div className="grid gap-4">
        <Panel title="ملخص كل شخص">
          {perUser.length === 0 ? <Empty text="لا يوجد نشاط في هذا اليوم" /> : (
            <table className="w-full text-sm"><thead><tr className="text-muted-foreground"><th className="text-right">الشخص</th><th>أول دخول</th><th>آخر خروج</th><th>عمليات</th></tr></thead>
              <tbody>{perUser.map(([id, u]) => (
                <tr key={id}><td className="py-2 font-medium">{name(id)}</td><td className="num text-center">{u.first ? fmtTime(u.first) : "—"}</td><td className="num text-center">{u.out ? fmtTime(u.out) : "—"}</td><td className="num text-center">{u.actions}</td></tr>
              ))}</tbody></table>
          )}
        </Panel>
        <Panel title="سجل اليوم">
          <div className="max-h-[480px] divide-y divide-border overflow-y-auto text-sm">
            {[...(ev.data ?? []).map((e) => ({ k: "e" + e.id, at: e.at, who: e.user_id, icon: e.kind === "sign_in" ? LogIn : LogOut, text: e.kind === "sign_in" ? "دخل النظام" : "خرج من النظام" })),
              ...(audit.data ?? []).map((a) => ({ k: "a" + a.id, at: a.at, who: a.actor, icon: PenLine, text: `${ACT_AR[a.action] ?? a.action} في ${TABLE_AR[a.table_name] ?? a.table_name}` }))]
              .sort((a, b) => (a.at < b.at ? 1 : -1)).slice(0, 300).map((r) => (
                <div key={r.k} className="flex items-center gap-2 py-2"><r.icon className="size-4 text-gold" /><b>{name(r.who)}</b><span className="flex-1 text-muted-foreground">{r.text}</span><span className="num text-xs">{fmtTime(r.at)}</span></div>
              ))}
            {!(ev.data ?? []).length && !(audit.data ?? []).length && <Empty text="لا يوجد نشاط" />}
          </div>
        </Panel>
      </div>
      <div className="space-y-5"><WhatsAppGatewayPanel /><AiReports /></div>
      </div>
    </div>
  );
}

function AiReports() {
  const qc = useQueryClient();
  const run = useServerFn(runDailyReportNow);
  const [busy, setBusy] = useState(false);
  const rep = useQuery({ queryKey: ["ai_reports"], queryFn: async () => ((await db.from("ai_reports").select("*").order("created_at", { ascending: false }).limit(7)).data ?? []) as any[] }); // eslint-disable-line
  const latest = rep.data?.[0];
  return (
    <Panel title="التقرير الصباحي بالذكاء الاصطناعي" actions={
      <Button size="sm" disabled={busy} onClick={async () => {
        setBusy(true);
        try { await run(); toast.success("تم إنشاء التقرير"); void qc.invalidateQueries({ queryKey: ["ai_reports"] }); }
        catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
      }}>{busy ? <Loader2 className="animate-spin" /> : <Bot />} أنشئ تقرير الآن</Button>}>
      <p className="mb-2 text-xs text-muted-foreground">يصل تلقائياً كل يوم الساعة 8:00 صباحاً بتوقيت الرياض. يعمل بالذكاء الاصطناعي المدمج في المنصة بدون مفتاح خارجي.</p>
      {latest ? (
        <div className="space-y-2">
          <div className="flex gap-2"><Badge tone="info">{latest.report_date}</Badge><span className="text-xs text-muted-foreground">{fmtDateTime(latest.created_at)}</span></div>
          <div className="whitespace-pre-wrap text-sm leading-7">{latest.body.replace(/\*\*/g, "").replace(/^#+\s*/gm, "")}</div>
        </div>
      ) : <Empty text="لم يُنشأ أي تقرير بعد" />}
    </Panel>
  );
}
