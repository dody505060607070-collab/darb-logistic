import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AppShell } from "@/components/darb/AppShell";
import { PageHeader, Panel, Status } from "@/components/darb/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { db } from "@/lib/db";
import { useAuth, ROLE_LABELS, type AppRole } from "@/lib/auth";
import { errMsg, fmtDate } from "@/lib/format";
import { updateMyPhone } from "@/lib/my-account.functions";

export const Route = createFileRoute("/my-account")({
  head: () => ({
    meta: [
      { title: "حسابي | Shata" },
      { name: "description", content: "بياناتك الشخصية ووظيفتك ورقم جوالك ومستنداتك في نظام Shata." },
      { property: "og:title", content: "حسابي | Shata" },
      { property: "og:description", content: "عرض بيانات الحساب وتغيير رقم الجوال." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <AppShell staffOnly={false}>
      <MyAccount />
    </AppShell>
  ),
});

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return <div className="flex justify-between gap-3 border-b py-2 text-sm last:border-0"><span className="text-muted-foreground">{k}</span><span className="font-medium">{v || "—"}</span></div>;
}

function MyAccount() {
  const auth = useAuth();
  const uid = auth.session?.user.id ?? "";
  const qc = useQueryClient();
  const save = useServerFn(updateMyPhone);
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const profile = useQuery({ queryKey: ["my-account", uid], enabled: !!uid, queryFn: async () => {
    const [p, r, d] = await Promise.all([
      db.from("profiles").select("full_name,phone,created_at,branch:branches(name)").eq("id", uid).maybeSingle(),
      db.from("user_roles").select("role").eq("user_id", uid),
      db.from("drivers").select("code,national_id,nationality,license_no,license_expiry,status").eq("user_id", uid).maybeSingle(),
    ]);
    if (p.error) throw p.error;
    return { p: p.data as any, roles: (r.data ?? []).map((x: any) => x.role as AppRole), d: d.data as any };
  } });
  const docs = useQuery({ queryKey: ["my-account-docs", uid, auth.driverId], enabled: !!uid, queryFn: async () => {
    const e = auth.driverId ? ["driver", auth.driverId] : ["employee", uid];
    const { data } = await db.from("documents").select("id,doc_type,expiry_date,review_status").eq("entity_type", e[0]!).eq("entity_id", e[1]!);
    return data ?? [];
  } });
  useEffect(() => { if (profile.data?.p?.phone) setPhone(profile.data.p.phone); }, [profile.data?.p?.phone]);

  async function submit() {
    setBusy(true);
    try { await save({ data: { phone } }); toast.success("تم تغيير رقم الجوال. استخدمه في الدخول القادم"); await qc.invalidateQueries({ queryKey: ["my-account"] }); }
    catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  }
  const x = profile.data;
  const missing: string[] = [];
  if (x && !x.p?.phone) missing.push("رقم الجوال");
  if (x?.d) { if (!x.d.national_id) missing.push("رقم الهوية / الإقامة"); if (!x.d.license_no) missing.push("رقم رخصة القيادة"); if (!x.d.license_expiry) missing.push("تاريخ انتهاء الرخصة"); }

  return (
    <div className="space-y-4">
      <PageHeader title="حسابي" subtitle="بياناتك في النظام، ويمكنك تغيير رقم جوالك بنفسك" />
      {profile.error && <p role="alert" className="text-sm text-danger">{errMsg(profile.error)}</p>}
      {missing.length > 0 && <div role="status" className="rounded-xl border border-warning/40 bg-warning/10 p-3 text-sm">ينقص ملفك: {missing.join("، ")}. <Link to="/my-documents" className="font-semibold underline">ارفع المستندات الناقصة</Link></div>}
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="بياناتي">
          <Row k="الاسم" v={x?.p?.full_name ?? auth.fullName} />
          <Row k="الوظيفة" v={((x?.roles ?? []) as AppRole[]).map((r: AppRole) => ROLE_LABELS[r] ?? r).join("، ")} />
          <Row k="الفرع" v={x?.p?.branch?.name} />
          <Row k="رقم الجوال" v={<span dir="ltr">{x?.p?.phone}</span>} />
          <Row k="تاريخ التسجيل" v={fmtDate(x?.p?.created_at)} />
          {x?.d && <>
            <Row k="رقم ملف السائق" v={x.d.code} />
            <Row k="الهوية / الإقامة" v={x.d.national_id} />
            <Row k="الجنسية" v={x.d.nationality} />
            <Row k="رقم الرخصة" v={x.d.license_no} />
            <Row k="انتهاء الرخصة" v={fmtDate(x.d.license_expiry)} />
          </>}
        </Panel>
        <Panel title="تغيير رقم الجوال">
          <p className="mb-2 text-xs text-muted-foreground">هذا الرقم هو الذي تدخل به النظام وتصلك عليه رسائل واتساب.</p>
          <div className="flex gap-2">
            <Input dir="ltr" aria-label="رقم الجوال الجديد" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="05XXXXXXXX" />
            <Button disabled={busy || !phone} onClick={() => void submit()}>{busy ? "جارٍ الحفظ…" : "حفظ الرقم"}</Button>
          </div>
        </Panel>
        <Panel title="مستنداتي">
          {(docs.data ?? []).length === 0 ? <p className="text-sm text-muted-foreground">لا توجد مستندات بعد.</p> : docs.data!.map((d: any) => (
            <div key={d.id} className="flex items-center justify-between border-b py-2 text-sm last:border-0"><span>{d.doc_type}</span><span className="flex items-center gap-2 text-xs">{fmtDate(d.expiry_date)}<Status kind="review" value={d.review_status} /></span></div>
          ))}
          <Link to="/my-documents" className="mt-2 inline-block text-sm font-semibold text-primary underline">رفع مستند</Link>
        </Panel>
      </div>
    </div>
  );
}
