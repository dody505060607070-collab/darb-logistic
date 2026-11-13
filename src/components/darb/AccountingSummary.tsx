import { useMemo, useState } from "react";
import { Calculator } from "lucide-react";
import { Input } from "@/components/ui/input";
import { db, useRows } from "@/lib/db";
import { fmtSAR } from "@/lib/format";
import { monthlyPnl, toSAR } from "@/lib/accounting";
import { Kpi, Panel } from "./ui";

/** Automatic monthly accounting from the system's own records — no manual entry. */
export function AccountingSummary() {
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const inv = useRows(["acct", "invoices"], () => db.from("invoices").select("issued_at,subtotal,discount,vat,total,status"));
  const pay = useRows(["acct", "payments"], () => db.from("payments").select("paid_at,amount"));
  const exp = useRows(["acct", "expenses"], () => db.from("expenses").select("spent_at,amount,status,category"));
  const fuel = useRows(["acct", "fuel"], () => db.from("fuel_entries").select("filled_at,amount,status"));
  const wo = useRows(["acct", "wo"], () => db.from("work_orders").select("closed_at,parts_cost,labor_cost,workflow_status"));
  const fin = useRows(["acct", "carrier"], () => db.from("trip_financials").select("carrier_cost, trip:trips(planned_start)"));
  const ready = [inv, pay, exp, fuel, wo, fin].every((q) => q.data);
  const r = useMemo(() => ready ? monthlyPnl({
    month, invoices: inv.data as never, payments: pay.data as never, expenses: exp.data as never, fuel: fuel.data as never, workOrders: wo.data as never,
    carrier: (fin.data ?? []).map((f) => ({ planned_start: f.trip?.planned_start ?? null, carrier_cost: f.carrier_cost })),
  }) : null, [ready, month, inv.data, pay.data, exp.data, fuel.data, wo.data, fin.data]);
  const byCat = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of exp.data ?? []) if (e.status === "approved" && e.spent_at?.slice(0, 7) === month) m.set(e.category, (m.get(e.category) ?? 0) + Math.round(Number(e.amount) * 100));
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [exp.data, month]);
  const S = (v: number) => fmtSAR(toSAR(v));
  return (
    <Panel title="المحاسبة الآلية — قائمة الدخل الشهرية" icon={<Calculator />} actions={<Input type="month" className="h-8 w-40" value={month} onChange={(e) => setMonth(e.target.value)} aria-label="الشهر" />}>
      {!r ? <p className="text-sm text-muted-foreground">جارٍ الحساب…</p> : <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Kpi label="الإيرادات (بدون الضريبة)" value={S(r.revenue)} />
          <Kpi label="إجمالي التكاليف" value={S(r.costs)} />
          <Kpi label="صافي الربح" value={S(r.profit)} tone={r.profit < 0 ? "warning" : "success"} />
          <Kpi label="هامش الربح" value={`${r.margin}%`} />
        </div>
        <table className="w-full text-sm"><tbody>
          {[["إيرادات الفواتير الصادرة", r.revenue], ["مصروفات السائقين المعتمدة", -r.expenses], ["الديزل المعتمد", -r.fuel], ["الصيانة المغلقة (قطع + أجور)", -r.maintenance], ["تكلفة الناقلين", -r.carrier]].map(([k, v]) => (
            <tr key={k as string} className="border-b"><td className="py-1.5">{k}</td><td className={`num py-1.5 text-left ${Number(v) < 0 ? "text-danger" : ""}`}>{S(Number(v))}</td></tr>))}
          <tr className="font-bold"><td className="py-1.5">صافي الربح</td><td className="num py-1.5 text-left">{S(r.profit)}</td></tr>
        </tbody></table>
        <div className="grid gap-3 md:grid-cols-2 text-sm">
          <div className="rounded-lg border p-3"><b>الضريبة والتحصيل</b>
            <div className="mt-1 flex justify-between"><span>ضريبة القيمة المضافة المستحقة (مخرجات)</span><span className="num">{S(r.vatOut)}</span></div>
            <div className="flex justify-between"><span>المحصّل فعليًا هذا الشهر</span><span className="num">{S(r.collected)}</span></div></div>
          <div className="rounded-lg border p-3"><b>المصروفات حسب النوع</b>
            {byCat.length ? byCat.map(([k, v]) => <div key={k} className="flex justify-between"><span>{k}</span><span className="num">{S(v)}</span></div>) : <p className="text-muted-foreground">لا توجد مصروفات معتمدة</p>}</div>
        </div>
        <p className="text-xs text-muted-foreground">تُحسب تلقائيًا من الفواتير والدفعات والمصروفات والديزل والصيانة المعتمدة فقط. البنود غير المعتمدة لا تدخل الحساب. هذا تقرير إداري وليس إقرارًا ضريبيًا رسميًا.</p>
      </div>}
    </Panel>
  );
}
