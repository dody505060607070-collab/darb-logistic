import { describe, expect, it } from "vitest";
import { draftProblem, draftTotals } from "./invoice-draft";

const line = (amount: string, description = "نقل") => ({ key: amount, description, amount });

describe("manual invoice", () => {
  it("adds 15% VAT after the discount", () => {
    expect(draftTotals([line("1000"), line("500")], "100", 15)).toEqual({ subtotal: 1500, discount: 100, vat: 210, total: 1610 });
  });
  it("refuses a discount bigger than the lines", () => {
    expect(draftProblem("c1", [line("100")], "150")).toBe("الخصم أكبر من قيمة الفاتورة");
  });
  it("refuses a zero line and a missing customer", () => {
    expect(draftProblem("c1", [line("0")], "0")).toBe("مبلغ كل بند يجب أن يكون أكبر من صفر");
    expect(draftProblem("", [line("100")], "0")).toBe("اختر العميل");
  });
});
