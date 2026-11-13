ALTER TABLE public.work_orders ADD COLUMN intake_ref uuid UNIQUE;
CREATE OR REPLACE FUNCTION public.wa_event_roles(p_event text,p_critical boolean DEFAULT false) RETURNS public.app_role[] LANGUAGE sql IMMUTABLE SET search_path=public AS $$
 SELECT (CASE
 WHEN p_event IN ('maintenance_request','workshop_intake','workshop_report','maintenance_state') THEN ARRAY['maintenance']
 WHEN p_event IN ('fuel','expense','wallet_request') THEN ARRAY['accountant']
 WHEN p_event IN ('trip_assigned','trip_status','trip_event') THEN ARRAY['dispatcher','fleet_supervisor']
 WHEN p_event IN ('order_created','return_request','delay_notice') THEN ARRAY['dispatcher','ops_manager']
 WHEN p_event='incident' THEN ARRAY['maintenance','fleet_supervisor','ops_manager']
 WHEN p_event='critical_maintenance' THEN ARRAY['maintenance','fleet_supervisor']
 WHEN p_event IN ('document_alert','critical_alert') THEN ARRAY['fleet_supervisor']
 WHEN p_event IN ('maintenance_alert','stock_alert') THEN ARRAY['maintenance']
 ELSE ARRAY[]::text[] END || CASE WHEN p_critical THEN ARRAY['owner'] ELSE ARRAY[]::text[] END)::public.app_role[] $$;
