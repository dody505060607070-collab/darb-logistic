import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Pencil, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/lib/auth';
import { db, type Row } from '@/lib/db';
import { errMsg } from '@/lib/format';
import { canDeleteWorkOrder, canEditWorkOrder } from '@/lib/maintenance-flow';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { DeleteConfirmation } from './DeleteConfirmation';

/** Edit or delete a maintenance order; the database repeats every check (roles, stage, costs). */
export function WorkOrderControls({ order, onDone }: { order: Row; onDone: () => void }) {
  const auth = useAuth(); const qc = useQueryClient();
  const who = { manager: auth.can('maintenance', 'ops_manager'), mine: order.requested_by === auth.session?.user.id };
  const [editing, setEditing] = useState(false); const [del, setDel] = useState(false); const [busy, setBusy] = useState(false);
  const [description, setDescription] = useState(order.description ?? ''); const [severity, setSeverity] = useState(order.severity ?? 'normal');
  const canEdit = canEditWorkOrder(order.workflow_status, who); const canDelete = canDeleteWorkOrder(order.workflow_status, who);
  if (!canEdit && !canDelete) return null;
  async function save() {
    setBusy(true);
    try { const { error } = await db.rpc('work_order_edit', { p_id: order.id, p_description: description, p_severity: severity, p_expected_at: order.expected_at ?? null }); if (error) throw error; await qc.invalidateQueries(); toast.success('تم تعديل البلاغ'); setEditing(false); onDone(); }
    catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  }
  async function remove() {
    setBusy(true);
    try { const { error } = await db.rpc('work_order_delete', { p_id: order.id }); if (error) throw error; await qc.invalidateQueries(); toast.success('تم حذف أمر الصيانة'); setDel(false); onDone(); }
    catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  }
  return <div className="space-y-3 rounded-2xl border p-3">
    <div className="flex flex-wrap gap-2">
      {canEdit && <Button size="sm" variant="outline" onClick={() => setEditing(v => !v)}><Pencil /> تعديل البلاغ</Button>}
      {canDelete && <Button size="sm" variant="outline" className="text-danger" onClick={() => setDel(true)}><Trash2 /> حذف الأمر</Button>}
    </div>
    {editing && <div className="space-y-2">
      <Label htmlFor={`wo-desc-${order.id}`}>وصف العطل</Label><Textarea id={`wo-desc-${order.id}`} value={description} onChange={e => setDescription(e.target.value)} />
      <Label htmlFor={`wo-sev-${order.id}`}>الخطورة</Label>
      <select id={`wo-sev-${order.id}`} className="h-10 w-full rounded-full border bg-card px-3" value={severity} onChange={e => setSeverity(e.target.value)}><option value="normal">عادية</option><option value="urgent">عاجلة</option><option value="critical">حرجة</option></select>
      <p className="text-xs text-muted-foreground">تغيير الخطورة لا يوقف المركبة أو يشغّلها تلقائيًا.</p>
      <Button size="sm" disabled={busy || description.trim().length < 5} onClick={() => void save()}>حفظ التعديل</Button>
    </div>}
    <DeleteConfirmation open={del} onOpenChange={setDel} title={`حذف ${order.number ?? 'أمر الصيانة'}؟`} description="يُحذف الأمر وتنبيهاته. الأوامر التي بدأ إصلاحها أو عليها تكاليف أو قطع لا تُحذف؛ استخدم الرفض أو الإغلاق. حالة المركبة لا تتغير تلقائيًا." busy={busy} onConfirm={() => void remove()} />
  </div>;
}
