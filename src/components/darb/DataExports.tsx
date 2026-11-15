import { useState } from 'react';
import { FileSpreadsheet, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { db, type Row } from '@/lib/db';
import { displayValue, downloadSheets, type Sheet } from '@/lib/excel';
import { ASSET_KIND } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Panel } from './ui';

type Field = [header: string, key: string, pick?: (r: Row) => unknown];
type Dataset = { id: string; label: string; query: () => PromiseLike<{ data: Row[] | null; error: unknown }>; fields: Field[] };

const CATEGORY: Record<string, string> = { toll: 'رسوم طريق', parking: 'مواقف', food: 'إعاشة', loading: 'تحميل/تفريغ', repair: 'إصلاح', other: 'أخرى' };
const tripsF: Field[] = [['رقم الرحلة', 'number'], ['الحالة', 'status'], ['من', 'origin_city'], ['إلى', 'dest_city'], ['السائق', 'driver'], ['الرأس', 'tractor'], ['المقطورة', 'trailer'], ['المسافة كم', 'distance_km'], ['فارغة', 'is_empty'], ['البداية المخططة', 'planned_start'], ['النهاية المخططة', 'planned_end'], ['البداية الفعلية', 'actual_start'], ['النهاية الفعلية', 'actual_end'], ['الوزن طن', 'cargo_weight_tons']];

const DATASETS: Dataset[] = [
  { id: 'trips', label: 'الرحلات', query: () => db.from('trips').select('*, driver:drivers!trips_driver_id_fkey(full_name), tractor:assets!trips_tractor_id_fkey(code), trailer:assets!trips_trailer_id_fkey(code)').order('created_at', { ascending: false }), fields: tripsF },
  { id: 'orders', label: 'أوامر النقل', query: () => db.from('transport_orders').select('*, customer:customers(name), pickup:locations!transport_orders_pickup_location_id_fkey(name), delivery:locations!transport_orders_delivery_location_id_fkey(name)').order('created_at', { ascending: false }),
    fields: [['رقم الأمر', 'number'], ['العميل', 'customer'], ['الحالة', 'status'], ['الشاحن', 'shipper'], ['المستلم', 'consignee'], ['نوع الحمولة', 'cargo_type'], ['الكمية', 'quantity'], ['الوحدة', 'unit'], ['الوزن كجم', 'weight_kg'], ['موقع التحميل', 'pickup'], ['موقع التسليم', 'delivery'], ['موعد التحميل', 'pickup_at'], ['موعد التسليم', 'delivery_due_at'], ['السعر ر.س', 'price'], ['ملاحظات', 'notes']] },
  { id: 'invoices', label: 'الفواتير', query: () => db.from('invoices').select('*, customer:customers(name), allocs:payment_allocations(amount)').order('created_at', { ascending: false }),
    fields: [['رقم الفاتورة', 'number'], ['العميل', 'customer'], ['الحالة', 'status'], ['تاريخ الإصدار', 'issued_at'], ['تاريخ الاستحقاق', 'due_at'], ['قبل الضريبة', 'subtotal'], ['الخصم', 'discount'], ['الضريبة', 'vat'], ['الإجمالي', 'total'],
      ['المحصل', 'paid', r => (r.allocs ?? []).reduce((s: number, a: Row) => s + Number(a.amount), 0)], ['المتبقي', 'left', r => Number(r.total) - (r.allocs ?? []).reduce((s: number, a: Row) => s + Number(a.amount), 0)]] },
  { id: 'expenses', label: 'المصروفات', query: () => db.from('expenses').select('*, driver:drivers(full_name), trip:trips(number)').order('spent_at', { ascending: false }),
    fields: [['التاريخ', 'spent_at'], ['الرحلة', 'trip'], ['السائق', 'driver'], ['البند', 'category', r => CATEGORY[r.category] ?? r.category], ['المبلغ ر.س', 'amount'], ['الوصف', 'description'], ['طريقة الدفع', 'payment_method'], ['الحالة', 'status'], ['سبب الرفض', 'reject_reason']] },
  { id: 'fuel', label: 'الوقود', query: () => db.from('fuel_entries').select('*, asset:assets(code), driver:drivers(full_name), trip:trips(number)').order('filled_at', { ascending: false }),
    fields: [['التاريخ', 'filled_at'], ['المركبة', 'asset'], ['السائق', 'driver'], ['الرحلة', 'trip'], ['المحطة', 'station'], ['اللترات', 'liters'], ['سعر اللتر', 'unit_price'], ['المبلغ ر.س', 'amount'], ['العداد كم', 'odometer'], ['تعبئة كاملة', 'full_tank'], ['المصدر', 'source'], ['الحالة', 'status']] },
  { id: 'maintenance', label: 'أوامر الصيانة', query: () => db.from('work_orders').select('*, asset:assets(code)').order('opened_at', { ascending: false }),
    fields: [['رقم الأمر', 'number'], ['المركبة', 'asset'], ['الوصف', 'description'], ['الحالة', 'workflow_status'], ['الأولوية', 'severity'], ['الورشة', 'workshop'], ['الفتح', 'opened_at'], ['الإغلاق', 'closed_at'], ['العمالة ر.س', 'labor_cost'], ['القطع ر.س', 'parts_cost'], ['التقدير ر.س', 'estimate'], ['الميزانية المعتمدة', 'approved_budget']] },
  { id: 'drivers', label: 'السائقون', query: () => db.from('drivers').select('code,full_name,phone,national_id,nationality,license_no,license_expiry,status').order('full_name'),
    fields: [['الرمز', 'code'], ['الاسم', 'full_name'], ['الجوال', 'phone'], ['الهوية/الإقامة', 'national_id'], ['الجنسية', 'nationality'], ['رقم الرخصة', 'license_no'], ['انتهاء الرخصة', 'license_expiry'], ['الحالة', 'status']] },
  { id: 'assets', label: 'المركبات', query: () => db.from('assets').select('code,kind,plate,make_model,year,trailer_type,capacity_tons,status,odometer_km').order('code'),
    fields: [['الرمز', 'code'], ['النوع', 'kind', r => ASSET_KIND[r.kind] ?? r.kind], ['اللوحة', 'plate'], ['الطراز', 'make_model'], ['السنة', 'year'], ['نوع المقطورة', 'trailer_type'], ['الحمولة طن', 'capacity_tons'], ['الحالة', 'status'], ['العداد كم', 'odometer_km']] },
  { id: 'customers', label: 'العملاء', query: () => db.from('customers').select('name,cr_number,vat_number,contact_name,phone,city,payment_terms_days,status').order('name'),
    fields: [['العميل', 'name'], ['السجل التجاري', 'cr_number'], ['الرقم الضريبي', 'vat_number'], ['المسؤول', 'contact_name'], ['الجوال', 'phone'], ['المدينة', 'city'], ['مدة السداد بالأيام', 'payment_terms_days'], ['الحالة', 'status']] },
];

