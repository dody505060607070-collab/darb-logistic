-- Rollback-only business checks. No gateway calls; all queued messages roll back.
DO $$
DECLARE u uuid; manager_uid uuid; w uuid; a uuid; request_id uuid; task_id uuid; ref uuid:=gen_random_uuid(); found_id uuid; result text:='';
BEGIN
 IF public.wa_event_roles('workshop_intake',false)<>ARRAY['maintenance']::public.app_role[] THEN RAISE EXCEPTION 'Workshop estimates must go only to maintenance'; END IF;
 IF 'owner'::public.app_role=ANY(public.wa_event_roles('trip_status',false)) THEN RAISE EXCEPTION 'Routine departures must not go to executive'; END IF;
 IF NOT 'fleet_supervisor'::public.app_role=ANY(public.wa_event_roles('trip_status',false)) THEN RAISE EXCEPTION 'Departure missing fleet supervisor'; END IF;
 IF public.wa_event_roles('expense',false)<>ARRAY['accountant']::public.app_role[] THEN RAISE EXCEPTION 'Financial requests must go to accounting'; END IF;
 IF NOT 'owner'::public.app_role=ANY(public.wa_event_roles('incident',true)) THEN RAISE EXCEPTION 'Major accident missing executive escalation'; END IF;
 IF 'owner'::public.app_role=ANY(public.wa_event_roles('incident',false)) THEN RAISE EXCEPTION 'Noncritical accident escalated to executive'; END IF;
 result:='routing:6 OK ';
 SELECT id INTO u FROM public.profiles WHERE id IN(SELECT user_id FROM public.user_roles WHERE role='workshop') LIMIT 1;
 SELECT user_id INTO manager_uid FROM public.user_roles WHERE role='owner' AND user_id IS DISTINCT FROM u LIMIT 1;
 IF u IS NULL OR manager_uid IS NULL THEN RAISE EXCEPTION 'Workshop and reviewer accounts required'; END IF;
 INSERT INTO public.tasks(title,priority,assignee_id,assigned_by) VALUES('rollback-only routing task','normal',u,manager_uid) RETURNING id INTO task_id;
 PERFORM public.enqueue_task_event(t,'submitted') FROM public.tasks t WHERE id=task_id;
 IF (SELECT count(*) FROM public.task_notifications WHERE task_notifications.task_id=task_id AND event='submitted')<>1 OR NOT EXISTS(SELECT 1 FROM public.task_notifications WHERE task_notifications.task_id=task_id AND event='submitted' AND recipient_id=manager_uid) THEN RAISE EXCEPTION 'Task submission must notify only its assigner'; END IF;
 INSERT INTO public.workshops(name) VALUES('rollback-only workshop intake') RETURNING id INTO w;
 INSERT INTO public.workshop_members(workshop_id,user_id) VALUES(w,u);
 INSERT INTO public.assets(code,kind,plate) VALUES('CHECK-'||substr(ref::text,1,8),'tractor','CHECK-'||substr(ref::text,1,8)) RETURNING id INTO a;
 PERFORM set_config('request.jwt.claims',json_build_object('sub',u,'role','authenticated')::text,true);
 SELECT id INTO found_id FROM public.workshop_find_vehicle('CHECK-'||substr(ref::text,1,8));
 IF found_id IS DISTINCT FROM a THEN RAISE EXCEPTION 'Exact vehicle lookup failed'; END IF;
 request_id:=public.workshop_intake(ref,w,a,'rollback problem description','diagnosis test','normal',500,200,'{}',12345);
 IF NOT EXISTS(SELECT 1 FROM public.work_orders WHERE id=request_id AND workshop_id=w AND requested_by=u AND workflow_status='review' AND estimate=700 AND labor_cost=200) THEN RAISE EXCEPTION 'Intake not pending with correct 700 estimate'; END IF;
 IF public.workshop_intake(ref,w,a,'rollback problem description','diagnosis test','normal',500,200,'{}',12345)<>request_id THEN RAISE EXCEPTION 'Retry created duplicate'; END IF;
 BEGIN
  PERFORM public.maintenance_transition(request_id,'repairing');
  RAISE EXCEPTION 'Work started before approval';
 EXCEPTION WHEN others THEN IF SQLERRM NOT LIKE '%انتقال غير مسموح%' THEN RAISE; END IF; END;
 BEGIN
  PERFORM public.maintenance_transition(request_id,'approved',NULL,NULL,NULL,700);
  RAISE EXCEPTION 'Workshop approved its own request';
 EXCEPTION WHEN others THEN IF SQLERRM NOT LIKE '%مسؤول الصيانة%' THEN RAISE; END IF; END;
 PERFORM set_config('request.jwt.claims',json_build_object('sub',manager_uid,'role','authenticated')::text,true);
 PERFORM public.maintenance_transition(request_id,'approved',NULL,NULL,NULL,700);
 IF NOT EXISTS(SELECT 1 FROM public.work_orders WHERE id=request_id AND workflow_status='assigned' AND workshop_id=w AND approved_budget=700) THEN RAISE EXCEPTION 'Approval did not return assignment to originating workshop'; END IF;
 result:=result||'lookup:OK pending700:OK retry:OK no_work_before_approval:OK no_self_approval:OK approved_assignment:OK';
 RAISE EXCEPTION 'RESULT % — all fixtures rolled back',result;
END $$;