REVOKE ALL ON FUNCTION public.wa_event_roles(text,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.wa_event_roles(text,boolean) TO authenticated,service_role;
CREATE OR REPLACE FUNCTION public.wa_department(p_body text,p_event text,p_entity uuid,p_critical boolean DEFAULT false) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r record;
BEGIN
 FOR r IN SELECT DISTINCT p.phone FROM profiles p JOIN user_roles ur ON ur.user_id=p.id WHERE ur.role=ANY(public.wa_event_roles(p_event,p_critical)) AND p.phone IS NOT NULL LOOP
 PERFORM wa_enqueue(r.phone,p_body,p_event,p_entity);
 END LOOP;
END $$;
REVOKE ALL ON FUNCTION public.wa_department(text,text,uuid,boolean) FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION public.wa_admins(p_body text,p_event text,p_entity uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE crit boolean:=false; ev text:=p_event; cat text;
BEGIN
 IF p_event='incident' THEN SELECT severity='critical' INTO crit FROM incidents WHERE id=p_entity;
 ELSIF p_event='critical_alert' THEN
 SELECT severity='critical',category INTO crit,cat FROM notifications WHERE id=p_entity;
 ev:=CASE cat WHEN 'maintenance' THEN 'maintenance_alert' WHEN 'parts' THEN 'stock_alert' ELSE 'document_alert' END;
 ELSIF p_event IN ('workshop_report','maintenance_request','workshop_intake','maintenance_state') THEN SELECT severity='critical' INTO crit FROM work_orders WHERE id=p_entity;
 END IF;
 PERFORM wa_department(p_body,ev,p_entity,coalesce(crit,false));
END $$;
CREATE OR REPLACE FUNCTION public.workshop_find_vehicle(p_query text) RETURNS TABLE(id uuid,code text,plate text,make_model text,odometer_km numeric) LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF auth.uid() IS NULL OR NOT has_role(auth.uid(),'workshop') OR NOT EXISTS(SELECT 1 FROM workshop_members WHERE user_id=auth.uid()) THEN RAISE EXCEPTION 'حساب الورشة غير مرتبط بورشة'; END IF;
 IF length(trim(coalesce(p_query,'')))<3 THEN RAISE EXCEPTION 'اكتب رقم المركبة أو اللوحة كاملًا'; END IF;
 RETURN QUERY SELECT a.id,a.code,a.plate,a.make_model,a.odometer_km FROM assets a WHERE lower(regexp_replace(a.code,'\s','','g'))=lower(regexp_replace(trim(p_query),'\s','','g')) OR lower(regexp_replace(a.plate,'\s','','g'))=lower(regexp_replace(trim(p_query),'\s','','g')) LIMIT 5;
END $$;
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
 UPDATE assets SET status=CASE WHEN p_severity='critical' THEN 'stopped' ELSE 'maintenance' END WHERE id=p_asset_id;
 RETURN wid;
END $$;
REVOKE ALL ON FUNCTION public.workshop_find_vehicle(text),public.workshop_intake(uuid,uuid,uuid,text,text,text,numeric,numeric,text[],numeric) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.workshop_find_vehicle(text),public.workshop_intake(uuid,uuid,uuid,text,text,text,numeric,numeric,text[],numeric) TO authenticated,service_role;
CREATE OR REPLACE FUNCTION public.workshop_intake_approval() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NEW.intake_ref IS NOT NULL AND OLD.workflow_status='review' AND NEW.workflow_status='approved' THEN
 IF NOT has_any_role(auth.uid(),'{owner,maintenance,ops_manager}') THEN RAISE EXCEPTION 'اعتماد مسؤول الصيانة مطلوب'; END IF;
 NEW.workflow_status:='assigned';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER workshop_intake_approval BEFORE UPDATE OF workflow_status ON public.work_orders FOR EACH ROW EXECUTE FUNCTION public.workshop_intake_approval();
CREATE OR REPLACE FUNCTION public.wa_maintenance_trigger() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE msg text; ph record; a record; event_name text;
BEGIN
 SELECT code,plate INTO a FROM assets WHERE id=NEW.asset_id;
 IF TG_OP='INSERT' THEN
 msg:=format(E'🔧 طلب صيانة %s\nالمركبة: %s — %s\nالمشكلة: %s\nالتشخيص: %s\nالتقدير الإجمالي: %s ر.س\nالأجور: %s ر.س\nالصور: %s\nراجع مركز الصيانة للموافقة أو الرفض.',NEW.number,a.code,a.plate,NEW.description,coalesce(NEW.diagnosis,'—'),coalesce(NEW.estimate,0),coalesce(NEW.labor_cost,0),cardinality(NEW.photo_paths));
 PERFORM wa_admins(msg,CASE WHEN NEW.intake_ref IS NOT NULL THEN 'workshop_intake' ELSE 'maintenance_request' END,NEW.id);
 ELSE
 IF NEW.workflow_status IS NOT DISTINCT FROM OLD.workflow_status THEN RETURN NEW; END IF;
 msg:=format(E'🔧 أمر الصيانة %s — %s\nالحالة: %s\nالميزانية: %s ر.س%s',NEW.number,a.code,NEW.workflow_status,coalesce(NEW.approved_budget,0),coalesce(E'\nملاحظة: '||NEW.approval_note,''));
 IF NEW.workflow_status IN('assigned','returned','repairing','waiting_parts','additional_review','ready_delivery','closed') THEN
 FOR ph IN SELECT phone FROM profiles WHERE id=NEW.requested_by OR id=NEW.assignee_id OR id IN(SELECT user_id FROM workshop_members WHERE workshop_id=NEW.workshop_id) LOOP PERFORM wa_enqueue(ph.phone,msg,'maintenance_state',NEW.id); END LOOP;
 END IF;
 IF NEW.workflow_status IN('additional_review','ready_delivery') THEN PERFORM wa_admins(msg,'maintenance_state',NEW.id); END IF;
 IF NEW.workflow_status='closed' THEN PERFORM wa_department(msg,'trip_status',NEW.id,false); END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER wa_maintenance AFTER INSERT OR UPDATE OF workflow_status ON public.work_orders FOR EACH ROW EXECUTE FUNCTION public.wa_maintenance_trigger();
REVOKE ALL ON FUNCTION public.workshop_intake_approval(),public.wa_maintenance_trigger() FROM PUBLIC,anon,authenticated;
CREATE POLICY workshop_work_photos_read ON storage.objects FOR SELECT TO authenticated USING(bucket_id='attachments' AND EXISTS(SELECT 1 FROM public.work_orders w WHERE name=ANY(w.photo_paths) AND public.can_access_work_order(w.id)));