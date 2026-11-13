export function invoiceIssues(invoice: Record<string, any>, seller: Record<string, any>) {
  const issues: string[] = [];
  if (!seller.company_name?.trim()) issues.push('اسم الشركة غير مسجل');
  if (!/^3\d{13}3$/.test(String(seller.vat_number ?? ''))) issues.push('الرقم الضريبي للشركة غير مكتمل');
  if (!seller.cr_number) issues.push('السجل التجاري غير مسجل');
  const subtotal = Number(invoice.subtotal), discount = Number(invoice.discount ?? 0), vat = Number(invoice.vat), total = Number(invoice.total);
  if (![subtotal, discount, vat, total].every(Number.isFinite) || Math.abs(subtotal - discount + vat - total) > 0.011) issues.push('الإجمالي غير مطابق لبنود الفاتورة');
  return issues;
}

const escape = (v: unknown) => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c);
const money = (v: unknown) => Number(v ?? 0).toLocaleString('ar-SA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function invoiceHtml(invoice: Record<string, any>, seller: Record<string, any>) {
  const issues = invoiceIssues(invoice, seller);
  return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>${escape(invoice.number)} — Shata</title><style>
  :root{--paper:#fff;--ink:#18342d;--edge:#dbe4df;--warning:#9c722e}*{box-sizing:border-box}body{font-family:Arial,sans-serif;color:var(--ink);background:var(--paper);margin:32px;font-size:14px;line-height:1.8}header{display:flex;justify-content:space-between;gap:24px;border-bottom:2px solid var(--edge);padding-bottom:20px}h1{font-size:24px;margin:0}table{width:100%;border-collapse:collapse;margin-top:24px}th,td{padding:10px;border-bottom:1px solid var(--edge);text-align:right}.totals{margin-inline-start:auto;max-width:320px}.notice{color:var(--warning);border:1px solid var(--edge);padding:12px}.num{direction:ltr;unicode-bidi:isolate}@page{size:A4;margin:15mm}@media print{body{margin:0}tr{break-inside:avoid}}
  </style></head><body><header><div><h1>${escape(seller.company_name || 'Shata')}</h1><div>الرقم الضريبي: ${escape(seller.vat_number || 'غير مسجل')}</div><div>السجل التجاري: ${escape(seller.cr_number || 'غير مسجل')}</div></div><div><h2>فاتورة — نسخة داخلية</h2><div>${escape(invoice.number)}</div><div>تاريخ الفاتورة: ${escape(invoice.issued_at)}</div><div>الاستحقاق: ${escape(invoice.due_at || '—')}</div></div></header>
  <h3>العميل: ${escape(invoice.customer?.name)}</h3><div>الرقم الضريبي: ${escape(invoice.customer?.vat_number || 'غير مسجل')}</div><div>السجل التجاري: ${escape(invoice.customer?.cr_number || 'غير مسجل')}</div>
  <table><thead><tr><th>#</th><th>البيان</th><th>المبلغ (ر.س)</th></tr></thead><tbody>${(invoice.lines ?? []).map((l: any, n: number) => `<tr><td>${n + 1}</td><td>${escape(l.description)}</td><td class="num">${money(l.amount)}</td></tr>`).join('')}</tbody></table>
  <table class="totals"><tbody><tr><th>قبل الضريبة</th><td>${money(invoice.subtotal)}</td></tr><tr><th>الخصم</th><td>${money(invoice.discount)}</td></tr><tr><th>ضريبة القيمة المضافة (${escape(invoice.vat_rate)}%)</th><td>${money(invoice.vat)}</td></tr><tr><th>الإجمالي (ر.س)</th><td>${money(invoice.total)}</td></tr></tbody></table>
  <p class="notice">نسخة داخلية وليست إثبات إصدار أو اعتماد من هيئة الزكاة والضريبة والجمارك.${issues.length ? `<br>${issues.map(escape).join('<br>')}` : ''}</p></body></html>`;
}