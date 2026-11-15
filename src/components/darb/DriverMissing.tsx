import { CircleAlert, CircleCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { driverMissing, type DriverFile } from "@/lib/driver-completeness";

/** Red badge in the drivers table: how many items are missing from the file. */
export function DriverMissingBadge({ driver }: { driver: DriverFile }) {
  const missing = driverMissing(driver);
  if (!missing.length) return <span className="inline-flex items-center gap-1 text-xs text-success"><CircleCheck className="size-3.5" /> مكتمل</span>;
  return (
    <span title={missing.join("، ")} className="inline-flex items-center gap-1 rounded-full border border-danger/40 bg-danger-soft px-2 py-0.5 text-xs font-semibold text-danger">
      <CircleAlert className="size-3.5" /> ناقص {missing.length}
    </span>
  );
}

/** Red box listing each missing item, with an optional button to complete the file. */
export function DriverMissingBox({ driver, onComplete, className = "" }: { driver: DriverFile; onComplete?: () => void; className?: string }) {
  const missing = driverMissing(driver);
  if (!missing.length) return null;
  return (
    <div role="alert" className={`rounded-2xl border border-danger/40 bg-danger-soft p-3 text-danger ${className}`}>
      <div className="flex items-center gap-2 text-sm font-bold"><CircleAlert className="size-4" /> ملف السائق ناقص</div>
      <ul className="mt-2 flex flex-wrap gap-1.5">
        {missing.map(m => <li key={m} className="rounded-full border border-danger/40 bg-background/70 px-2.5 py-0.5 text-xs font-semibold">{m}</li>)}
      </ul>
      {onComplete && <Button size="sm" variant="destructive" className="mt-3" onClick={onComplete}>أكمل البيانات الناقصة</Button>}
    </div>
  );
}
