CREATE TABLE public.return_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id uuid NOT NULL REFERENCES public.trips(id),
  driver_id uuid NOT NULL REFERENCES public.drivers(id),
  depart_at timestamptz NOT NULL,
  notes text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  return_trip_id uuid REFERENCES public.trips(id),
  reviewed_by uuid,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.return_requests TO authenticated;
GRANT ALL ON public.return_requests TO service_role;
ALTER TABLE public.return_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "return requests read" ON public.return_requests FOR SELECT TO authenticated
  USING (driver_id = public.current_driver_id() OR public.has_any_role(auth.uid(), '{owner,ops_manager,dispatcher,fleet_supervisor}'::public.app_role[]));
CREATE UNIQUE INDEX return_requests_one_pending ON public.return_requests(trip_id) WHERE status='pending';

CREATE OR REPLACE FUNCTION public.driver_request_return(p_trip_id uuid, p_depart_at timestamptz, p_notes text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE t record; rid uuid; dn text;
BEGIN
  SELECT * INTO t FROM trips WHERE id=p_trip_id;
  IF NOT FOUND OR t.driver_id IS DISTINCT FROM current_driver_id() THEN RAISE EXCEPTION 'هذه الرحلة ليست لك'; END IF;
  IF t.status NOT IN ('in_progress','delivered','closed') THEN RAISE EXCEPTION 'يمكن طلب الرجوع بعد بدء الرحلة'; END IF;
  IF EXISTS (SELECT 1 FROM trips WHERE parent_trip_id=p_trip_id AND status<>'cancelled') THEN RAISE EXCEPTION 'رحلة الرجوع موجودة بالفعل'; END IF;
  IF p_depart_at IS NULL THEN RAISE EXCEPTION 'حدد موعد الرجوع'; END IF;
  INSERT INTO return_requests(trip_id, driver_id, depart_at, notes) VALUES (p_trip_id, t.driver_id, p_depart_at, nullif(trim(p_notes),'')) RETURNING id INTO rid;
  SELECT full_name INTO dn FROM drivers WHERE id=t.driver_id;
  PERFORM wa_admins(format(E'↩️ طلب رحلة رجوع من %s\nالرحلة %s (%s ← %s)\nموعد الرجوع المطلوب: %s%s\nراجع الطلب في صفحة الرحلة.', coalesce(dn,'السائق'), t.number, t.dest_city, t.origin_city, to_char(p_depart_at AT TIME ZONE 'Asia/Riyadh','YYYY-MM-DD HH24:MI'), coalesce(E'\nملاحظات: '||nullif(trim(p_notes),''),'')), 'return_request', rid);
  RETURN rid;
END $$;

CREATE OR REPLACE FUNCTION public.create_return_trip(p_trip_id uuid, p_start timestamptz, p_end timestamptz, p_origin_location uuid, p_dest_location uuid, p_distance numeric, p_request_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE t record; o record; d record; nid uuid;
BEGIN
  IF NOT has_any_role(auth.uid(), '{owner,ops_manager,dispatcher}') THEN RAISE EXCEPTION 'ليست لديك صلاحية'; END IF;
  SELECT * INTO t FROM trips WHERE id=p_trip_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'الرحلة غير موجودة'; END IF;
  IF EXISTS (SELECT 1 FROM trips WHERE parent_trip_id=p_trip_id AND status<>'cancelled') THEN RAISE EXCEPTION 'رحلة الرجوع موجودة بالفعل'; END IF;
  SELECT * INTO o FROM locations WHERE id=p_origin_location;
  SELECT * INTO d FROM locations WHERE id=p_dest_location;
  INSERT INTO trips(origin_city, dest_city, origin_location_id, dest_location_id, planned_start, planned_end, distance_km, parent_trip_id, is_empty, empty_reason, status)
  VALUES (coalesce(o.city, t.dest_city), coalesce(d.city, t.origin_city), coalesce(p_origin_location, t.dest_location_id), coalesce(p_dest_location, t.origin_location_id),
          p_start, p_end, coalesce(p_distance, t.distance_km), p_trip_id, true, 'رحلة رجوع', 'draft')
  RETURNING id INTO nid;
  IF t.driver_id IS NOT NULL AND t.tractor_id IS NOT NULL THEN
    PERFORM assign_trip_resources(nid, t.driver_id, t.tractor_id, t.trailer_id, p_start, p_end, NULL);
  END IF;
  IF p_request_id IS NOT NULL THEN
    UPDATE return_requests SET status='approved', return_trip_id=nid, reviewed_by=auth.uid(), reviewed_at=now() WHERE id=p_request_id AND trip_id=p_trip_id AND status='pending';
  END IF;
  RETURN nid;
END $$;

CREATE OR REPLACE FUNCTION public.reject_return_request(p_request_id uuid, p_reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r record; dp text; tn text;
BEGIN
  IF NOT has_any_role(auth.uid(), '{owner,ops_manager,dispatcher}') THEN RAISE EXCEPTION 'ليست لديك صلاحية'; END IF;
  UPDATE return_requests SET status='rejected', reviewed_by=auth.uid(), reviewed_at=now(), notes=concat_ws(' | ', notes, 'سبب الرفض: '||nullif(trim(p_reason),'')) WHERE id=p_request_id AND status='pending' RETURNING * INTO r;
  IF NOT FOUND THEN RAISE EXCEPTION 'الطلب غير موجود أو تمت مراجعته'; END IF;
  SELECT phone INTO dp FROM drivers WHERE id=r.driver_id;
  SELECT number INTO tn FROM trips WHERE id=r.trip_id;
  PERFORM wa_enqueue(dp, format(E'لم تتم الموافقة على طلب الرجوع للرحلة %s%s', tn, coalesce(E'\nالسبب: '||nullif(trim(p_reason),''),'')), 'return_rejected', r.id);
END $$;

REVOKE ALL ON FUNCTION public.driver_request_return(uuid,timestamptz,text), public.create_return_trip(uuid,timestamptz,timestamptz,uuid,uuid,numeric,uuid), public.reject_return_request(uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.driver_request_return(uuid,timestamptz,text), public.create_return_trip(uuid,timestamptz,timestamptz,uuid,uuid,numeric,uuid), public.reject_return_request(uuid,text) TO authenticated;