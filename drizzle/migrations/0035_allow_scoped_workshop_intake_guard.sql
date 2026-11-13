CREATE OR REPLACE FUNCTION public.work_order_workflow_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
DECLARE fn text; trusted_intake boolean;
BEGIN
 GET DIAGNOSTICS fn=PG_CONTEXT;
 trusted_intake:=TG_OP='INSERT' AND fn LIKE '%workshop_intake(%' AND NEW.intake_ref IS NOT NULL AND NEW.workshop_id IS NOT NULL AND public.has_role(auth.uid(),'workshop') AND EXISTS(SELECT 1 FROM public.workshop_members m WHERE m.workshop_id=NEW.workshop_id AND m.user_id=auth.uid());
 IF TG_OP='UPDATE' AND (NEW.workflow_status,NEW.workshop_id,NEW.assignee_id,NEW.approved_budget,NEW.approved_by,NEW.received_by,NEW.status) IS DISTINCT FROM (OLD.workflow_status,OLD.workshop_id,OLD.assignee_id,OLD.approved_budget,OLD.approved_by,OLD.received_by,OLD.status) AND fn NOT LIKE '%maintenance_transition(%' THEN RAISE EXCEPTION 'تغيير الحالة والإسناد والاعتماد من دورة الصيانة فقط'; END IF;
 IF TG_OP='INSERT' AND (NEW.workflow_status<>'review' OR (NEW.workshop_id IS NOT NULL AND NOT trusted_intake) OR NEW.assignee_id IS NOT NULL OR NEW.approved_by IS NOT NULL OR NEW.approved_budget IS NOT NULL) THEN RAISE EXCEPTION 'أمر العمل يبدأ قيد المراجعة دون إسناد'; END IF;
 RETURN NEW;
END $$;