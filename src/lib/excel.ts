import { STATUS, fmtDateTime } from './format';

export type SheetColumn = { header: string; key: string; width?: number };
export type Sheet = { name: string; columns: SheetColumn[]; rows: Record<string, unknown>[] };

const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;
const LABEL_KEYS = ['name', 'full_name', 'number', 'code', 'title', 'plate_no'];

/** A safe spreadsheet value: numbers stay numbers, everything else becomes plain text with invalid characters removed. */
export function xlsxCell(value: unknown): string | number {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number') return Number.isFinite(value) ? value : '';
  if (typeof value === 'boolean') return value ? 'نعم' : 'لا';
  // eslint-disable-next-line no-control-regex
  return String(value).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').slice(0, 32000);
}

/** Readable text for a table cell: dates in Riyadh time, statuses by label, linked records by name. */
export function displayValue(key: string, value: unknown): string | number {
  if (value === null || value === undefined) return '';
  if (Array.isArray(value)) return value.map(v => displayValue(key, v)).filter(Boolean).join('، ');
  if (typeof value === 'object') {
    const o = value as Record<string, unknown>;
    const k = LABEL_KEYS.find(k => o[k] !== null && o[k] !== undefined && o[k] !== '');
    return k ? xlsxCell(o[k]) : '';
  }
  if (typeof value === 'string') {
    if (ISO.test(value)) return fmtDateTime(value);
    if (key === 'status' || key.endsWith('_status')) {
      for (const group of Object.values(STATUS)) if (group[value]) return group[value][0];
    }
    if (/^-?\d+(\.\d+)?$/.test(value) && value.length < 16 && !/^0\d/.test(value)) return Number(value);
  }
  return xlsxCell(value);
}

/** Build a real .xlsx workbook (right-to-left sheets, bold header row). */
export async function buildWorkbook(sheets: Sheet[]): Promise<Blob> {
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Shata';
  wb.created = new Date();
  const used = new Set<string>();
  for (const s of sheets) {
    let name = s.name.replace(/[\\/?*[\]:]/g, ' ').slice(0, 31) || 'Sheet';
    while (used.has(name)) name = `${name.slice(0, 28)}-${used.size}`;
    used.add(name);
    const ws = wb.addWorksheet(name, { views: [{ rightToLeft: true, state: 'frozen', ySplit: 1 }] });
    ws.columns = s.columns.map(c => ({ header: c.header, key: c.key, width: c.width ?? Math.min(40, Math.max(12, c.header.length + 4)) }));
    for (const r of s.rows) ws.addRow(Object.fromEntries(s.columns.map(c => [c.key, xlsxCell(r[c.key])])));
    const head = ws.getRow(1);
    head.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    head.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF123C32' } };
    head.alignment = { vertical: 'middle', horizontal: 'right' };
    if (s.columns.length) ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: s.columns.length } };
  }
  const buf = await wb.xlsx.writeBuffer();
  return new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

export const xlsxName = (base: string) => `shata-${base}-${new Date().toISOString().slice(0, 10)}.xlsx`;

export async function downloadSheets(sheets: Sheet[], base: string) {
  downloadBlob(await buildWorkbook(sheets), xlsxName(base));
}
