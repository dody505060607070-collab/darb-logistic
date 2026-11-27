import { db } from '@/lib/db';
import { getPresentationRuntime } from '@/lib/presentation-runtime';
import { useEffect, useMemo, useRef, useState } from "react";

import { MessageSquare, Search, Send, Users } from "lucide-react";
import { PageHeader } from "@/components/darb/ui";
import { AppShell } from "@/components/darb/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { ROLE_LABELS, useAuth, type AppRole } from "@/lib/auth";
import { fmtDateTime } from "@/lib/format";

type Msg = { id: string; sender_id: string; sender_name: string; recipient_id: string | null; body: string; created_at: string };
type Person = { id: string; full_name: string; role: string };

function ChatPage() {
  const { session, fullName } = useAuth() as { session: { user: { id: string } } | null; fullName: string };
  const me = session?.user.id ?? "";
  const [people, setPeople] = useState<Person[]>([]);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [active, setActive] = useState<string | null>(null); // null = company group
  const [text, setText] = useState("");
  const [q, setQ] = useState("");
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!me) return;
    const sample = getPresentationRuntime();
    if (sample) { void sample.rpc('chat_directory').then(({ data }) => setPeople((data as Person[]).filter(p => p.id !== me))); setMsgs(sample.rows('chat_messages') as Msg[]); return; }
    void db.rpc("chat_directory").then(({ data }: { data: Person[] | null }) => setPeople((data ?? []).filter((p) => p.id !== me)));
    void db.from("chat_messages").select("*").order("created_at", { ascending: true }).limit(1000).then(({ data }: { data: Msg[] | null }) => setMsgs(data ?? []));
    const ch = supabase
      .channel(`chat-${me}-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "chat_messages" }, (p) => {
        const m = p.new as Msg;
        if (m.recipient_id && m.recipient_id !== me && m.sender_id !== me) return;
        setMsgs((cur) => (cur.some((x) => x.id === m.id) ? cur : [...cur, m]));
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
  }, [me]);

  const thread = useMemo(
    () => msgs.filter((m) => (active === null ? m.recipient_id === null : (m.sender_id === me && m.recipient_id === active) || (m.sender_id === active && m.recipient_id === me))),
    [msgs, active, me],
  );
  useEffect(() => {
    const container = endRef.current?.parentElement;
    if (container && thread.length) container.scrollTop = container.scrollHeight;
  }, [thread.length, active]);

  const last = (id: string | null) => {
    const t = msgs.filter((m) => (id === null ? m.recipient_id === null : (m.sender_id === id && m.recipient_id === me) || (m.sender_id === me && m.recipient_id === id)));
    return t[t.length - 1];
  };

  async function send() {
    const body = text.trim();
    if (!body || !me) return;
    setText("");
    const { data, error } = await db.from("chat_messages").insert({ body, recipient_id: active, sender_name: fullName || "مستخدم" }).select().single();
    if (error) { setText(body); alert("تعذّر الإرسال: " + error.message); return; }
    setMsgs((cur) => (cur.some((x) => x.id === data.id) ? cur : [...cur, data as Msg]));
  }

  const activePerson = people.find((p) => p.id === active);
  const list = people.filter((p) => p.full_name.includes(q));

  return (
    <>
    <PageHeader title="المحادثات" icon={<MessageSquare />} />
    <div className="chat-workspace grid min-w-0 gap-3 md:grid-cols-[minmax(240px,31%)_minmax(0,1fr)]">
      <aside className="chat-list flex min-h-0 min-w-0 flex-col rounded-2xl border bg-card">
        <div className="border-b p-3">
          
          <div className="relative">
            <Search className="absolute right-3 top-2.5 size-4 text-muted-foreground" />
            <Input aria-label="البحث عن شخص" value={q} onChange={(e) => setQ(e.target.value)} placeholder="ابحث عن شخص" className="pr-9" />
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          <Row title="محادثة الشركة" sub={last(null)?.body ?? "كل الموظفين والسائقين"} on={active === null} onClick={() => setActive(null)} icon={<Users className="size-5" />} />
          <div className="px-4 pb-1 pt-3 text-xs text-muted-foreground">الأشخاص</div>
          {list.map((p) => (
            <Row key={p.id} title={p.full_name} sub={last(p.id)?.body ?? ROLE_LABELS[p.role as AppRole] ?? p.role} on={active === p.id} onClick={() => setActive(p.id)} icon={<span className="text-sm font-semibold">{p.full_name.slice(0, 1)}</span>} />
          ))}
          {list.length === 0 && <p className="px-4 py-6 text-center text-sm text-muted-foreground">لا يوجد أشخاص آخرون بعد</p>}
        </div>
      </aside>
      <section className="chat-thread flex min-h-0 min-w-0 flex-col overflow-hidden rounded-2xl border bg-card">
        <header className="flex items-center gap-3 border-b p-3">
          <div className="grid size-10 place-items-center rounded-full bg-primary text-primary-foreground">{activePerson ? activePerson.full_name.slice(0, 1) : <Users className="size-5" />}</div>
          <div>
            <b>{activePerson ? activePerson.full_name : "محادثة الشركة"}</b>
            <p className="text-xs text-muted-foreground">{activePerson ? "محادثة خاصة" : `${people.length + 1} عضو`}</p>
          </div>
        </header>
        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-4">
          {thread.length === 0 && <div className="chat-empty"><MessageSquare aria-hidden /><p>لا توجد رسائل بعد — ابدأ المحادثة</p></div>}
          {thread.map((m) => {
            const mine = m.sender_id === me;
            return (
              <div key={m.id} className={`flex ${mine ? "justify-start" : "justify-end"}`}>
                <div className={`max-w-[75%] rounded-2xl px-3 py-2 text-sm ${mine ? "bg-primary text-primary-foreground" : "bg-card border"}`}>
                  {!mine && active === null && <div className="mb-0.5 text-xs font-semibold text-info">{m.sender_name}</div>}
                  <div className="whitespace-pre-wrap break-words">{m.body}</div>
                  <div className="mt-1 text-[10px] opacity-60">{fmtDateTime(m.created_at)}</div>
                </div>
              </div>
            );
          })}
          <div ref={endRef} />
        </div>
        <form className="m-3 flex gap-2 rounded-2xl border bg-background p-3" onSubmit={(e) => { e.preventDefault(); void send(); }}>
          <Input aria-label="نص الرسالة" value={text} onChange={(e) => setText(e.target.value)} placeholder="اكتب رسالة…" maxLength={4000} />
          <Button type="submit" disabled={!text.trim()} aria-label="إرسال"><Send /></Button>
        </form>
      </section>
    </div>
    </>
  );
}

function Row({ title, sub, on, onClick, icon }: { title: string; sub: string; on: boolean; onClick: () => void; icon: React.ReactNode }) {
  return (
    <Button type="button" variant="ghost" aria-pressed={on} onClick={onClick} className={`flex w-full justify-start items-center gap-3 px-4 py-3 text-right transition-colors hover:bg-muted/40 ${on ? "bg-accent" : ""}`}>
      <div className="grid size-10 shrink-0 place-items-center rounded-full bg-secondary text-secondary-foreground">{icon}</div>
      <div className="min-w-0">
        <div className="truncate font-medium">{title}</div>
        <div className="truncate text-xs text-muted-foreground">{sub}</div>
      </div>
    </Button>
  );
}

export default () => (
    <AppShell staffOnly={false}>
      <ChatPage />
    </AppShell>
  );
