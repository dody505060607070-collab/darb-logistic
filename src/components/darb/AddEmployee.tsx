import { useState } from 'react';
import { useServerFn } from '@tanstack/react-start';
import { useQueryClient } from '@tanstack/react-query';
import { Plus, Save } from 'lucide-react';
import { toast } from 'sonner';
import { createEmployee } from '@/lib/employees.functions';
import { ROLE_LABELS, type AppRole } from '@/lib/auth';
import { db, useRows } from '@/lib/db';
import { errMsg } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

export function AddEmployee() {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState<AppRole>('driver');
  const [workshop, setWorkshop] = useState('');
  const create = useServerFn(createEmployee);
  const qc = useQueryClient();
  const workshops = useRows(['workshops'], () => db.from('workshops').select('id,name'), open);
  async function submit(event: React.FormEvent) {
    event.preventDefault(); setBusy(true);
    try {
      await create({ data: { fullName: name, phone, role, branchId: null, workshopId: workshop || null } });
      await qc.invalidateQueries(); setOpen(false); setName(''); setPhone('');
      toast.success('تمت إضافة الموظف وتفعيل الدخول حسب وظيفته');
    } catch (error) { toast.error(errMsg(error)); } finally { setBusy(false); }
  }
  return <><Button variant="gold" onClick={() => setOpen(true)}><Plus /> إضافة موظف</Button>
    <Dialog open={open} onOpenChange={setOpen}><DialogContent dir="rtl"><DialogHeader><DialogTitle>إضافة موظف</DialogTitle></DialogHeader>
      <form onSubmit={submit} className="space-y-4">
        <div><Label htmlFor="new-employee-name">اسم الموظف</Label><Input id="new-employee-name" required value={name} onChange={e => setName(e.target.value)} /></div>
        <div><Label htmlFor="new-employee-phone">رقم الجوال</Label><Input id="new-employee-phone" required type="tel" dir="ltr" placeholder="+966" value={phone} onChange={e => setPhone(e.target.value)} /></div>
        <div><Label htmlFor="new-employee-role">الوظيفة</Label><select id="new-employee-role" className="h-10 w-full rounded-md border bg-card px-3" value={role} onChange={e => setRole(e.target.value as AppRole)}>{Object.entries(ROLE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
        {role === 'workshop' && <div><Label htmlFor="new-employee-workshop">الورشة</Label><select id="new-employee-workshop" required className="h-10 w-full rounded-md border bg-card px-3" value={workshop} onChange={e => setWorkshop(e.target.value)}><option value="">اختر الورشة</option>{(workshops.data ?? []).map(w => <option key={w.id} value={w.id}>{w.name}</option>)}</select></div>}
        <Button type="submit" variant="gold" disabled={busy}><Save /> {busy ? 'جارٍ الحفظ' : 'حفظ الموظف'}</Button>
      </form>
    </DialogContent></Dialog>
  </>;
}