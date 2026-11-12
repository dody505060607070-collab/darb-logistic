CREATE TABLE public.trip_assignment_history(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), trip_id uuid NOT NULL REFERENCES public.trips(id), driver_id uuid, tractor_id uuid, trailer_id uuid, started_at timestamptz NOT NULL DEFAULT now(), ended_at timestamptz, actor uuid);
GRANT SELECT ON public.trip_assignment_history TO authenticated; GRANT ALL ON public.trip_assignment_history TO service_role; ALTER TABLE public.trip_assignment_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY assignments_read ON public.trip_assignment_history FOR SELECT TO authenticated USING(public.is_staff(auth.uid()) OR driver_id=public.current_driver_id());
CREATE OR REPLACE FUNCTION public.trip_safety_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE resource text;
BEGIN
 IF NEW.status IN('planned','ready','in_progress') THEN
 FOR resource IN SELECT unnest(ARRAY[NEW.driver_id::text,NEW.tractor_id::text,NEW.trailer_id::text]) ORDER BY 1 LOOP
 IF resource IS NOT NULL THEN PERFORM pg_advisory_xact_lock(hashtextextended(resource,0)); END IF;
 END LOOP;
 IF EXISTS(SELECT 1 FROM public.trips t WHERE t.id<>NEW.id AND t.status='in_progress' AND ((NEW.driver_id IS NOT NULL AND t.driver_id=NEW.driver_id) OR (NEW.tractor_id IS NOT NULL AND t.tractor_id=NEW.tractor_id) OR (NEW.trailer_id IS NOT NULL AND t.trailer_id=NEW.trailer_id))) THEN RAISE EXCEPTION 'المورد في رحلة جارية؛ لا يصبح متاحًا بانتهاء الوقت المخطط'; END IF;
 END IF;
 IF NEW.status='in_progress' AND (OLD.status IS DISTINCT FROM NEW.status OR NEW.stage='departed') THEN
 IF EXISTS(SELECT 1 FROM public.inspections i WHERE i.asset_id IN(NEW.tractor_id,NEW.trailer_id) AND i.has_critical AND NOT i.resolved) OR EXISTS(SELECT 1 FROM public.work_orders w WHERE w.asset_id IN(NEW.tractor_id,NEW.trailer_id) AND w.severity='critical' AND w.workflow_status NOT IN('closed','rejected')) THEN RAISE EXCEPTION 'عيب حرج يمنع الانطلاق'; END IF;
 IF NEW.driver_id IS NULL OR NEW.tractor_id IS NULL THEN RAISE EXCEPTION 'خصص السائق والمركبة أولًا'; END IF;
 END IF;
 IF (OLD.driver_id,OLD.tractor_id,OLD.trailer_id) IS DISTINCT FROM (NEW.driver_id,NEW.tractor_id,NEW.trailer_id) THEN
 UPDATE public.trip_assignment_history SET ended_at=now() WHERE trip_id=NEW.id AND ended_at IS NULL;
 INSERT INTO public.trip_assignment_history(trip_id,driver_id,tractor_id,trailer_id,actor) VALUES(NEW.id,NEW.driver_id,NEW.tractor_id,NEW.trailer_id,auth.uid());
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER trip_safety BEFORE UPDATE ON public.trips FOR EACH ROW EXECUTE FUNCTION public.trip_safety_guard();
CREATE OR REPLACE FUNCTION public.submit_delivery(p_trip_id uuid,p_receiver text,p_signature text,p_quantity numeric,p_short numeric,p_damaged numeric,p_photos text[],p_client_ref text,p_notes text DEFAULT NULL,p_phone text DEFAULT NULL,p_lat double precision DEFAULT NULL,p_lng double precision DEFAULT NULL,p_captured_at timestamptz DEFAULT NULL) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE tr public.trips%ROWTYPE; existing public.pods%ROWTYPE; result uuid;
BEGIN
 SELECT * INTO tr FROM public.trips WHERE id=p_trip_id FOR UPDATE;
 IF NOT FOUND OR NOT (public.has_any_role(auth.uid(),'{owner,ops_manager,dispatcher}') OR (tr.driver_id IS NOT NULL AND tr.driver_id=public.current_driver_id())) THEN RAISE EXCEPTION 'غير مصرح'; END IF;
 SELECT * INTO existing FROM public.pods WHERE client_event_id=p_client_ref;
 IF FOUND THEN IF existing.trip_id<>p_trip_id THEN RAISE EXCEPTION 'معرف الإثبات مستخدم'; END IF; RETURN existing.id; END IF;
 IF tr.status<>'in_progress' THEN RAISE EXCEPTION 'الرحلة ليست قيد التنفيذ'; END IF;
 IF length(trim(COALESCE(p_receiver,'')))<2 OR length(COALESCE(p_signature,''))<20 OR p_quantity IS NULL OR p_quantity<0 OR p_short<0 OR p_damaged<0 OR cardinality(p_photos)<1 OR p_client_ref IS NULL THEN RAISE EXCEPTION 'اسم المستلم والكمية والتوقيع والصورة مطلوبة'; END IF;
 INSERT INTO public.pods(trip_id,receiver_name,receiver_phone,received_at,captured_at,qty_delivered,qty_short,qty_damaged,notes,signature,photo_paths,lat,lng,location_source,client_event_id,status,created_by) VALUES(p_trip_id,p_receiver,p_phone,now(),COALESCE(p_captured_at,now()),p_quantity,p_short,p_damaged,p_notes,p_signature,p_photos,p_lat,p_lng,CASE WHEN p_lat IS NULL THEN 'unavailable' ELSE 'device_gps' END,p_client_ref,'submitted',auth.uid()) RETURNING id INTO result;
 PERFORM public.record_trip_event(p_trip_id,'delivered',NULL,p_lat,p_lng,p_notes,'pod-'||p_client_ref,COALESCE(p_captured_at,now()));
 UPDATE public.resource_bookings SET active=false WHERE trip_id=p_trip_id;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.submit_delivery(uuid,text,text,numeric,numeric,numeric,text[],text,text,text,double precision,double precision,timestamptz) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.submit_delivery(uuid,text,text,numeric,numeric,numeric,text[],text,text,text,double precision,double precision,timestamptz) TO authenticated,service_role;
