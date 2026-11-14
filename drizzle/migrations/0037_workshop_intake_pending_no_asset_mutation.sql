CREATE OR REPLACE FUNCTION public.workshop_intake(p_ref uuid,p_workshop_id uuid,p_asset_id uuid,p_description text,p_diagnosis text,p_severity text,p_parts numeric,p_labor numeric,p_photos text[] DEFAULT '{}',p_odometer numeric DEFAULT NULL) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE wid uuid;
BEGIN
 IF auth.uid() IS NULL OR NOT has_role(auth.uid(),'workshop') OR NOT EXISTS(SELECT 1 FROM workshop_members WHERE user_id=auth.uid() AND workshop_id=p_workshop_id) THEN RAISE EXCEPTION 'غير مصرح لهذه الورشة'; END IF;
 IF p_ref IS NULL OR p_asset_id IS NULL OR length(trim(coalesce(p_description,'')))<5 OR length(trim(coalesce(p_diagnosis,'')))<3 OR p_severity NOT IN('normal','urgent','critical') OR p_parts IS NULL OR p_labor IS NULL OR p_parts<0 OR p_labor<0 OR (p_odometer IS NOT NULL AND p_odometer<0) THEN RAISE EXCEPTION 'بيانات المركبة والتشخيص والتقدير غير صحيحة'; END IF;
 IF cardinality(p_photos)>10 OR EXISTS(SELECT 1 FROM unnest(p_photos) ph WHERE ph IS NULL OR ph NOT LIKE auth.uid()::text||'/workshop-intake/%' OR NOT EXISTS(SELECT 1 FROM storage.objects o WHERE o.bucket_id='attachments' AND o.name=ph)) THEN RAISE EXCEPTION 'مرفقات غير مصرح بها'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_ref::text,0));
 SELECT id INTO wid FROM work_orders WHERE intake_ref=p_ref AND requested_by=auth.uid();
 IF wid IS NOT NULL THEN RETURN wid; END IF;
 INSERT INTO work_orders(asset_id,kind,description,diagnosis,severity,workshop_id,requested_by,estimate,labor_cost,photo_paths,odometer_km,intake_ref)
 VALUES(p_asset_id,'corrective',trim(p_description),trim(p_diagnosis),p_severity,p_workshop_id,auth.uid(),round(p_parts+p_labor,2),round(p_labor,2),coalesce(p_photos,'{}'),p_odometer,p_ref) RETURNING id INTO wid;
 INSERT INTO maintenance_history(work_order_id,to_status,note,actor) VALUES(wid,'review','استلام المركبة بالورشة — طلب اعتماد التشخيص والتقدير',auth.uid());
 -- Pending intake never changes vehicle availability. Role-checked maintenance approval owns that transition.
 RETURN wid;
END $$;
REVOKE ALL ON FUNCTION public.workshop_intake(uuid,uuid,uuid,text,text,text,numeric,numeric,text[],numeric) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.workshop_intake(uuid,uuid,uuid,text,text,text,numeric,numeric,text[],numeric) TO authenticated,service_role;