CREATE TABLE public.person_intakes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by uuid NOT NULL DEFAULT auth.uid(),
  full_name text,
  phone text,
  person_type text NOT NULL DEFAULT 'driver' CHECK (person_type IN ('driver','employee')),
  role text NOT NULL DEFAULT 'driver',
  extracted jsonb NOT NULL DEFAULT '{}'::jsonb,
  file_paths text[] NOT NULL DEFAULT '{}',
  missing text[] NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','awaiting_documents','completed')),
  notified_at timestamptz,
  completed_user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.person_intakes TO authenticated;
GRANT ALL ON public.person_intakes TO service_role;
ALTER TABLE public.person_intakes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner reads intakes" ON public.person_intakes FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'owner'));
CREATE POLICY "owner adds intakes" ON public.person_intakes FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'owner') AND created_by = auth.uid());
CREATE POLICY "owner edits open intakes" ON public.person_intakes FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'owner') AND status <> 'completed') WITH CHECK (public.has_role(auth.uid(), 'owner') AND status <> 'completed');
CREATE POLICY "owner removes open intakes" ON public.person_intakes FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'owner') AND status <> 'completed');
CREATE INDEX person_intakes_status_idx ON public.person_intakes (status, created_at DESC);
CREATE OR REPLACE FUNCTION public.person_intakes_touch() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END $$;
REVOKE EXECUTE ON FUNCTION public.person_intakes_touch() FROM PUBLIC, anon;
CREATE TRIGGER person_intakes_touch BEFORE UPDATE ON public.person_intakes FOR EACH ROW EXECUTE FUNCTION public.person_intakes_touch();