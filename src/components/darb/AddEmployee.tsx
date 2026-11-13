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

export function AddEmployee({ workshopMode = false }: { workshopMode?: boolean }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState<AppRole>(workshopMode ? 'workshop' : 'driver');
  const [workshop, setWorkshop] = useState('');
  const [workshopName, setWorkshopName] = useState('');
  const [newWorkshop, setNewWorkshop] = useState(workshopMode);
  const create = useServerFn(createEmployee);
  const qc = useQueryClient();
  const workshops = useRows(['workshops'], () => db.from('workshops').select('id,name'), open);
  async function submit(event: React.FormEvent) {
    event.preventDefault(); setBusy(true);
    try {
      await create({ data: { fullName: name, phone, role: workshopMode ? 'workshop' : role, branchId: null, workshopId: newWorkshop ? null : workshop || null, ...(newWorkshop && role === 'workshop' ? { workshopName } : {}) } });
      await qc.invalidateQueries(); setOpen(false); setName(''); setPhone('');
      setWorkshopName(''); setWorkshop('');toast.success(workshopMode ? 'تم حفظ الورشة وحساب الدخول برقم الجوال' : 'تمت إضافة الموظف وتفعيل الدخول حسب وظيفته');
    } catch (error) { toast.error(errMsg(error)); } finally { setBusy(false); }
  }
  return <><Button variant="gold" onClick={() => setOpen(true)}><Plus /> {workshopMode ? 'إضافة ورشة وحسابها' : 'إضافة موظف'}</Button>
    <Dialog open={open} onOpenChange={value => !busy && setOpen(value)}><DialogContent dir="rtl" className="max-h-[90svh] overflow-y-auto"><DialogHeader><DialogTitle>{workshopMode ? 'إضافة ورشة وحساب الدخول' : 'إضافة موظف'}</DialogTitle></DialogHeader>
      <form onSubmit={submit} className="space-y-4">
        {role === 'workshop' && <><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={newWorkshop} onChange={e => setNewWorkshop(e.target.checked)}/> ورشة جديدة</label>{newWorkshop ? <div><Label htmlFor="new-workshop-name">اسم الورشة</Label><Input id="new-workshop-name" required minLength={2} value={workshopName} onChange={e => setWorkshopName(e.target.value)}/></div> : <div><Label htmlFor="new-employee-workshop">الورشة الموجودة</Label><select id="new-employee-workshop" required className="h-10 w-full rounded-md border bg-card px-3" value={workshop} onChange={e => setWorkshop(e.target.value)}><option value="">اختر الورشة</option>{(workshops.data ?? []).map(w => <option key={w.id} value={w.id}>{w.name}</option>)}</select></div>}</>}
        <div><Label htmlFor="new-employee-name">{workshopMode ? 'اسم مسؤول حساب الورشة' : 'اسم الموظف'}</Label><Input id="new-employee-name" required value={name} onChange={e => setName(e.target.value)} /></div>
        <div><Label htmlFor="new-employee-phone">{workshopMode ? 'رقم الجوال للدخول وواتساب' : 'رقم الجوال'}</Label><Input id="new-employee-phone" required type="tel" dir="ltr" placeholder="+966" value={phone} onChange={e => setPhone(e.target.value)} /></div>
        {!workshopMode && <div><Label htmlFor="new-employee-role">الوظيفة</Label><select id="new-employee-role" className="h-10 w-full rounded-md border bg-card px-3" value={role} onChange={e => {setRole(e.target.value as AppRole);setNewWorkshop(false);}}>{Object.entries(ROLE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>}
        <Button type="submit" variant="gold" disabled={busy}><Save /> {busy ? 'جارٍ الحفظ' : workshopMode ? 'حفظ الورشة وحسابها' : 'حفظ الموظف'}</Button>
      </form>
    </DialogContent></Dialog>
  </>;
}