CREATE OR REPLACE FUNCTION public.custody_return(p_id uuid,p_odometer numeric,p_fuel text,p_transfer_to uuid DEFAULT NULL) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE c public.custody%ROWTYPE; result uuid;
BEGIN
 IF NOT public.has_any_role(auth.uid(),'{owner,ops_manager,fleet_supervisor}') THEN RAISE EXCEPTION 'غير مصرح'; END IF;
 SELECT * INTO c FROM public.custody WHERE id=p_id FOR UPDATE;
 IF NOT FOUND OR c.closed_at IS NOT NULL THEN RAISE EXCEPTION 'العهدة ليست مفتوحة'; END IF;
 IF p_odometer IS NULL OR p_odometer<COALESCE(c.odometer_out,0) OR NULLIF(trim(p_fuel),'') IS NULL THEN RAISE EXCEPTION 'العداد ومستوى الوقود مطلوبان'; END IF;
 PERFORM 1 FROM public.assets WHERE id=c.asset_id FOR UPDATE;
 UPDATE public.custody SET closed_at=now(),odometer_in=p_odometer,fuel_level_in=p_fuel WHERE id=p_id;
 IF p_transfer_to IS NOT NULL THEN
 IF p_transfer_to=c.driver_id THEN RAISE EXCEPTION 'اختر سائقًا آخر'; END IF;
 INSERT INTO public.custody(asset_id,driver_id,odometer_out,fuel_level_out,previous_custody_id) VALUES(c.asset_id,p_transfer_to,p_odometer,p_fuel,c.id) RETURNING id INTO result;
 END IF;
 RETURN COALESCE(result,p_id);
END $$;
REVOKE ALL ON FUNCTION public.custody_return(uuid,numeric,text,uuid) FROM PUBLIC,anon; GRANT EXECUTE ON FUNCTION public.custody_return(uuid,numeric,text,uuid) TO authenticated,service_role;