/** Convert fetched rows into readable sheet rows (dates, statuses and linked names as shown in the app). */
export function toSheet(ds: Pick<Dataset, 'label' | 'fields'>, rows: Row[]): Sheet {
  return {
    name: ds.label,
    columns: ds.fields.map(([header, key]) => ({ header, key })),
    rows: rows.map(r => Object.fromEntries(ds.fields.map(([, key, pick]) => [key, displayValue(key, pick ? pick(r) : r[key])]))),
  };
}

async function load(ds: Dataset): Promise<Sheet | null> {
  const { data, error } = await ds.query();
  if (error) return null;
  return toSheet(ds, data ?? []);
}

export function DataExports() {
  const [busy, setBusy] = useState('');
  async function run(list: Dataset[], base: string) {
    setBusy(base);
    try {
      const sheets = (await Promise.all(list.map(load)));
      const ok = sheets.filter((s): s is Sheet => !!s);
      if (!ok.length) return void toast.error('لا تملك صلاحية تنزيل هذه البيانات');
      await downloadSheets(ok, base);
      const skipped = list.filter((_, i) => !sheets[i]).map(d => d.label);
      toast.success(skipped.length ? `تم التنزيل؛ لم تُضمَّن: ${skipped.join('، ')} (خارج صلاحيتك)` : 'تم تنزيل ملف Excel');
    } catch { toast.error('تعذر إنشاء ملف Excel'); } finally { setBusy(''); }
  }
  return <Panel title="تنزيل البيانات Excel" icon={<FileSpreadsheet />} className="mb-5"
    actions={<Button size="sm" variant="gold" disabled={!!busy} onClick={() => void run(DATASETS, 'all')}>{busy === 'all' ? <Loader2 className="animate-spin" /> : <FileSpreadsheet />} كل البيانات في ملف واحد</Button>}>
    <p className="mb-3 text-xs text-muted-foreground">كل ملف بصيغة Excel الحقيقية (xlsx) ويحتوي على كل السجلات التي تملك صلاحية رؤيتها، وليس الصفحة المعروضة فقط.</p>
    <div className="flex flex-wrap gap-2">
      {DATASETS.map(d => <Button key={d.id} size="sm" variant="outline" disabled={!!busy} onClick={() => void run([d], d.id)}>{busy === d.id ? <Loader2 className="animate-spin" /> : <FileSpreadsheet />} {d.label}</Button>)}
    </div>
  </Panel>;
}
