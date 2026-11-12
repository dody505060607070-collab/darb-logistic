CREATE OR REPLACE FUNCTION public.work_order_workflow_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
DECLARE fn text;
BEGIN
 -- RPC updates originate inside the trusted SECURITY DEFINER call stack;
 -- ordinary Data API writes cannot set workflow or assignment fields.
 GET DIAGNOSTICS fn=PG_CONTEXT;
 IF TG_OP='UPDATE' AND (NEW.workflow_status,NEW.workshop_id,NEW.assignee_id,NEW.approved_budget,NEW.approved_by,NEW.received_by,NEW.status) IS DISTINCT FROM (OLD.workflow_status,OLD.workshop_id,OLD.assignee_id,OLD.approved_budget,OLD.approved_by,OLD.received_by,OLD.status) AND fn NOT LIKE '%maintenance_transition(%' THEN RAISE EXCEPTION 'تغيير الحالة والإسناد والاعتماد من دورة الصيانة فقط'; END IF;
 IF TG_OP='INSERT' AND (NEW.workflow_status<>'review' OR NEW.workshop_id IS NOT NULL OR NEW.assignee_id IS NOT NULL OR NEW.approved_by IS NOT NULL OR NEW.approved_budget IS NOT NULL) THEN RAISE EXCEPTION 'أمر العمل يبدأ قيد المراجعة دون إسناد'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER work_order_workflow_guard BEFORE INSERT OR UPDATE ON public.work_orders FOR EACH ROW EXECUTE FUNCTION public.work_order_workflow_guard();
CREATE OR REPLACE FUNCTION public.profile_identity_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 IF NEW.phone IS DISTINCT FROM OLD.phone AND auth.uid() IS NOT NULL AND NOT public.has_role(auth.uid(),'owner') THEN RAISE EXCEPTION 'تغيير هوية الجوال متاح للإدارة فقط'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER profile_identity_guard BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.profile_identity_guard();
CREATE OR REPLACE FUNCTION public.reinspect_ok(p_inspection_id uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE i public.inspections%ROWTYPE;
BEGIN
 IF NOT public.has_any_role(auth.uid(),'{owner,ops_manager,maintenance,fleet_supervisor}') THEN RAISE EXCEPTION 'غير مصرح'; END IF;
 SELECT * INTO i FROM public.inspections WHERE id=p_inspection_id FOR UPDATE;
 IF NOT FOUND OR NOT i.has_critical OR i.resolved THEN RAISE EXCEPTION 'لا يوجد عيب حرج مفتوح'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.work_orders WHERE inspection_id=p_inspection_id AND workflow_status IN('ready_delivery','closed')) THEN RAISE EXCEPTION 'يجب إكمال إصلاح الأمر المرتبط قبل الفحص'; END IF;
 INSERT INTO public.inspections(asset_id,kind,template_version,items,notes) SELECT i.asset_id,'re_inspection',i.template_version,(SELECT jsonb_agg(jsonb_build_object('key',e->>'key','label',e->>'label','result','ok')) FROM jsonb_array_elements(i.items)e),'إعادة فحص بعد الإصلاح للفحص '||i.id;
 UPDATE public.inspections SET resolved=true WHERE id=p_inspection_id;
 -- No automatic operational release: receiving/closing remains a separate action.
 UPDATE public.notifications SET status='resolved' WHERE dedupe_key='insp-crit-'||p_inspection_id;
END $$;