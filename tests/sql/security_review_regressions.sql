-- Run with a privileged test connection. Entire fixture block rolls back, including queued notices.
DO $$
DECLARE actor uuid; reviewer uuid; w uuid; a uuid; req uuid; prior text; ref uuid:=gen_random_uuid();
BEGIN
 SELECT w.user_id INTO actor FROM public.user_roles w WHERE w.role='workshop' AND NOT EXISTS (SELECT 1 FROM public.user_roles o WHERE o.user_id=w.user_id AND o.role<>'workshop') LIMIT 1;  -- workshop-only account; a workshop user who is also a manager may legitimately see roles
 SELECT user_id INTO reviewer FROM public.user_roles WHERE role='owner' AND user_id IS DISTINCT FROM actor LIMIT 1;
 IF actor IS NULL OR reviewer IS NULL THEN RAISE EXCEPTION 'A workshop-only account and a reviewer are required'; END IF;
 INSERT INTO public.workshops(name) VALUES('rollback-only security fixture') RETURNING id INTO w;
 INSERT INTO public.workshop_members(workshop_id,user_id) VALUES(w,actor);
 INSERT INTO public.assets(code,kind,plate) VALUES('SEC-'||substr(ref::text,1,8),'tractor','SEC-'||substr(ref::text,1,8)) RETURNING id INTO a;
 SELECT status INTO prior FROM public.assets WHERE id=a;
 PERFORM set_config('request.jwt.claims',json_build_object('sub',actor,'role','authenticated')::text,true);
 IF public.has_role(reviewer,'owner') OR public.has_any_role(reviewer,ARRAY['owner']::public.app_role[]) THEN RAISE EXCEPTION 'Workshop disclosed another user role'; END IF;
 IF NOT public.has_role(actor,'workshop') THEN RAISE EXCEPTION 'Own role lookup broken'; END IF;
 req:=public.workshop_intake(ref,w,a,'security fixture description','fixture diagnosis','critical',500,200,'{}',1234);
 IF (SELECT status FROM public.assets WHERE id=a) IS DISTINCT FROM prior THEN RAISE EXCEPTION 'Pending intake mutated availability'; END IF;
 IF (SELECT workflow_status FROM public.work_orders WHERE id=req)<>'review' THEN RAISE EXCEPTION 'Intake not pending'; END IF;
 PERFORM set_config('request.jwt.claims',json_build_object('sub',reviewer,'role','authenticated')::text,true);
 IF NOT public.has_role(actor,'workshop') THEN RAISE EXCEPTION 'Authorized reviewer lookup broken'; END IF;
 PERFORM public.maintenance_transition(req,'approved',NULL,NULL,NULL,700);
 IF (SELECT workflow_status FROM public.work_orders WHERE id=req)<>'assigned' THEN RAISE EXCEPTION 'Approved intake not assigned'; END IF;
 RAISE EXCEPTION 'PASS: own role, denied other role, pending availability preserved, approved assignment; all fixtures rolled back';
END $$;