CREATE TABLE public.tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL CHECK (length(title) BETWEEN 1 AND 200),
  description text,
  priority text NOT NULL DEFAULT 'normal' CHECK (priority IN ('urgent','normal')),
  assignee_id uuid NOT NULL,
  assigned_by uuid NOT NULL DEFAULT auth.uid(),
  requested_by_external text,
  location_text text,
  lat double precision,
  lng double precision,
  photo_path text,
  due_at timestamptz,
  status text NOT NULL DEFAULT 'assigned' CHECK (status IN ('assigned','submitted','completed','cancelled')),
  done_note text,
  submitted_at timestamptz,
  completed_at timestamptz,
  review_note text,
  next_reminder_at timestamptz NOT NULL DEFAULT now(),
  reminders_sent integer NOT NULL DEFAULT 0,
  whatsapp_status text NOT NULL DEFAULT 'not_connected',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX tasks_assignee_idx ON public.tasks (assignee_id, status);
GRANT SELECT, INSERT, UPDATE ON public.tasks TO authenticated;
GRANT ALL ON public.tasks TO service_role;
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tasks read" ON public.tasks FOR SELECT TO authenticated
USING (public.has_any_role(auth.uid(), ARRAY['owner','ops_manager']::app_role[]) OR assignee_id = auth.uid() OR assigned_by = auth.uid());
CREATE POLICY "tasks create" ON public.tasks FOR INSERT TO authenticated
WITH CHECK (assigned_by = auth.uid() AND public.has_any_role(auth.uid(), ARRAY['owner','ops_manager']::app_role[]));
CREATE POLICY "tasks manage" ON public.tasks FOR UPDATE TO authenticated
USING (public.has_any_role(auth.uid(), ARRAY['owner','ops_manager']::app_role[]));

CREATE OR REPLACE FUNCTION public.task_submit(p_id uuid, p_note text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.tasks SET status='submitted', done_note=p_note, submitted_at=now()
  WHERE id=p_id AND assignee_id=auth.uid() AND status='assigned';
  IF NOT FOUND THEN RAISE EXCEPTION 'لا يمكن تسليم هذه المهمة'; END IF;
END $$;
CREATE OR REPLACE FUNCTION public.task_review(p_id uuid, p_approve boolean, p_note text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_any_role(auth.uid(), ARRAY['owner','ops_manager']::app_role[]) THEN RAISE EXCEPTION 'غير مصرح'; END IF;
  IF p_approve THEN
    UPDATE public.tasks SET status='completed', completed_at=now(), review_note=p_note WHERE id=p_id AND status='submitted';
  ELSE
    UPDATE public.tasks SET status='assigned', review_note=p_note, submitted_at=NULL, next_reminder_at=now() WHERE id=p_id AND status='submitted';
  END IF;
  IF NOT FOUND THEN RAISE EXCEPTION 'المهمة ليست بانتظار المراجعة'; END IF;
END $$;
REVOKE EXECUTE ON FUNCTION public.task_submit(uuid,text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.task_review(uuid,boolean,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.task_submit(uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.task_review(uuid,boolean,text) TO authenticated;

CREATE TABLE public.activity_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id uuid NOT NULL DEFAULT auth.uid(),
  kind text NOT NULL CHECK (kind IN ('sign_in','sign_out','page_view')),
  detail text,
  at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX activity_events_at_idx ON public.activity_events (at DESC);
GRANT SELECT, INSERT ON public.activity_events TO authenticated;
GRANT ALL ON public.activity_events TO service_role;
ALTER TABLE public.activity_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "activity insert own" ON public.activity_events FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "activity owner read" ON public.activity_events FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'owner'));

CREATE TABLE public.ai_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_date date NOT NULL,
  body text NOT NULL,
  source text NOT NULL DEFAULT 'scheduled',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.ai_reports TO authenticated;
GRANT ALL ON public.ai_reports TO service_role;
ALTER TABLE public.ai_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ai reports read" ON public.ai_reports FOR SELECT TO authenticated USING (public.has_any_role(auth.uid(), ARRAY['owner','ops_manager']::app_role[]));

DO $$ BEGIN EXECUTE 'CREATE TRIGGER audit_tasks AFTER INSERT OR UPDATE OR DELETE ON public.tasks FOR EACH ROW EXECUTE FUNCTION public.audit_trigger()'; END $$;