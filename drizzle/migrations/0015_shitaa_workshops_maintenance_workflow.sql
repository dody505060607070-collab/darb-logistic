CREATE TABLE public.workshops(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL, phone text, kind text NOT NULL DEFAULT 'external', branch_id uuid REFERENCES public.branches(id), created_at timestamptz NOT NULL DEFAULT now());
GRANT SELECT,INSERT,UPDATE,DELETE ON public.workshops TO authenticated; GRANT ALL ON public.workshops TO service_role;
ALTER TABLE public.workshops ENABLE ROW LEVEL SECURITY;
CREATE TABLE public.workshop_members(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workshop_id uuid NOT NULL REFERENCES public.workshops(id), user_id uuid NOT NULL REFERENCES public.profiles(id), UNIQUE(workshop_id,user_id));
GRANT SELECT,INSERT,UPDATE,DELETE ON public.workshop_members TO authenticated; GRANT ALL ON public.workshop_members TO service_role;
ALTER TABLE public.workshop_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY workshop_members_read ON public.workshop_members FOR SELECT TO authenticated USING(user_id=auth.uid() OR public.has_any_role(auth.uid(),'{owner,maintenance,ops_manager}'));
CREATE POLICY workshop_members_manage ON public.workshop_members FOR ALL TO authenticated USING(public.has_role(auth.uid(),'owner')) WITH CHECK(public.has_role(auth.uid(),'owner'));
CREATE POLICY workshops_read ON public.workshops FOR SELECT TO authenticated USING(public.has_any_role(auth.uid(),'{owner,maintenance,ops_manager,fleet_supervisor}') OR EXISTS(SELECT 1 FROM public.workshop_members m WHERE m.workshop_id=workshops.id AND m.user_id=auth.uid()));
CREATE POLICY workshops_manage ON public.workshops FOR ALL TO authenticated USING(public.has_any_role(auth.uid(),'{owner,maintenance}')) WITH CHECK(public.has_any_role(auth.uid(),'{owner,maintenance}'));
ALTER TABLE public.work_orders ADD COLUMN workflow_status text NOT NULL DEFAULT 'review', ADD COLUMN workshop_id uuid REFERENCES public.workshops(id), ADD COLUMN assignee_id uuid REFERENCES public.profiles(id), ADD COLUMN requested_by uuid, ADD COLUMN severity text NOT NULL DEFAULT 'normal', ADD COLUMN approved_budget numeric(14,2), ADD COLUMN estimate numeric(14,2), ADD COLUMN diagnosis text, ADD COLUMN expected_at timestamptz, ADD COLUMN approval_note text, ADD COLUMN photo_paths text[] NOT NULL DEFAULT '{}', ADD COLUMN approved_by uuid, ADD COLUMN received_by uuid;
UPDATE public.work_orders SET workflow_status=CASE status WHEN 'closed' THEN 'closed' WHEN 'completed' THEN 'ready_delivery' WHEN 'waiting_parts' THEN 'waiting_parts' WHEN 'in_progress' THEN 'repairing' WHEN 'diagnosis' THEN 'waiting' ELSE 'review' END;
CREATE TABLE public.maintenance_history(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), work_order_id uuid NOT NULL REFERENCES public.work_orders(id), from_status text, to_status text NOT NULL, note text, actor uuid NOT NULL, at timestamptz NOT NULL DEFAULT now());
GRANT SELECT ON public.maintenance_history TO authenticated; GRANT ALL ON public.maintenance_history TO service_role;
ALTER TABLE public.maintenance_history ENABLE ROW LEVEL SECURITY;
CREATE OR REPLACE FUNCTION public.can_access_work_order(p_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$ SELECT EXISTS(SELECT 1 FROM public.work_orders w WHERE w.id=p_id AND (public.has_any_role(auth.uid(),'{owner,maintenance,ops_manager,fleet_supervisor,accountant}') OR (public.has_role(auth.uid(),'field_maintenance') AND w.assignee_id=auth.uid()) OR (public.has_role(auth.uid(),'workshop') AND EXISTS(SELECT 1 FROM public.workshop_members m WHERE m.workshop_id=w.workshop_id AND m.user_id=auth.uid())) OR w.requested_by=auth.uid())) $$;
REVOKE ALL ON FUNCTION public.can_access_work_order(uuid) FROM PUBLIC,anon; GRANT EXECUTE ON FUNCTION public.can_access_work_order(uuid) TO authenticated,service_role;
CREATE POLICY scoped_work_orders_read ON public.work_orders FOR SELECT TO authenticated USING(public.can_access_work_order(id));
CREATE POLICY maintenance_history_read ON public.maintenance_history FOR SELECT TO authenticated USING(public.can_access_work_order(work_order_id));
CREATE POLICY repair_asset_read ON public.assets FOR SELECT TO authenticated USING(EXISTS(SELECT 1 FROM public.work_orders w WHERE w.asset_id=assets.id AND public.can_access_work_order(w.id)));
CREATE OR REPLACE FUNCTION public.maintenance_request(p_asset_id uuid,p_description text,p_severity text DEFAULT 'normal',p_photos text[] DEFAULT '{}') RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_id uuid;
BEGIN
 IF auth.uid() IS NULL OR NOT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=auth.uid()) THEN RAISE EXCEPTION 'غير مصرح'; END IF;
 IF length(trim(p_description))<5 OR p_severity NOT IN('normal','urgent','critical') THEN RAISE EXCEPTION 'وصف البلاغ والخطورة مطلوبان'; END IF;
 IF NOT public.is_staff(auth.uid()) AND NOT public.has_role(auth.uid(),'field_maintenance') AND NOT EXISTS(SELECT 1 FROM public.custody c WHERE c.asset_id=p_asset_id AND c.driver_id=public.current_driver_id() AND c.closed_at IS NULL) AND NOT EXISTS(SELECT 1 FROM public.trips t WHERE (t.tractor_id=p_asset_id OR t.trailer_id=p_asset_id) AND t.driver_id=public.current_driver_id()) THEN RAISE EXCEPTION 'المركبة غير مسندة إليك'; END IF;
 INSERT INTO public.work_orders(asset_id,kind,description,requested_by,severity,photo_paths) VALUES(p_asset_id,'corrective',trim(p_description),auth.uid(),p_severity,p_photos) RETURNING id INTO v_id;
 INSERT INTO public.maintenance_history(work_order_id,to_status,note,actor) VALUES(v_id,'review',p_description,auth.uid());
 IF p_severity='critical' THEN UPDATE public.assets SET status='stopped' WHERE id=p_asset_id; END IF;
 INSERT INTO public.notifications(category,severity,title,body,entity_type,entity_id,dedupe_key) VALUES('maintenance',CASE WHEN p_severity='critical' THEN 'critical' ELSE 'warning' END,'بلاغ صيانة بانتظار المراجعة',p_description,'work_orders',v_id,'maintenance-review-'||v_id);
 RETURN v_id;
