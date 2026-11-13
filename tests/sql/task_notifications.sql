-- Acceptance test: final exception rolls fixtures back. Never sends external messages.
DO $$
DECLARE u uuid; other_uid uuid; urgent_id uuid; normal_id uuid; notification_id uuid; n integer; notes text:='';
BEGIN
 SELECT user_id INTO u FROM public.user_roles WHERE role='owner' LIMIT 1;
 SELECT user_id INTO other_uid FROM public.user_roles WHERE role='owner' AND user_id<>u LIMIT 1;
 IF u IS NULL OR other_uid IS NULL THEN RAISE EXCEPTION 'Two existing managers are needed for rollback-only checks'; END IF;
 INSERT INTO public.tasks(title,priority,assignee_id,assigned_by) VALUES('rollback reminder urgent','urgent',other_uid,u) RETURNING id INTO urgent_id;
 INSERT INTO public.tasks(title,priority,assignee_id,assigned_by) VALUES('rollback reminder normal','normal',other_uid,u) RETURNING id INTO normal_id;
 IF NOT EXISTS(SELECT 1 FROM public.tasks WHERE id=urgent_id AND next_reminder_at=created_at+interval '12 hours') THEN RAISE EXCEPTION 'Urgent first reminder failed'; END IF;
 notes:=notes||'urgent12:OK ';
 IF NOT EXISTS(SELECT 1 FROM public.tasks WHERE id=normal_id AND next_reminder_at=created_at+interval '24 hours') THEN RAISE EXCEPTION 'Normal first reminder failed'; END IF;
 notes:=notes||'normal24:OK ';
 SELECT id INTO notification_id FROM public.task_notifications WHERE task_id=urgent_id AND event='assigned';
 IF notification_id IS NULL THEN RAISE EXCEPTION 'Assignment was not queued'; END IF;
 SELECT count(*) INTO n FROM public.claim_task_notification(notification_id);
 IF n<>1 THEN RAISE EXCEPTION 'First claim failed'; END IF;
 SELECT count(*) INTO n FROM public.claim_task_notification(notification_id);
 IF n<>0 THEN RAISE EXCEPTION 'Duplicate claim succeeded'; END IF;
 notes:=notes||'assignment:OK duplicate:OK ';
 UPDATE public.task_notifications SET state='accepted',provider_id='rollback-provider-id' WHERE task_id IN(urgent_id,normal_id);
 UPDATE public.tasks SET next_reminder_at=now()-interval '1 second' WHERE id=urgent_id;
 PERFORM public.enqueue_due_task_reminders();
 SELECT count(*) INTO n FROM public.task_notifications WHERE task_id=urgent_id AND event='reminder';
 IF n<>1 THEN RAISE EXCEPTION 'Due reminder missing'; END IF;
 PERFORM public.enqueue_due_task_reminders();
 SELECT count(*) INTO n FROM public.task_notifications WHERE task_id=urgent_id AND event='reminder';
 IF n<>1 THEN RAISE EXCEPTION 'Reminder duplicated'; END IF;
 notes:=notes||'due:OK repeat:OK ';
 PERFORM set_config('request.jwt.claims',json_build_object('sub',other_uid,'role','authenticated')::text,true);
 PERFORM public.task_submit(urgent_id,'done');
 IF EXISTS(SELECT 1 FROM public.task_notifications WHERE task_id=urgent_id AND event='reminder' AND state='pending') THEN RAISE EXCEPTION 'Submitted reminder still pending'; END IF;
 notes:=notes||'stop_on_submit:OK ';
 BEGIN
  PERFORM public.task_review(urgent_id,true,'');
  RAISE EXCEPTION 'Self approval incorrectly allowed';
 EXCEPTION WHEN others THEN
  IF SQLERRM NOT LIKE '%لا يجوز%' THEN RAISE; END IF;
 END;
 notes:=notes||'no_self_review:OK ';
 PERFORM set_config('request.jwt.claims',json_build_object('sub',u,'role','authenticated')::text,true);
 PERFORM public.task_review(urgent_id,false,'return');
 IF NOT EXISTS(SELECT 1 FROM public.tasks WHERE id=urgent_id AND status='assigned' AND next_reminder_at=now()+interval '12 hours') THEN RAISE EXCEPTION 'Returned reminder cadence failed'; END IF;
 notes:=notes||'return12:OK ';
 RAISE EXCEPTION 'RESULT % — rolled back',notes;
END $$;