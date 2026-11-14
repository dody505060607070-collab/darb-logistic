CREATE OR REPLACE FUNCTION public.maintenance_request(p_asset_id uuid, p_description text, p_severity text DEFAULT 'normal'::text, p_photos text[] DEFAULT '{}'::text[])
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_id uuid; v_staff boolean; v_driver boolean; v_field_assigned boolean;
BEGIN
 IF auth.uid() IS NULL OR NOT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=auth.uid()) THEN RAISE EXCEPTION 'غير مصرح'; END IF;
 IF length(trim(p_description))<5 OR p_severity NOT IN('normal','urgent','critical') THEN RAISE EXCEPTION 'وصف البلاغ والخطورة مطلوبان'; END IF;
 v_staff := public.is_staff(auth.uid());
 v_driver := EXISTS(SELECT 1 FROM public.custody c WHERE c.asset_id=p_asset_id AND c.driver_id=public.current_driver_id() AND c.closed_at IS NULL)
   OR EXISTS(SELECT 1 FROM public.trips t WHERE (t.tractor_id=p_asset_id OR t.trailer_id=p_asset_id) AND t.driver_id=public.current_driver_id());
 v_field_assigned := public.has_role(auth.uid(),'field_maintenance')
   AND EXISTS(SELECT 1 FROM public.work_orders w WHERE w.asset_id=p_asset_id AND w.assignee_id=auth.uid() AND w.closed_at IS NULL);
 IF NOT v_staff AND NOT v_driver AND NOT public.has_role(auth.uid(),'field_maintenance') THEN RAISE EXCEPTION 'المركبة غير مسندة إليك'; END IF;
 INSERT INTO public.work_orders(asset_id,kind,description,requested_by,severity,photo_paths) VALUES(p_asset_id,'corrective',trim(p_description),auth.uid(),p_severity,p_photos) RETURNING id INTO v_id;
 INSERT INTO public.maintenance_history(work_order_id,to_status,note,actor) VALUES(v_id,'review',p_description,auth.uid());
 -- Only office staff, the vehicle's own driver, or a technician assigned to an open order on it may stop the vehicle at once;
 -- other field reports stay critical and wait for the maintenance officer's decision.
 IF p_severity='critical' AND (v_staff OR v_driver OR v_field_assigned) THEN UPDATE public.assets SET status='stopped' WHERE id=p_asset_id; END IF;
 INSERT INTO public.notifications(category,severity,title,body,entity_type,entity_id,dedupe_key) VALUES('maintenance',CASE WHEN p_severity='critical' THEN 'critical' ELSE 'warning' END,'بلاغ صيانة بانتظار المراجعة',p_description,'work_orders',v_id,'maintenance-review-'||v_id);
 RETURN v_id;
END $function$;
REVOKE ALL ON FUNCTION public.maintenance_request(uuid,text,text,text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.maintenance_request(uuid,text,text,text[]) TO authenticated;