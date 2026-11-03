import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Route as RouteIcon, Search, Truck, User, Users } from "lucide-react";
import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandShortcut } from "@/components/ui/command";
import { db } from "@/lib/db";
import { useAuth } from "@/lib/auth";
import { NAV } from "./AppShell";

type Hit = { id: string; label: string; sub?: string };

/** Ctrl/⌘+K global search over pages, trips, trucks, drivers and customers (RLS limits what each role sees). */
export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const nav = useNavigate();
  const auth = useAuth();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
      if (e.altKey && /^[1-9]$/.test(e.key)) {
        const items = NAV.filter((n) => !n.roles || auth.can(...n.roles));
        const it = items[Number(e.key) - 1];
        if (it) { e.preventDefault(); void nav({ to: it.to }); }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [auth, nav]);

  const { data } = useQuery({
    queryKey: ["palette"],
    enabled: open,
    staleTime: 60_000,
    queryFn: async () => {
      const [t, a, d, c] = await Promise.all([
        db.from("trips").select("id, number, origin_city, dest_city").order("created_at", { ascending: false }).limit(200),
        db.from("assets").select("id, code, plate, kind").limit(300),
        db.from("drivers").select("id, full_name, code").limit(300),
        db.from("customers").select("id, name, city").limit(300),
      ]);
      return {
        trips: (t.data ?? []).map((x: any): Hit => ({ id: x.id, label: x.number, sub: `${x.origin_city ?? ""} ← ${x.dest_city ?? ""}` })),
        assets: (a.data ?? []).map((x: any): Hit => ({ id: x.id, label: x.code, sub: x.plate })),
        drivers: (d.data ?? []).map((x: any): Hit => ({ id: x.id, label: x.full_name, sub: x.code })),
        customers: (c.data ?? []).map((x: any): Hit => ({ id: x.id, label: x.name, sub: x.city })),
      };
    },
  });

  const go = (to: string, params?: Record<string, string>) => {
    setOpen(false);
    void nav({ to, params } as never);
  };
  const pages = NAV.filter((n) => !n.roles || auth.can(...n.roles));

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="hidden h-9 min-w-56 items-center gap-2 rounded-full border bg-muted/60 px-3 text-sm text-muted-foreground transition hover:border-primary/50 md:flex"
        aria-label="بحث شامل"
      >
        <Search className="size-4" />
        <span className="flex-1 text-right">ابحث عن رحلة، شاحنة، سائق…</span>
        <kbd className="num rounded-md bg-background/60 px-1.5 text-[10px]">Ctrl K</kbd>
      </button>
      <button onClick={() => setOpen(true)} className="rounded-full p-2 hover:bg-muted md:hidden" aria-label="بحث شامل">
        <Search className="size-5" />
      </button>
      <CommandDialog open={open} onOpenChange={setOpen}>
        <div dir="rtl">
          <CommandInput placeholder="اكتب رقم رحلة أو لوحة أو اسم…" />
          <CommandList className="max-h-[60vh]">
            <CommandEmpty>لا توجد نتائج</CommandEmpty>
            <CommandGroup heading="الصفحات">
              {pages.map((p, i) => (
                <CommandItem key={p.to} value={`page ${p.label}`} onSelect={() => go(p.to)}>
                  <p.icon className="size-4" /> {p.label}
                  {i < 9 && <CommandShortcut className="num">Alt {i + 1}</CommandShortcut>}
                </CommandItem>
              ))}
            </CommandGroup>
            {!!data?.trips.length && (
              <CommandGroup heading="الرحلات">
                {data.trips.map((h: Hit) => (
                  <CommandItem key={h.id} value={`trip ${h.label} ${h.sub}`} onSelect={() => go("/trips/$id", { id: h.id })}>
                    <RouteIcon className="size-4" /> <span className="num">{h.label}</span><span className="text-xs text-muted-foreground">{h.sub}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            {!!data?.assets.length && (
              <CommandGroup heading="الأسطول">
                {data.assets.map((h: Hit) => (
                  <CommandItem key={h.id} value={`asset ${h.label} ${h.sub}`} onSelect={() => go("/fleet/$id", { id: h.id })}>
                    <Truck className="size-4" /> <span className="num">{h.label}</span><span className="text-xs text-muted-foreground">{h.sub}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            {!!data?.drivers.length && (
              <CommandGroup heading="السائقون">
                {data.drivers.map((h: Hit) => (
                  <CommandItem key={h.id} value={`driver ${h.label} ${h.sub}`} onSelect={() => go("/drivers/$id", { id: h.id })}>
                    <User className="size-4" /> {h.label}<span className="text-xs text-muted-foreground">{h.sub}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            {!!data?.customers.length && (
              <CommandGroup heading="العملاء">
                {data.customers.map((h: Hit) => (
                  <CommandItem key={h.id} value={`customer ${h.label} ${h.sub}`} onSelect={() => go("/customers")}>
                    <Users className="size-4" /> {h.label}<span className="text-xs text-muted-foreground">{h.sub}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>
        </div>
      </CommandDialog>
    </>
  );
}
