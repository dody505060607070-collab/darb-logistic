import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Pencil, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/lib/auth';
import { db } from '@/lib/db';
import { errMsg } from '@/lib/format';
import { canDeleteEntity } from '@/lib/record-controls';
import { DeleteConfirmation } from './DeleteConfirmation';

export function RecordActions({ table, id, onEdit, onDeleted }: { table: string; id: unknown; onEdit?: () => void; onDeleted?: () => void }) {
  const { can } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const deletable = canDeleteEntity(table, can('owner'), id);
  async function remove() {
    if (!deletable || typeof id !== 'string') return;
    setBusy(true);
    try {
      const { data, error } = await db.from(table).delete().eq('id', id).select('id');
      if (error) throw error;
      if (!data?.length) throw new Error('لم يتم الحذف؛ تحقق من صلاحياتك');
      await qc.invalidateQueries();
      setOpen(false);
      onDeleted?.();
      toast.success('تم حذف السجل');
    } catch (error) {
      toast.error((error as { code?: string })?.code === '23503' ? 'لا يمكن حذف سجل مرتبط بعمليات أخرى؛ عالج الارتباطات أولًا' : errMsg(error));
    } finally { setBusy(false); }
  }
  return <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
    {onEdit && <Button variant="ghost" size="icon" title="تعديل السجل" aria-label="تعديل السجل" onClick={onEdit}><Pencil className="size-4" /></Button>}
    {deletable && <Button variant="ghost" size="icon" title="حذف السجل" aria-label="حذف السجل" onClick={() => setOpen(true)}><Trash2 className="size-4 text-danger" /></Button>}
    <DeleteConfirmation open={open} onOpenChange={value => { if (!busy) setOpen(value); }} title="حذف السجل نهائيًا؟" description="لا يمكن التراجع عن الحذف. السجلات المرتبطة بعمليات أخرى قد لا تقبل الحذف." busy={busy} onConfirm={() => void remove()} />
  </div>;
}