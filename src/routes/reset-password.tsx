import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Logo } from "@/components/darb/Logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/reset-password")({
  head: () => ({
    meta: [
      { title: "تعيين كلمة مرور جديدة — دَرب" },
      { name: "description", content: "تعيين كلمة مرور جديدة لحسابك في دَرب." },
      { property: "og:title", content: "تعيين كلمة مرور جديدة — دَرب" },
      { property: "og:description", content: "تعيين كلمة مرور جديدة لحسابك في دَرب." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ResetPage,
});

function ResetPage() {
  const [pw, setPw] = useState("");
  const nav = useNavigate();
  async function save(e: React.FormEvent) {
    e.preventDefault();
    const { error } = await supabase.auth.updateUser({ password: pw });
    if (error) return void toast.error(error.message);
    toast.success("تم تحديث كلمة المرور");
    void nav({ to: "/" });
  }
  return (
    <div dir="rtl" className="flex min-h-screen items-center justify-center p-4">
      <form onSubmit={save} className="panel w-full max-w-sm space-y-4 p-8">
        <Logo className="justify-center" />
        <h1 className="text-center text-lg font-bold text-primary">كلمة مرور جديدة</h1>
        <Input type="password" dir="ltr" minLength={8} required value={pw} onChange={(e) => setPw(e.target.value)} />
        <Button variant="gold" className="w-full" type="submit">
          حفظ
        </Button>
      </form>
    </div>
  );
}
