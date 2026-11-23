import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { KeyRound } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/darb/ui";
import { activateDriverLogin } from "@/lib/driver-access.functions";
import { DRIVER_LOGIN_MESSAGE } from "@/lib/driver-access";
import { errMsg } from "@/lib/format";

/** Activates a driver file's phone login and reports the outcome; quiet=true only reports problems. */
export function useActivateDriverLogin() {
  const run = useServerFn(activateDriverLogin);
  const qc = useQueryClient();
  return async (driverId: string, quiet = false) => {
    try {
      const r = await run({ data: { driverId } });
      const key = r.status === "refused" ? (r.reason ?? "no_phone") : r.status;
      if (r.status === "refused") toast.warning(DRIVER_LOGIN_MESSAGE[key] ?? "لم يُفعّل الدخول");
      else if (!quiet || r.status !== "already") toast.success(DRIVER_LOGIN_MESSAGE[key] ?? "تم");
      await Promise.all([qc.invalidateQueries({ queryKey: ["drivers"] }), qc.invalidateQueries({ queryKey: ["profiles"] }), qc.invalidateQueries({ queryKey: ["user_roles"] })]);
      return r;
    } catch (e) {
      toast.error(errMsg(e));
      return null;
    }
  };
}

export function DriverLoginStatus({ driver, canActivate }: { driver: { id: string; user_id?: string | null; phone?: string | null }; canActivate: boolean }) {
  const activate = useActivateDriverLogin();
  const [busy, setBusy] = useState(false);
  if (driver.user_id) return <Badge tone="success">مفعّل — يدخل برقم جواله</Badge>;
  if (!driver.phone) return <Badge tone="danger">لا يوجد رقم جوال</Badge>;
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <Badge tone="warning">غير مفعّل بعد</Badge>
      {canActivate && (
        <Button size="sm" variant="outline" disabled={busy} onClick={async () => { setBusy(true); await activate(driver.id); setBusy(false); }}>
          <KeyRound /> تفعيل الدخول
        </Button>
      )}
    </span>
  );
}
