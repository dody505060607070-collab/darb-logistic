import { describe, expect, it } from "vitest";
import { monthlyPnl, toSAR } from "./accounting";
const base = { invoices: [], payments: [], expenses: [], fuel: [], workOrders: [], carrier: [] };
describe("monthly P&L", () => {
  it("revenue excludes VAT, drafts and other months; discount reduces revenue", () => {
    const r = monthlyPnl({ ...base, month: "2026-11", invoices: [
      { issued_at: "2026-11-02", subtotal: 1000, discount: 100, vat: 135, total: 1035, status: "issued" },
      { issued_at: "2026-11-03", subtotal: 500, discount: 0, vat: 75, total: 575, status: "draft" },
      { issued_at: "2026-10-30", subtotal: 900, discount: 0, vat: 135, total: 1035, status: "issued" }] });
    expect(toSAR(r.revenue)).toBe(900);
    expect(toSAR(r.vatOut)).toBe(135);
  });
  it("only approved expenses/fuel and closed maintenance are costs", () => {
    const r = monthlyPnl({ ...base, month: "2026-11",
      invoices: [{ issued_at: "2026-11-01", subtotal: 1000, discount: 0, vat: 150, total: 1150, status: "paid" }],
      expenses: [{ spent_at: "2026-11-01", amount: 50.1, status: "approved" }, { spent_at: "2026-11-01", amount: 999, status: "pending" }],
      fuel: [{ filled_at: "2026-11-05", amount: 200.2, status: "approved" }],
      workOrders: [{ closed_at: "2026-11-09", parts_cost: 100, labor_cost: 50, workflow_status: "closed" }, { closed_at: null, parts_cost: 500, labor_cost: 0, workflow_status: "repairing" }] });
    expect(toSAR(r.costs)).toBe(400.3);
    expect(toSAR(r.profit)).toBe(599.7);
  });
});