END $$;
CREATE OR REPLACE FUNCTION public.maintenance_transition(p_id uuid,p_target text,p_note text DEFAULT NULL,p_workshop_id uuid DEFAULT NULL,p_assignee_id uuid DEFAULT NULL,p_amount numeric DEFAULT NULL) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE w public.work_orders%ROWTYPE; manager boolean; allowed boolean;
BEGIN
 SELECT * INTO w FROM public.work_orders WHERE id=p_id FOR UPDATE;
 IF NOT FOUND OR NOT public.can_access_work_order(p_id) THEN RAISE EXCEPTION 'غير مصرح'; END IF;
 manager:=public.has_any_role(auth.uid(),'{owner,maintenance,ops_manager}');
 allowed:=CASE w.workflow_status WHEN 'review' THEN p_target IN('returned','rejected','approved') WHEN 'returned' THEN p_target='review' WHEN 'approved' THEN p_target='assigned' WHEN 'assigned' THEN p_target IN('waiting','repairing','waiting_parts','additional_review') WHEN 'waiting' THEN p_target IN('repairing','waiting_parts','additional_review') WHEN 'repairing' THEN p_target IN('waiting_parts','ready_delivery','additional_review') WHEN 'waiting_parts' THEN p_target IN('repairing','additional_review') WHEN 'additional_review' THEN p_target IN('repairing','returned','rejected') WHEN 'ready_delivery' THEN p_target IN('closed','repairing') ELSE false END;
 IF NOT allowed THEN RAISE EXCEPTION 'انتقال غير مسموح للحالة'; END IF;
 IF p_target IN('approved','rejected','returned','assigned','closed') OR w.workflow_status='additional_review' THEN
 IF NOT manager THEN RAISE EXCEPTION 'القرار يتطلب مسؤول الصيانة'; END IF;
 IF p_target IN('approved','closed') AND w.requested_by=auth.uid() AND NOT public.has_role(auth.uid(),'owner') THEN RAISE EXCEPTION 'لا يمكنك اعتماد طلبك'; END IF;
 END IF;
 IF p_target IN('returned','rejected','additional_review') AND length(trim(COALESCE(p_note,'')))<3 THEN RAISE EXCEPTION 'سبب القرار مطلوب'; END IF;
 IF p_amount IS NOT NULL AND p_amount<0 THEN RAISE EXCEPTION 'المبلغ غير صحيح'; END IF;
 IF p_target='assigned' THEN
 IF (p_workshop_id IS NULL)=(p_assignee_id IS NULL) THEN RAISE EXCEPTION 'اختر ورشة أو موظف صيانة واحدًا'; END IF;
 IF p_workshop_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.workshops WHERE id=p_workshop_id) THEN RAISE EXCEPTION 'الورشة غير موجودة'; END IF;
 IF p_assignee_id IS NOT NULL AND NOT public.has_role(p_assignee_id,'field_maintenance') THEN RAISE EXCEPTION 'الموظف ليس صيانة ميدانية'; END IF;
 END IF;
 IF p_target='ready_delivery' AND (COALESCE(w.estimate,0)>COALESCE(w.approved_budget,0) OR COALESCE(w.parts_cost,0)+COALESCE(w.labor_cost,0)>COALESCE(w.approved_budget,0)) THEN RAISE EXCEPTION 'التكلفة الإضافية تحتاج اعتمادًا'; END IF;
 IF p_target='closed' AND EXISTS(SELECT 1 FROM public.inspections WHERE asset_id=w.asset_id AND has_critical AND NOT resolved) THEN RAISE EXCEPTION 'يجب معالجة العيب الحرج وإعادة الفحص'; END IF;
 IF p_target='closed' AND length(trim(COALESCE(p_note,'')))<3 THEN RAISE EXCEPTION 'سجل نتيجة فحص الاستلام'; END IF;
 UPDATE public.work_orders SET workflow_status=p_target,workshop_id=CASE WHEN p_target='assigned' THEN p_workshop_id ELSE workshop_id END,assignee_id=CASE WHEN p_target='assigned' THEN p_assignee_id ELSE assignee_id END,approved_budget=CASE WHEN p_target='approved' OR (w.workflow_status='additional_review' AND p_target='repairing') THEN COALESCE(p_amount,estimate,0) ELSE approved_budget END,approved_by=CASE WHEN p_target='approved' OR (w.workflow_status='additional_review' AND p_target='repairing') THEN auth.uid() ELSE approved_by END,received_by=CASE WHEN p_target='closed' THEN auth.uid() ELSE received_by END,approval_note=p_note,status=CASE p_target WHEN 'closed' THEN 'closed' WHEN 'ready_delivery' THEN 'completed' WHEN 'waiting_parts' THEN 'waiting_parts' WHEN 'repairing' THEN 'in_progress' WHEN 'waiting' THEN 'diagnosis' ELSE 'open' END,closed_at=CASE WHEN p_target='closed' THEN now() ELSE NULL END WHERE id=p_id;
 INSERT INTO public.maintenance_history(work_order_id,from_status,to_status,note,actor) VALUES(p_id,w.workflow_status,p_target,p_note,auth.uid());
 IF p_target IN('assigned','repairing','waiting_parts','ready_delivery') THEN UPDATE public.assets SET status='maintenance' WHERE id=w.asset_id AND status<>'stopped'; END IF;
 IF p_target='closed' THEN UPDATE public.assets SET status='available' WHERE id=w.asset_id AND NOT EXISTS(SELECT 1 FROM public.work_orders o WHERE o.asset_id=w.asset_id AND o.id<>w.id AND o.workflow_status NOT IN('closed','rejected')) AND NOT EXISTS(SELECT 1 FROM public.inspections i WHERE i.asset_id=w.asset_id AND i.has_critical AND NOT i.resolved); END IF;
