CREATE TABLE public.chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id uuid NOT NULL DEFAULT auth.uid(),
  sender_name text NOT NULL DEFAULT '',
  recipient_id uuid,
  body text NOT NULL CHECK (length(body) BETWEEN 1 AND 4000),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX chat_messages_pair_idx ON public.chat_messages (sender_id, recipient_id, created_at);
GRANT SELECT, INSERT ON public.chat_messages TO authenticated;
GRANT ALL ON public.chat_messages TO service_role;
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "chat read" ON public.chat_messages FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = auth.uid())
  AND (recipient_id IS NULL OR sender_id = auth.uid() OR recipient_id = auth.uid()));
CREATE POLICY "chat send" ON public.chat_messages FOR INSERT TO authenticated
WITH CHECK (sender_id = auth.uid() AND EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = auth.uid()));

CREATE OR REPLACE FUNCTION public.chat_directory()
RETURNS TABLE(id uuid, full_name text, role text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.id, coalesce(nullif(p.full_name,''),'مستخدم'), min(r.role::text)
  FROM public.profiles p JOIN public.user_roles r ON r.user_id = p.id
  WHERE EXISTS (SELECT 1 FROM public.user_roles me WHERE me.user_id = auth.uid())
  GROUP BY p.id, p.full_name
$$;
REVOKE EXECUTE ON FUNCTION public.chat_directory() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.chat_directory() TO authenticated;

ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_messages;