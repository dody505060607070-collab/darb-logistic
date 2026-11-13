CREATE TABLE public.task_notifications (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), task_id uuid NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
 recipient_id uuid NOT NULL, event text NOT NULL CHECK(event IN ('assigned','submitted','returned','approved','reminder')),
 payload jsonb NOT NULL, state text NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','sending','accepted','failed','unresolved','cancelled')),
 provider_id text, attempts integer NOT NULL DEFAULT 0, next_attempt_at timestamptz NOT NULL DEFAULT now(), claimed_at timestamptz,
 accepted_at timestamptz, error text, created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.task_notifications TO authenticated;
GRANT ALL ON public.task_notifications TO service_role;
ALTER TABLE public.task_notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY task_notifications_read ON public.task_notifications FOR SELECT TO authenticated USING (recipient_id=auth.uid() OR public.has_any_role(auth.uid(),ARRAY['owner','ops_manager']::public.app_role[]));
CREATE INDEX task_notifications_pending ON public.task_notifications(state,next_attempt_at);
CREATE OR REPLACE FUNCTION public.enqueue_task_event(p_task public.tasks,p_event text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF p_event='submitted' THEN
  INSERT INTO public.task_notifications(task_id,recipient_id,event,payload)
  SELECT p_task.id,r.user_id,p_event,to_jsonb(p_task) FROM (SELECT user_id FROM public.user_roles WHERE role='owner' UNION SELECT p_task.assigned_by) r;
 ELSE
  INSERT INTO public.task_notifications(task_id,recipient_id,event,payload) VALUES(p_task.id,p_task.assignee_id,p_event,to_jsonb(p_task));
 END IF;
END $$;
REVOKE ALL ON FUNCTION public.enqueue_task_event(public.tasks,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_task_event(public.tasks,text) TO service_role;
CREATE OR REPLACE FUNCTION public.task_notification_trigger() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF TG_OP='INSERT' THEN
  NEW.next_reminder_at:=now()+CASE WHEN NEW.priority='urgent' THEN interval '12 hours' ELSE interval '24 hours' END;
 ELSE
  IF NEW.assignee_id IS DISTINCT FROM OLD.assignee_id OR (NEW.status='assigned' AND OLD.status='submitted') THEN
   NEW.next_reminder_at:=now()+CASE WHEN NEW.priority='urgent' THEN interval '12 hours' ELSE interval '24 hours' END;
  END IF;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.task_notification_trigger() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER task_notification_schedule BEFORE INSERT OR UPDATE ON public.tasks FOR EACH ROW EXECUTE FUNCTION public.task_notification_trigger();
CREATE OR REPLACE FUNCTION public.task_notification_enqueue_trigger() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF TG_OP='INSERT' THEN PERFORM public.enqueue_task_event(NEW,'assigned');
 ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
  UPDATE public.task_notifications SET state='cancelled' WHERE task_id=NEW.id AND state IN ('pending','failed') AND event IN ('assigned','returned','reminder');
  IF NEW.status='submitted' THEN PERFORM public.enqueue_task_event(NEW,'submitted');
  ELSIF NEW.status='completed' THEN PERFORM public.enqueue_task_event(NEW,'approved');
  ELSIF NEW.status='assigned' AND OLD.status='submitted' THEN PERFORM public.enqueue_task_event(NEW,'returned'); END IF;
 ELSIF NEW.assignee_id IS DISTINCT FROM OLD.assignee_id AND NEW.status='assigned' THEN
  UPDATE public.task_notifications SET state='cancelled' WHERE task_id=NEW.id AND state IN ('pending','failed') AND event IN ('assigned','returned','reminder');
  PERFORM public.enqueue_task_event(NEW,'assigned');
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.task_notification_enqueue_trigger() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER task_notification_enqueue AFTER INSERT OR UPDATE ON public.tasks FOR EACH ROW EXECUTE FUNCTION public.task_notification_enqueue_trigger();
UPDATE public.tasks SET next_reminder_at=created_at+CASE WHEN priority='urgent' THEN interval '12 hours' ELSE interval '24 hours' END WHERE status='assigned' AND reminders_sent=0;
CREATE OR REPLACE FUNCTION public.enqueue_due_task_reminders() RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE t public.tasks; n integer:=0;
BEGIN
 FOR t IN SELECT * FROM public.tasks WHERE status='assigned' AND next_reminder_at<=now() ORDER BY next_reminder_at LIMIT 100 FOR UPDATE SKIP LOCKED LOOP
  IF NOT EXISTS(SELECT 1 FROM public.task_notifications WHERE task_id=t.id AND event IN ('assigned','returned','reminder') AND state IN ('pending','sending','failed','unresolved')) THEN
   PERFORM public.enqueue_task_event(t,'reminder'); n:=n+1;
  END IF;
  UPDATE public.tasks SET next_reminder_at=now()+CASE WHEN priority='urgent' THEN interval '12 hours' ELSE interval '24 hours' END WHERE id=t.id;
 END LOOP;
 RETURN n;
END $$;
REVOKE ALL ON FUNCTION public.enqueue_due_task_reminders() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_due_task_reminders() TO service_role;
CREATE OR REPLACE FUNCTION public.claim_task_notification(p_id uuid) RETURNS SETOF public.task_notifications LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 RETURN QUERY UPDATE public.task_notifications SET state='sending',claimed_at=now(),attempts=attempts+1 WHERE id=p_id AND state IN ('pending','failed') AND next_attempt_at<=now() RETURNING *;
END $$;
REVOKE ALL ON FUNCTION public.claim_task_notification(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_task_notification(uuid) TO service_role;
CREATE OR REPLACE FUNCTION public.task_review(p_id uuid,p_approve boolean,p_note text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NOT public.has_any_role(auth.uid(),ARRAY['owner','ops_manager']::public.app_role[]) THEN RAISE EXCEPTION 'غير مصرح'; END IF;
 IF EXISTS(SELECT 1 FROM public.tasks WHERE id=p_id AND assignee_id=auth.uid()) THEN RAISE EXCEPTION 'لا يجوز اعتماد أو مراجعة مهمتك بنفسك'; END IF;
 IF p_approve THEN UPDATE public.tasks SET status='completed',completed_at=now(),review_note=p_note WHERE id=p_id AND status='submitted';
 ELSE UPDATE public.tasks SET status='assigned',review_note=p_note,submitted_at=NULL,next_reminder_at=now() WHERE id=p_id AND status='submitted'; END IF;
 IF NOT FOUND THEN RAISE EXCEPTION 'المهمة ليست بانتظار المراجعة'; END IF;
END $$;
REVOKE ALL ON FUNCTION public.task_review(uuid,boolean,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.task_review(uuid,boolean,text) TO authenticated,service_role;