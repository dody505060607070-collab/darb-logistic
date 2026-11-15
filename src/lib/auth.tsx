import { useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { AuthContext } from './auth-context';

export type AppRole =
  | "owner"
  | "ops_manager"
  | "dispatcher"
  | "fleet_supervisor"
  | "accountant"
  | "maintenance"
  | "field_maintenance"
  | "workshop"
  | "representative"
  | "driver";

/** Representative is a field sales job (customers, places, transport requests), separate from driver. */
export const ASSIGNABLE_ROLES = ["owner", "ops_manager", "dispatcher", "fleet_supervisor", "accountant", "maintenance", "field_maintenance", "workshop", "driver", "representative"] as const satisfies readonly AppRole[];

export const ROLE_LABELS: Record<AppRole, string> = {
  owner: "مالك",
  ops_manager: "مدير تشغيل",
  dispatcher: "موظف حركة",
  fleet_supervisor: "مشرف أسطول",
  accountant: "محاسب",
  maintenance: "مسؤول صيانة",
  field_maintenance: "صيانة ميدانية",
  workshop: "الورشة",
  representative: "مندوب",
  driver: "سائق",
};

export type AuthState = {
  ready: boolean;
  session: Session | null;
  roles: AppRole[];
  fullName: string;
  driverId: string | null;
  can: (...roles: AppRole[]) => boolean;
  isStaff: boolean;
  refresh: () => Promise<void>;
  isSuperAdmin: boolean;
  viewAs: AppRole | null;
  setViewAs: (r: AppRole | null) => void;
  signOut: () => Promise<void>;
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [fullName, setFullName] = useState("");
  const [driverId, setDriverId] = useState<string | null>(null);
  const [viewAs, setViewAsState] = useState<AppRole | null>(null);
  useEffect(() => {
    try { const v = sessionStorage.getItem("darb-view-as"); if (v) setViewAsState(v as AppRole); } catch { /* ignore */ }
  }, []);
  function setViewAs(r: AppRole | null) {
    setViewAsState(r);
    try { if (r) sessionStorage.setItem("darb-view-as", r); else sessionStorage.removeItem("darb-view-as"); } catch { /* ignore */ }
  }

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
      supabase.from("profiles").select("full_name,phone").eq("id", uid).maybeSingle(),
      supabase.from("drivers").select("id").eq("user_id", uid).maybeSingle(),
    ]);
    setRoles(((r.data ?? []) as { role: AppRole }[]).map((x) => x.role));
    setFullName(p.data?.full_name || p.data?.phone || s.user.phone || "موظف");
    setDriverId(d.data?.id ?? null);
    setReady(true);
  }

  const queryClient = useQueryClient();
  const lastUser = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      // Never show one account's cached rows to the next account on this device.
      const uid = s?.user.id ?? null;
      if (lastUser.current !== undefined && lastUser.current !== uid) queryClient.clear();
      lastUser.current = uid;
      if (_e === "SIGNED_IN" && s) {
        // one sign-in record per browser session
        try {
          if (sessionStorage.getItem("darb-signin-logged") !== s.user.id) {
            sessionStorage.setItem("darb-signin-logged", s.user.id);
            void supabase.from("activity_events").insert({ user_id: s.user.id, kind: "sign_in" });
          }
        } catch { /* ignore */ }
      }
      setTimeout(() => void load(s), 0);
    });
    void supabase.auth.getSession().then(({ data }) => load(data.session));
    return () => sub.subscription.unsubscribe();
  }, []);

  const isSuperAdmin = roles.includes("owner");
  const eff: AppRole[] = isSuperAdmin && viewAs ? [viewAs] : roles;
  const value: AuthState = {
    ready,
    session,
    roles: eff,
    isSuperAdmin,
    viewAs: isSuperAdmin ? viewAs : null,
    setViewAs,
    fullName,
    driverId,
    isStaff: eff.some((r) => !['driver','representative'].includes(r)),
    can: (...rs) => eff.includes("owner") || rs.some((r) => eff.includes(r)),
    refresh: () => load(session),
    signOut: async () => {
      if (session) await supabase.from("activity_events").insert({ user_id: session.user.id, kind: "sign_out" });
      try { sessionStorage.removeItem("darb-signin-logged"); } catch { /* ignore */ }
      await supabase.auth.signOut();
      try {
        localStorage.removeItem("darb-driver-outbox");
      } catch {
        /* ignore */
      }
    },
  };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const v = useContext(AuthContext);
  if (!v) throw new Error("useAuth outside AuthProvider");
  return v;
}
