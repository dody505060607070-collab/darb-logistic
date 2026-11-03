import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export type AppRole =
  | "owner"
  | "ops_manager"
  | "dispatcher"
  | "fleet_supervisor"
  | "accountant"
  | "maintenance"
  | "driver";

export const ROLE_LABELS: Record<AppRole, string> = {
  owner: "مالك",
  ops_manager: "مدير تشغيل",
  dispatcher: "موظف حركة",
  fleet_supervisor: "مشرف أسطول",
  accountant: "محاسب",
  maintenance: "مسؤول صيانة",
  driver: "سائق",
};

type AuthState = {
  ready: boolean;
  session: Session | null;
  roles: AppRole[];
  fullName: string;
  driverId: string | null;
  can: (...roles: AppRole[]) => boolean;
  isStaff: boolean;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
};

const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [fullName, setFullName] = useState("");
  const [driverId, setDriverId] = useState<string | null>(null);

  async function load(s: Session | null) {
    setSession(s);
    if (!s) {
      setRoles([]);
      setFullName("");
      setDriverId(null);
      setReady(true);
      return;
    }
    const uid = s.user.id;
    const [r, p, d] = await Promise.all([
      supabase.from("user_roles").select("role").eq("user_id", uid),
      supabase.from("profiles").select("full_name").eq("id", uid).maybeSingle(),
      supabase.from("drivers").select("id").eq("user_id", uid).maybeSingle(),
    ]);
    setRoles(((r.data ?? []) as { role: AppRole }[]).map((x) => x.role));
    setFullName(p.data?.full_name ?? s.user.email ?? "");
    setDriverId(d.data?.id ?? null);
    setReady(true);
  }

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setTimeout(() => void load(s), 0);
    });
    void supabase.auth.getSession().then(({ data }) => load(data.session));
    return () => sub.subscription.unsubscribe();
  }, []);

  const value: AuthState = {
    ready,
    session,
    roles,
    fullName,
    driverId,
    isStaff: roles.some((r) => r !== "driver"),
    can: (...rs) => roles.includes("owner") || rs.some((r) => roles.includes(r)),
    refresh: () => load(session),
    signOut: async () => {
      await supabase.auth.signOut();
      try {
        localStorage.removeItem("darb-driver-outbox");
      } catch {
        /* ignore */
      }
    },
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAuth outside AuthProvider");
  return v;
}
