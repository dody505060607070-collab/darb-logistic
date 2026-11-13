import { useRef } from 'react';
import { Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { invoiceHtml } from '@/lib/invoice-document';

export function InvoiceDocument({ invoice, seller, onClose }: { invoice: Record<string, any>; seller: Record<string, any>; onClose: () => void }) {
  const frame = useRef<HTMLIFrameElement>(null);
  return <Dialog open onOpenChange={open => { if (!open) onClose(); }}><DialogContent dir="rtl" className="max-w-4xl"><DialogHeader><DialogTitle>فاتورة {invoice.number}</DialogTitle></DialogHeader>
    <Button variant="outline" onClick={() => { frame.current?.contentWindow?.focus(); frame.current?.contentWindow?.print(); }}><Printer /> طباعة / حفظ PDF</Button>
    <iframe ref={frame} title={`فاتورة ${invoice.number}`} srcDoc={invoiceHtml(invoice, seller)} sandbox="allow-same-origin allow-modals" className="h-[65vh] w-full rounded-lg border bg-card" />
  </DialogContent></Dialog>;
}