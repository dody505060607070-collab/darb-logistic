import { useState } from "react";
import { Languages, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { translateText } from "@/lib/translate.functions";
import { errMsg } from "@/lib/format";

/** Shows user-written text with a one-click Arabic ⇄ English translation. */
export function TranslatableText({ text, className }: { text: string; className?: string }) {
  const [tr, setTr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const isAr = /[\u0600-\u06FF]/.test(text);
  async function go() {
    if (tr) return setTr(null);
    setBusy(true);
    try { setTr((await translateText({ data: { text, to: isAr ? "en" : "ar" } })).text); }
    catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  }
  return (
    <span className={className}>
      <span data-no-translate dir="auto">{tr ?? text}</span>
      <button type="button" onClick={() => void go()} className="ms-2 inline-flex items-center gap-1 align-middle text-xs text-muted-foreground hover:text-primary" aria-label="ترجمة">
        {busy ? <Loader2 className="size-3 animate-spin" /> : <Languages className="size-3" />}{tr ? "الأصل" : isAr ? "English" : "عربي"}
      </button>
    </span>
  );
}
