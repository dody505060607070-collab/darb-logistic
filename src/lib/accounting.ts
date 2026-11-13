/** Pure accounting math (integer halalas to avoid float drift). */
export type Money = number | string | null | undefined;
const h = (v: Money) => Math.round(Number(v ?? 0) * 100);
export const toSAR = (halalas: number) => halalas / 100;

export function inMonth(date: string | null | undefined, month: string) {
  return !!date && date.slice(0, 7) === month;
}

export function monthlyPnl(input: {
  month: string;
  invoices: { issued_at: string; subtotal: Money; discount: Money; vat: Money; total: Money; status: string }[];
  payments: { paid_at: string; amount: Money }[];
  expenses: { spent_at: string; amount: Money; status: string }[];
  fuel: { filled_at: string; amount: Money; status: string }[];
  workOrders: { closed_at: string | null; parts_cost: Money; labor_cost: Money; workflow_status: string }[];
  carrier: { planned_start: string | null; carrier_cost: Money }[];
}) {
  const m = input.month;
  const inv = input.invoices.filter((i) => i.status !== "cancelled" && i.status !== "draft" && inMonth(i.issued_at, m));
  const revenue = inv.reduce((s, i) => s + h(i.subtotal) - h(i.discount), 0);
  const vatOut = inv.reduce((s, i) => s + h(i.vat), 0);
  const collected = input.payments.filter((p) => inMonth(p.paid_at, m)).reduce((s, p) => s + h(p.amount), 0);
  const expenses = input.expenses.filter((e) => e.status === "approved" && inMonth(e.spent_at, m)).reduce((s, e) => s + h(e.amount), 0);
  const fuel = input.fuel.filter((f) => f.status === "approved" && inMonth(f.filled_at, m)).reduce((s, f) => s + h(f.amount), 0);
  const maintenance = input.workOrders.filter((w) => w.workflow_status === "closed" && inMonth(w.closed_at, m)).reduce((s, w) => s + h(w.parts_cost) + h(w.labor_cost), 0);
  const carrier = input.carrier.filter((c) => inMonth(c.planned_start, m)).reduce((s, c) => s + h(c.carrier_cost), 0);
  const costs = expenses + fuel + maintenance + carrier;
  return { revenue, vatOut, collected, expenses, fuel, maintenance, carrier, costs, profit: revenue - costs, margin: revenue ? Math.round(((revenue - costs) / revenue) * 1000) / 10 : 0 };
}
