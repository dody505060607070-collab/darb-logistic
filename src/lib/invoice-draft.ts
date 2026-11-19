/** Pure maths for the manual invoice editor; mirrors invoice_recalc in the database (integer halalas). */
export type DraftLine = { key: string; trip_id?: string | null; description: string; amount: string };

const h = (v: unknown) => Math.round(Number(v || 0) * 100);

export function draftTotals(lines: DraftLine[], discount: string | number, vatRate: number) {
  const subtotal = lines.reduce((s, l) => s + h(l.amount), 0);
  const disc = h(discount);
  const net = subtotal - disc;
  const vat = Math.round((net * vatRate) / 100);
  return { subtotal: subtotal / 100, discount: disc / 100, vat: vat / 100, total: (net + vat) / 100 };
}

/** First problem that would stop saving, in plain Arabic; null when the draft can be saved. */
export function draftProblem(customerId: string, lines: DraftLine[], discount: string | number): string | null {
  if (!customerId) return "اختر العميل";
  if (!lines.length) return "أضف بندًا واحدًا على الأقل";
  if (lines.some((l) => !l.description.trim())) return "اكتب وصف كل بند";
  if (lines.some((l) => !(Number(l.amount) > 0))) return "مبلغ كل بند يجب أن يكون أكبر من صفر";
  if (Number(discount || 0) < 0) return "الخصم لا يكون بالسالب";
  if (h(discount) > lines.reduce((s, l) => s + h(l.amount), 0)) return "الخصم أكبر من قيمة الفاتورة";
  return null;
}
