-- The busy-resource check now runs only when a trip is created, its resources change or its status changes,
-- so notes and stage events on a future trip are not blocked while its driver finishes another trip.
CREATE OR REPLACE FUNCTION public.trip_safety_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE resource text;
BEGIN
 IF NEW.status IN('planned','ready','in_progress') AND (TG_OP='INSERT' OR NEW.status IS DISTINCT FROM OLD.status OR (OLD.driver_id,OLD.tractor_id,OLD.trailer_id) IS DISTINCT FROM (NEW.driver_id,NEW.tractor_id,NEW.trailer_id)) THEN
 FOR resource IN SELECT unnest(ARRAY[NEW.driver_id::text,NEW.tractor_id::text,NEW.trailer_id::text]) ORDER BY 1 LOOP
 IF resource IS NOT NULL THEN PERFORM pg_advisory_xact_lock(hashtextextended(resource,0)); END IF;
 END LOOP;
 IF EXISTS(SELECT 1 FROM public.trips t WHERE t.id<>NEW.id AND t.status='in_progress' AND ((NEW.driver_id IS NOT NULL AND t.driver_id=NEW.driver_id) OR (NEW.tractor_id IS NOT NULL AND t.tractor_id=NEW.tractor_id) OR (NEW.trailer_id IS NOT NULL AND t.trailer_id=NEW.trailer_id))) THEN RAISE EXCEPTION 'المورد في رحلة جارية؛ لا يصبح متاحًا بانتهاء الوقت المخطط'; END IF;
 END IF;
 IF NEW.status='in_progress' AND (OLD.status IS DISTINCT FROM NEW.status OR NEW.stage='departed') THEN
 IF EXISTS(SELECT 1 FROM public.inspections i WHERE i.asset_id IN(NEW.tractor_id,NEW.trailer_id) AND i.has_critical AND NOT i.resolved) OR EXISTS(SELECT 1 FROM public.work_orders w WHERE w.asset_id IN(NEW.tractor_id,NEW.trailer_id) AND w.severity='critical' AND w.workflow_status NOT IN('closed','rejected')) THEN RAISE EXCEPTION 'عيب حرج يمنع الانطلاق'; END IF;
 IF NEW.driver_id IS NULL OR NEW.tractor_id IS NULL THEN RAISE EXCEPTION 'خصص السائق والمركبة أولًا'; END IF;
 END IF;
 IF TG_OP='UPDATE' AND (OLD.driver_id,OLD.tractor_id,OLD.trailer_id) IS DISTINCT FROM (NEW.driver_id,NEW.tractor_id,NEW.trailer_id) THEN
 UPDATE public.trip_assignment_history SET ended_at=now() WHERE trip_id=NEW.id AND ended_at IS NULL;
 INSERT INTO public.trip_assignment_history(trip_id,driver_id,tractor_id,trailer_id,actor) VALUES(NEW.id,NEW.driver_id,NEW.tractor_id,NEW.trailer_id,auth.uid());
 END IF;
 RETURN NEW;
END $function$;
REVOKE EXECUTE ON FUNCTION public.trip_safety_guard() FROM PUBLIC, anon, authenticated;