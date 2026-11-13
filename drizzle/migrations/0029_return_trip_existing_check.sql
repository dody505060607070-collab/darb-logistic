CREATE OR REPLACE FUNCTION public.create_return_trip(p_trip_id uuid, p_start timestamptz, p_end timestamptz, p_origin_location uuid, p_dest_location uuid, p_distance numeric, p_request_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE t record; o record; d record; nid uuid;
BEGIN
  IF NOT has_any_role(auth.uid(), '{owner,ops_manager,dispatcher}') THEN RAISE EXCEPTION 'ليست لديك صلاحية'; END IF;
  SELECT * INTO t FROM trips WHERE id=p_trip_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'الرحلة غير موجودة'; END IF;
  IF EXISTS (SELECT 1 FROM trips WHERE parent_trip_id=p_trip_id AND empty_reason='رحلة رجوع' AND status<>'cancelled') THEN RAISE EXCEPTION 'رحلة الرجوع موجودة بالفعل'; END IF;
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

CREATE OR REPLACE FUNCTION public.driver_request_return(p_trip_id uuid, p_depart_at timestamptz, p_notes text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE t record; rid uuid; dn text;
BEGIN
  SELECT * INTO t FROM trips WHERE id=p_trip_id;
  IF NOT FOUND OR t.driver_id IS DISTINCT FROM current_driver_id() THEN RAISE EXCEPTION 'هذه الرحلة ليست لك'; END IF;
  IF t.status NOT IN ('in_progress','delivered','closed') THEN RAISE EXCEPTION 'يمكن طلب الرجوع بعد بدء الرحلة'; END IF;
  IF EXISTS (SELECT 1 FROM trips WHERE parent_trip_id=p_trip_id AND empty_reason='رحلة رجوع' AND status<>'cancelled') THEN RAISE EXCEPTION 'رحلة الرجوع موجودة بالفعل'; END IF;
  IF p_depart_at IS NULL THEN RAISE EXCEPTION 'حدد موعد الرجوع'; END IF;
  INSERT INTO return_requests(trip_id, driver_id, depart_at, notes) VALUES (p_trip_id, t.driver_id, p_depart_at, nullif(trim(p_notes),'')) RETURNING id INTO rid;
  SELECT full_name INTO dn FROM drivers WHERE id=t.driver_id;
  PERFORM wa_admins(format(E'↩️ طلب رحلة رجوع من %s\nالرحلة %s (%s ← %s)\nموعد الرجوع المطلوب: %s%s\nراجع الطلب في صفحة الرحلة.', coalesce(dn,'السائق'), t.number, t.dest_city, t.origin_city, to_char(p_depart_at AT TIME ZONE 'Asia/Riyadh','YYYY-MM-DD HH24:MI'), coalesce(E'\nملاحظات: '||nullif(trim(p_notes),''),'')), 'return_request', rid);
  RETURN rid;
END $$;