END $$;
CREATE OR REPLACE FUNCTION public.maintenance_details(p_id uuid,p_diagnosis text,p_estimate numeric,p_labor numeric,p_invoice text DEFAULT NULL) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NOT public.can_access_work_order(p_id) OR NOT (public.has_any_role(auth.uid(),'{owner,maintenance,ops_manager,field_maintenance,workshop}')) THEN RAISE EXCEPTION 'غير مصرح'; END IF;
 IF p_estimate<0 OR p_labor<0 OR length(trim(p_diagnosis))<3 THEN RAISE EXCEPTION 'التشخيص والتكلفة غير صحيحين'; END IF;
 UPDATE public.work_orders SET diagnosis=p_diagnosis,estimate=p_estimate,labor_cost=p_labor,vendor_invoice_ref=NULLIF(p_invoice,'') WHERE id=p_id AND workflow_status NOT IN('closed','rejected');
 IF NOT FOUND THEN RAISE EXCEPTION 'الأمر مغلق'; END IF;
 INSERT INTO public.maintenance_history(work_order_id,to_status,note,actor) SELECT id,workflow_status,p_diagnosis,auth.uid() FROM public.work_orders WHERE id=p_id;
END $$;
CREATE OR REPLACE FUNCTION public.set_work_order_status(p_id uuid,p_status text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN RAISE EXCEPTION 'استخدم دورة الصيانة المعتمدة وفحص الاستلام'; END $$;
REVOKE ALL ON FUNCTION public.maintenance_request(uuid,text,text,text[]),public.maintenance_transition(uuid,text,text,uuid,uuid,numeric),public.maintenance_details(uuid,text,numeric,numeric,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.maintenance_request(uuid,text,text,text[]),public.maintenance_transition(uuid,text,text,uuid,uuid,numeric),public.maintenance_details(uuid,text,numeric,numeric,text) TO authenticated,service_role;
CREATE TRIGGER audit_workshops AFTER INSERT OR UPDATE OR DELETE ON public.workshops FOR EACH ROW EXECUTE FUNCTION public.audit_trigger();