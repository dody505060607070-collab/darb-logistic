import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { errMsg } from "./format";
import { validateAttachment } from './files';

// Loosely-typed handle: tables are many and screens build dynamic selects.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const db = supabase as any;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Row = Record<string, any>;

export function useRows<T = Row>(key: unknown[], fn: () => Promise<{ data: unknown; error: unknown }>, enabled = true) {
  return useQuery({
    queryKey: key,
    enabled,
    queryFn: async () => {
      const { data, error } = await fn();
      if (error) throw error;
      return (data ?? []) as T[];
    },
  });
}

export function useOne<T = Row>(key: unknown[], fn: () => Promise<{ data: unknown; error: unknown }>, enabled = true) {
  return useQuery({
    queryKey: key,
    enabled,
    queryFn: async () => {
      const { data, error } = await fn();
      if (error) throw error;
      return (data ?? null) as T | null;
    },
  });
}

export function useAction<A>(fn: (a: A) => Promise<unknown>, opts: { success?: string; invalidate?: string[] } = {}) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (a: A) => {
      const res = (await fn(a)) as { error?: unknown; data?: unknown } | undefined;
      if (res && typeof res === "object" && "error" in res && res.error) throw res.error;
      return res?.data;
    },
    onSuccess: () => {
      if (opts.success) toast.success(opts.success);
      (opts.invalidate ?? []).forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
      if (!opts.invalidate) qc.invalidateQueries();
    },
    onError: (e) => toast.error(errMsg(e)),
  });
}

export async function uploadFile(file: File, folder: string) {
  validateAttachment(file);
  const { data: u } = await supabase.auth.getUser();
  if(!u.user)throw new Error('سجل الدخول لرفع الملفات');
  const path = `${u.user.id}/${folder}/${crypto.randomUUID()}-${file.name.replace(/[^\w.\-]/g, "_")}`;
  const { error } = await supabase.storage.from("attachments").upload(path, file);
  if (error) throw error;
  return path;
}

export async function signedUrl(path: string) {
  const { data, error } = await supabase.storage.from("attachments").createSignedUrl(path, 300);
  if (error) throw error;
  return data.signedUrl;
}
